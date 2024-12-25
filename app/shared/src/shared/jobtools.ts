import { ensureDir } from "std/fs";
import { dirname } from "std/path";
import { retryAsync } from "retry";
import { crypto } from "@std/crypto";
import { encodeHex } from "@std/encoding";
import { LRUCache } from "lru-cache";

import { decodeBase64 } from "/@/shared/base64.ts";
import { ENV_VAR_DATA_ITEM_LENGTH_MAX } from "/@/shared/dataref.ts";
import {
  type DataRef,
  DataRefType,
  type DockerJobDefinitionInputRefs,
  DockerJobState,
  type StateChange,
  type StateChangeValueFinished,
  type StateChangeValueQueued,
  type WebsocketMessageClientToServer,
  WebsocketMessageTypeClientToServer,
} from "/@/shared/types.ts";
import { fetchRobust as fetch, shaDockerJob } from "/@/shared/util.ts";

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
export const resolvePreferredWorker = (
  workerA: string,
  workerB: string,
): string => {
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

export const bufferToBase64Ref = (
  buffer: Uint8Array,
): DataRef => {
  const decoder = new TextDecoder("utf8");
  const value = btoa(decoder.decode(buffer));
  return {
    value,
    type: DataRefType.base64,
  };
};

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

    const urlGetUpload = `${address}/upload/${hash}`;
    // @ts-ignore: TS2353
    const resp = await fetch(urlGetUpload, { redirect: "follow" });
    if (!resp.ok) {
      throw new Error(
        `Failed to get upload URL from ${urlGetUpload} status=${resp.status}`,
      );
    }

    const json: { url: string; ref: DataRef } = await resp.json();

    // https://github.com/metapages/compute-queues/issues/46
    // Hack to stream upload files, since fetch doesn't seem
    // to support streaming uploads (even though it should)
    let count = 0;
    const args = IGNORE_CERTIFICATE_ERRORS
      ? [json.url, "--insecure", "--upload-file", file]
      : [json.url, "--upload-file", file];
    await retryAsync(async () => {
      const command = new Deno.Command("curl", {
        args,
      });
      const { success, stdout, stderr, code } = await command.output();
      if (!success) {
        count++;
        throw new Error(
          `Failed attempt ${count} to upload ${file} to ${json.url} code=${code} stdout=${
            new TextDecoder().decode(stdout)
          } stderr=${new TextDecoder().decode(stderr)}`,
        );
      }
    }, { delay: 1000, maxTry: 5 });
    FileHashesUploaded.set(hash, true);

    return json.ref; // the server gave us this ref to use
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
    case DataRefType.base64: {
      const bytes = decodeBase64(ref.value as string);
      await Deno.writeFile(filename, bytes, { mode: 0o644 });
      return;
    }
    case DataRefType.utf8: {
      await Deno.writeTextFile(filename, ref.value as string);
      return;
    }
    case DataRefType.json: {
      await Deno.writeTextFile(filename, JSON.stringify(ref.value));
      return;
    }
    case DataRefType.url: {
      const downloadFile = await Deno.open(filename, {
        create: true,
        write: true,
      });

      // @ts-ignore: TS2353
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
    }
    case DataRefType.key: {
      // we know how to get this internal cloud referenced
      const cloudRefUrl = `${address}/download/${ref.value}`;
      // @ts-ignore: TS2353
      const responseHash = await fetch(cloudRefUrl, { redirect: "follow" });

      const json: { url: string; ref: DataRef } = await responseHash.json();
      // @ts-ignore: TS2353
      const responseHashUrl = await fetch(json.url, { redirect: "follow" });
      if (!responseHashUrl.ok) {
        throw new Error(
          `Failed to download="${json.url}" status=${responseHashUrl.status} statusText=${responseHashUrl.statusText}`,
        );
      }
      if (!responseHashUrl.body) {
        throw new Error(
          `Failed to download="${json.url}" status=${responseHashUrl.status} no body in response`,
        );
      }

      const downloadFileForHash = await Deno.open(filename, {
        create: true,
        write: true,
      });
      await responseHashUrl.body.pipeTo(downloadFileForHash.writable);
      return;
    }
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
