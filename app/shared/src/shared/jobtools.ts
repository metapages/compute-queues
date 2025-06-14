import { crypto } from "@std/crypto";
import { encodeHex } from "@std/encoding";
import { retryAsync } from "retry";
import { ensureDir, ensureDirSync, exists, existsSync } from "std/fs";
import { dirname } from "std/path";

import { join } from "std/path";
import { decodeBase64 } from "/@/shared/base64.ts";
import {
  ENV_VAR_DATA_ITEM_LENGTH_MAX,
  fetchBlobFromHash,
} from "/@/shared/dataref.ts";
import {
  type DataRef,
  DataRefType,
  type DockerJobControlConfig,
  type DockerJobDefinitionInputRefs,
  DockerJobState,
  type StateChange,
  type StateChangeValueFinished,
  type StateChangeValueQueued,
  type WebsocketMessageClientToServer,
  WebsocketMessageTypeClientToServer,
} from "/@/shared/types.ts";
import { sanitizeFilename, shaDockerJob } from "/@/shared/util.ts";

const IGNORE_CERTIFICATE_ERRORS: boolean =
  Deno.env.get("IGNORE_CERTIFICATE_ERRORS") === "true";

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
  namespace?: string;
  control?: DockerJobControlConfig;
}): Promise<{
  message: WebsocketMessageClientToServer;
  jobId: string;
  stageChange: StateChange;
  queuedJob?: StateChangeValueQueued;
}> => {
  let { definition, debug, jobId, namespace, control } = opts;
  const value: StateChangeValueQueued = {
    definition,
    debug,
    time: Date.now(),
    namespace,
    control,
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
  return { message, jobId, stageChange: payload, queuedJob: value };
};

export const bufferToBase64Ref = (
  buffer: Uint8Array,
): DataRef => {
  const value = btoa(String.fromCharCode.apply(null, [...buffer]));
  return {
    value,
    type: DataRefType.base64,
  };
};

// "-L" == follow redirects, very important
let BaseCurlUploadArgs = [
  "-X",
  "PUT",
  "--location",
  "--fail-with-body",
  "--upload-file",
];
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
    const existsUrl = `${address}/api/v1/exists/${hash}`;
    const existsResponse = await fetch(existsUrl);
    if (existsResponse.status === 200) {
      existsResponse.body?.cancel();
      const existsRef: DataRef = {
        value: hash,
        type: DataRefType.key,
      };
      return existsRef;
    }
    existsResponse.body?.cancel();

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
              ).substring(0, 1000)
            } stderr=${
              new TextDecoder().decode(stderr).substring(0, 1000)
            } command='curl ${args.join(" ")}'`,
          );
        }
      },
      { delay: 2000, maxTry: 20 },
    );

    const actualAddress = Deno.env.get("DEV_ONLY_EXTERNAL_SERVER_ADDRESS") ||
      address;

    const dataRef: DataRef = {
      value: `${actualAddress}/api/v1/download/${hash}`,
      type: DataRefType.url,
    };
    return dataRef;
  } else {
    const fileBuffer: Uint8Array = await Deno.readFile(file);
    const ref: DataRef = bufferToBase64Ref(fileBuffer);
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
 * @param dataDirectory
 * @returns
 */
export const dataRefToFile = async (
  ref: DataRef,
  filename: string,
  address: string,
  dataDirectory: string = "/tmp/worker-metapage-io",
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
      // console.log(`🐸🐪 dataRefToFile ref`, ref);
      const url: string = ref.value;
      let hash = /\/api\/v1\/download\/([0-9a-z]+)[\/$]?/.exec(
        new URL(url).pathname,
      )?.[1];
      // console.log(`🐸🐪 dataRefToFile hash`, hash);
      if (!hash) {
        hash = ref.hash;
      }

      if (hash) {
        const sanitizedHash = sanitizeFilename(hash);
        // console.log(`🐸🐪 dataRefToFile sanitizedHash`, sanitizedHash);
        const cachedFilePath = join(dataDirectory, "cache", sanitizedHash);
        // console.log(`🐸🐪 dataRefToFile cachedFilePath`, cachedFilePath);
        const cacheExists = existsSync(cachedFilePath);

        if (cacheExists) {
          try {
            Deno.removeSync(filename);
          } catch (_) {
            // swallow error
          }
          try {
            const fileDirName = dirname(filename);
            if (fileDirName && fileDirName !== "." && fileDirName !== "/") {
              ensureDirSync(fileDirName);
            }
            Deno.linkSync(cachedFilePath, filename);
            console.log(
              `Hard link created from cache for hash ${hash} to ${filename}.`,
            );
            return;
          } catch (linkError) {
            console.error(
              `Failed to create hard link from cache for hash ${hash}:`,
              linkError,
            );
            throw linkError;
          }
        } else {
          console.log(
            `Cache miss for hash ${hash}. Proceeding to download.`,
          );
        }
      }

      try {
        // Download the file to the desired filename

        let count = 0;
        await retryAsync(
          async () => {
            let file: Deno.FsFile | null = null;
            try {
              const fileResponse = await fetch(url, {
                redirect: "follow",
                headers: {
                  // https://github.com/denoland/deno/issues/25992#issuecomment-2713481177
                  // We hit the same issues as described above
                  // This is a workaround to avoid the issue
                  "accept-encoding": "identity",
                },
              });

              if (fileResponse.ok && fileResponse.body) {
                file = await Deno.open(filename, {
                  write: true,
                  create: true,
                  mode: 0o644,
                });
                await fileResponse.body.pipeTo(file.writable);
              }
            } catch (error) {
              count++;
              throw new Error(
                `Failed attempt ${count} to download ${url}: ${error}`,
              );
            } finally {
              if (file) {
                try {
                  // https://github.com/denoland/deno/issues/14210
                  file.close();
                } catch (_) {
                  // pass
                }
              }
            }
          },
          { delay: 1000, maxTry: 5 },
        );

        // console.log(`Downloaded and wrote data to ${filename}.`);

        hash = hash || (await hashFileOnDisk(filename));

        if (hash) {
          const sanitizedHash = sanitizeFilename(hash);
          const cachedFilePath = join(dataDirectory, "cache", sanitizedHash);
          const cacheExists = await exists(cachedFilePath);

          if (cacheExists) {
            // Delete the downloaded file and create a hard link from cache
            await Deno.remove(filename);
            await Deno.link(cachedFilePath, filename);
            console.log(
              `Deleted downloaded file. Created hard link from cache for hash ${hash} to ${filename}.`,
            );
          } else {
            // Create a hard link from the downloaded file to cache
            await ensureDir(join(dataDirectory, "cache"));
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

export const hashFileOnDisk: (filePath: string) => Promise<string> = async (
  filePath: string,
): Promise<string> => {
  const file = await Deno.open(filePath, { read: true });
  const readableStream = file.readable;
  const fileHashBuffer = await crypto.subtle.digest("SHA-256", readableStream);
  const fileHash = encodeHex(fileHashBuffer);
  try {
    // https://github.com/denoland/deno/issues/14210
    file.close();
  } catch (_) {
    // pass
  }
  return fileHash;
};
