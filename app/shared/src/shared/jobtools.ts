import { ensureDir, exists } from "std/fs";
import { dirname } from "std/path";
import { retryAsync } from "retry";
import { crypto } from "@std/crypto";
import { encodeHex } from "@std/encoding";
import { LRUCache } from "lru-cache";

import { decodeBase64 } from "/@/shared/base64.ts";
import {
  ENV_VAR_DATA_ITEM_LENGTH_MAX,
  fetchBlobFromHash,
} from "/@/shared/dataref.ts";
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
import {
  fetchRobust,
  sanitizeFilename,
  sha256Stream,
  shaDockerJob,
} from "/@/shared/util.ts";

const TMPDIR = "/tmp/worker-metapage-io";

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

// "-L" == follow redirects, very important
let BaseCurlUploadArgs = ["-X", "PUT", "-L", "--upload-file"];
// curl hard codes .localhost DNS resolution, so we need to add the resolve flags
// I tried using something other than .localhost, but it didn't work for all kinds of reasons
if (IGNORE_CERTIFICATE_ERRORS) {
  // add the resolve flags from the /etc/hosts file
  // APP_PORT is only needed for the upload/curl/dns/docker fiasco
  const APP_PORT = Deno.env.get("APP_PORT") || "443";
  const hostsFileContents = Deno.readTextFileSync("/etc/hosts");
  const hostsFileLines = hostsFileContents.split("\n");
  const resolveFlags = hostsFileLines
    .filter((line: string) => line.includes("worker-metaframe.localhost"))
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
            `Failed attempt ${count} to upload ${file} to ${uploadUrl} code=${code} stdout=${
              new TextDecoder().decode(
                stdout,
              )
            } stderr=${new TextDecoder().decode(stderr)} command='curl ${
              args.join(" ")
            }'`,
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
      if (ref.hash) {
        const sanitizedHash = sanitizeFilename(ref.hash);
        const cachedFilePath = `${TMPDIR}/cache/${sanitizedHash}`;
        const cacheExists = await exists(cachedFilePath);

        if (cacheExists) {
          try {
            await Deno.link(cachedFilePath, filename);
            console.log(
              `Hard link created from cache for hash ${ref.hash} to ${filename}.`,
            );
            return;
          } catch (linkError) {
            console.error(
              `Failed to create hard link from cache for hash ${ref.hash}:`,
              linkError,
            );
            throw linkError;
          }
        } else {
          console.log(
            `Cache miss for hash ${ref.hash}. Proceeding to download.`,
          );
        }
      }

      try {
        // Download the file to the desired filename
        const arrayBufferFromUrl =
          (await fetchRobust(ref.value as string)).body;
        if (!arrayBufferFromUrl) {
          throw new Error(`Failed to fetch data from URL ${ref.value}`);
        }
        await Deno.writeFile(filename, arrayBufferFromUrl, {
          mode: 0o644,
        });
        console.log(`Downloaded and wrote data to ${filename}.`);

        if (ref.hash) {
          const computedHash = await sha256Stream(arrayBufferFromUrl);
          const sanitizedHash = sanitizeFilename(computedHash);
          const cachedFilePath = `${TMPDIR}/cache/${sanitizedHash}`;
          const cacheExists = await exists(cachedFilePath);

          if (cacheExists) {
            // Delete the downloaded file and create a hard link from cache
            await Deno.remove(filename);
            await Deno.link(cachedFilePath, filename);
            console.log(
              `Deleted downloaded file. Created hard link from cache for hash ${computedHash} to ${filename}.`,
            );
          } else {
            // Create a hard link from the downloaded file to cache
            await ensureDir(`${TMPDIR}/cache`);
            await Deno.link(filename, cachedFilePath);
            console.log(
              `Created hard link from ${filename} to cache at ${cachedFilePath}.`,
            );
          }
        }

        return;
      } catch (downloadError) {
        errString =
          `Failed to download and cache data from URL ${ref.value}: ${downloadError}`;
        console.error(errString);
        throw new Error(errString);
      }
    }
    case DataRefType.key: {
      try {
        const arrayBufferFromKey = await fetchBlobFromHash(
          ref.value,
          address || "https://container.mtfm.io",
        );
        await Deno.writeFile(filename, new Uint8Array(arrayBufferFromKey), {
          mode: 0o777,
        });
        return;
      } catch (keyError) {
        errString =
          `Failed to fetch blob from hash for key ${ref.value}: ${keyError}`;
        console.error(errString);
        throw new Error(errString);
      }
    }
    default:
      throw new Error(
        `Not yet implemented: DataRef.type "${ref.type}" unknown`,
      );
  }
};

const hashFileOnDisk = async (filePath: string): Promise<string> => {
  const file = await Deno.open(filePath, { read: true });
  const readableStream = file.readable;
  const fileHashBuffer = await crypto.subtle.digest("SHA-256", readableStream);
  const fileHash = encodeHex(fileHashBuffer);
  return fileHash;
};
