import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { retryAsync } from "https://deno.land/x/retry@v2.0.0/mod.ts";
import { crypto } from "jsr:@std/crypto@1.0.3";
import { encodeHex } from "jsr:@std/encoding@1.0.3";
import { LRUCache } from "npm:lru-cache@11.0.1";

import { decodeBase64 } from "./base64.ts";
import { ENV_VAR_DATA_ITEM_LENGTH_MAX } from "./dataref.ts";
import {
  DataRef,
  DataRefType,
  DockerJobDefinitionInputRefs,
  DockerJobState,
  StateChange,
  StateChangeValueFinished,
  StateChangeValueQueued,
  WebsocketMessageClientToServer,
  WebsocketMessageTypeClientToServer,
} from "./types.ts";
import { fetchRobust as fetch, shaDockerJob } from "./util.ts";

const IGNORE_CERTIFICATE_ERRORS: boolean =
  Deno.env.get("IGNORE_CERTIFICATE_ERRORS") === "true";

const FileHashesUploaded = new LRUCache<string, boolean>({
  max: 10000,
  ttl: 1000 * 60 * 60 * 24 * 6, // 6 days, less than the time (one week) that the server will keep the file
});

/**
 * If two workers claim a job, this function will resolve which worker should take the job.
 * @param workerA
 * @param workerB
 * @returns preferred worker id
 */
export const resolvePreferredWorker = (workerA: string, workerB: string) => {
  return workerA.localeCompare(workerB) < 0 ? workerA : workerB;
};

export const createNewContainerJobMessage = async (opts: {
  definition: DockerJobDefinitionInputRefs;
  debug?: boolean;
  jobId?: string;
  source?: string;
}): Promise<{
  message: WebsocketMessageClientToServer;
  jobId: string;
  stageChange: StateChange;
}> => {
  let { definition, debug, jobId, source } = opts;
  const value: StateChangeValueQueued = {
    definition,
    debug,
    time: Date.now(),
    source,
  };
  if (!jobId) {
    jobId = await shaDockerJob(definition);
  }
  const payload: StateChange = {
    state: DockerJobState.Queued,
    value,
    job: jobId,
    tag: "",
  };

  const message: WebsocketMessageClientToServer = {
    payload,
    type: WebsocketMessageTypeClientToServer.StateChange,
  };
  return { message, jobId, stageChange: payload };
};

export const bufferToBase64Ref = async (
  buffer: Uint8Array,
): Promise<DataRef> => {
  var decoder = new TextDecoder("utf8");
  var value = btoa(decoder.decode(buffer));
  return {
    value,
    type: DataRefType.base64,
  };
};

// "-L" == follow redirects, very important
let BaseCurlUploadArgs = ["--fail-with-body", "-L", "--upload-file"];

// curl hard codes .localhost DNS resolution, so we need to add the resolve flags
// I tried using something other than .localhost, but it didn't work for all kinds of reasons
if (IGNORE_CERTIFICATE_ERRORS) {
  // add the resolve flags from the /etc/hosts file
  // APP_PORT is only needed for the upload/curl/dns/docker fiasco
  const APP_PORT = Deno.env.get("APP_PORT") || "443";
  const hostsFileContents = await Deno.readTextFile("/etc/hosts");
  const hostsFileLines = hostsFileContents.split("\n");
  const resolveFlags = hostsFileLines
    .filter((line: string) => line.includes("worker-metaframe"))
    .map((line: string) => line.split(/\s+/).filter((s) => !!s))
    .map((parts: string[]) => [
      "--resolve",
      `${parts[1]}:${APP_PORT}:${parts[0]}`,
    ])
    .flat();
  BaseCurlUploadArgs = [...resolveFlags, ...BaseCurlUploadArgs];
}

/**
 * Uses streams to upload files to the bucket
 * @param file
 * @param address
 * @returns
 */
export const fileToDataref = async (
  file: string,
  address: string,
): Promise<DataRef> => {
  const { size } = await Deno.stat(file);
  const hash = await hashFileOnDisk(file);

  if (size > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
    if (FileHashesUploaded.has(hash)) {
      const existsRef: DataRef = {
        value: hash,
        type: DataRefType.key,
      };
      return existsRef;
    }

    const uploadUrl = `${address}/api/v1/upload/${hash}`;

    // https://github.com/metapages/compute-queues/issues/46
    // Hack to stream upload files, since fetch doesn't seem
    // to support streaming uploads (even though it should)
    let count = 0;
    const args = IGNORE_CERTIFICATE_ERRORS
      ? [uploadUrl, "--insecure", ...BaseCurlUploadArgs, file]
      : [uploadUrl, ...BaseCurlUploadArgs, file];

    await retryAsync(
      async () => {
        const command = new Deno.Command("curl", {
          args,
        });
        const { success, stdout, stderr, code } = await command.output();
        if (!success) {
          count++;
          throw new Error(
            `Failed attempt ${count} with command='curl ${
              args.join(
                " ",
              )
            }' to upload ${file} to ${uploadUrl} code=${code} stdout=${
              new TextDecoder().decode(
                stdout,
              )
            } stderr=${new TextDecoder().decode(stderr)}`,
          );
        }
      },
      { delay: 1000, maxTry: 5 },
    );
    FileHashesUploaded.set(hash, true);

    const dataRef: DataRef = {
      value: `${address}/api/v1/download/${hash}`,
      type: DataRefType.url,
    };
    return dataRef;
  } else {
    const fileBuffer: Uint8Array = await Deno.readFile(file);
    const ref: DataRef = await bufferToBase64Ref(fileBuffer);
    return ref;
  }
};

export const finishedJobOutputsToFiles = async (
  finishedState: StateChangeValueFinished,
  outputsDirectory: string,
  address: string,
): Promise<void> => {
  const outputs = finishedState.result?.outputs;
  if (!outputs) {
    return;
  }

  await Promise.all(
    Object.keys(outputs).map(async (name) => {
      await ensureDir(outputsDirectory);
      const ref = outputs[name];
      const filename = `${outputsDirectory}/${name}`;
      await dataRefToFile(ref, filename, address);
    }),
  );
};

/**
 * Copies the data from a DataRef to a file
 * @param ref
 * @param filename
 * @param address
 * @returns
 */
export const dataRefToFile = async (
  ref: DataRef,
  filename: string,
  address: string,
): Promise<void> => {
  const dir = dirname(filename);
  await ensureDir(dir);
  let errString: string;
  switch (ref.type) {
    case DataRefType.base64:
      const bytes = decodeBase64(ref.value as string);
      await Deno.writeFile(filename, bytes, { mode: 0o644 });
      return;
    case DataRefType.utf8:
      await Deno.writeTextFile(filename, ref.value as string);
      return;
    case DataRefType.json:
      await Deno.writeTextFile(filename, JSON.stringify(ref.value));
      return;
    case DataRefType.url:
      const downloadFile = await Deno.open(filename, {
        create: true,
        write: true,
      });

      const responseUrl = await fetch(ref.value, { redirect: "follow" });
      if (!responseUrl.ok) {
        errString =
          `Failed to download="${ref.value}" status=${responseUrl.status} statusText=${responseUrl.statusText}`;
        console.error(errString);
        throw new Error(errString);
      }
      if (!responseUrl.body) {
        errString =
          `Failed to download="${ref.value}" status=${responseUrl.status} no body in response`;
        console.error(errString);
        throw new Error(errString);
      }

      await responseUrl.body.pipeTo(downloadFile.writable);

      return;
    case DataRefType.key:
      // we know how to get this internal cloud referenced
      const cloudRefUrl = `${address}/api/v1/download/${ref.value}`;
      const responseHashUrl = await fetch(cloudRefUrl, { redirect: "follow" });
      if (!responseHashUrl.ok) {
        throw new Error(
          `Failed to download="${cloudRefUrl}" status=${responseHashUrl.status} statusText=${responseHashUrl.statusText}`,
        );
      }
      if (!responseHashUrl.body) {
        throw new Error(
          `Failed to download="${cloudRefUrl}" status=${responseHashUrl.status} no body in response`,
        );
      }

      const downloadFileForHash = await Deno.open(filename, {
        create: true,
        write: true,
      });
      await responseHashUrl.body.pipeTo(downloadFileForHash.writable);
      break;
    default: // undefined assume DataRefType.Base64
      throw `Not yet implemented: DataRef.type === undefined or unrecognized value="${ref.type}"`;
  }
};

const hashFileOnDisk = async (filePath: string): Promise<string> => {
  const file = await Deno.open(filePath, { read: true });
  const readableStream = file.readable;
  const fileHashBuffer = await crypto.subtle.digest("SHA-256", readableStream);
  const fileHash = encodeHex(fileHashBuffer);
  return fileHash;
};
