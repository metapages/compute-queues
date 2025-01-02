import { emptyDir, ensureDir, exists } from "std/fs";
import { join } from "std/path";
import klaw from "klaw";

import { config } from "/@/config.ts";
import {
  dataRefToFile,
  DataRefType,
  type DockerJobDefinitionInputRefs,
  type DockerJobDefinitionRow,
  fileToDataref,
  type InputsRefs,
  sha256Buffer,
} from "@metapages/compute-queues-shared";
import type { Volume } from "/@/queue/DockerJob.ts";

const TMPDIR = "/tmp/worker-metapage-io";

function getJobBaseDir(jobId: string): string {
  if (config.mode === "local") {
    return `/app/data/${jobId}`; // <-- local mode location
  } else {
    return join(TMPDIR, jobId); // <-- non-local mode location
  }
}

export const convertIOToVolumeMounts = async (
  job: { id: string; definition: DockerJobDefinitionInputRefs },
  address: string,
  workerId: string,
): Promise<Volume[]> => {
  const { id, definition } = job;

  const baseDir = getJobBaseDir(id);
  const configFilesDir = join(baseDir, "configFiles");
  const inputsDir = join(baseDir, "inputs");
  const outputsDir = join(baseDir, "outputs");

  // Create directories
  await ensureDir(configFilesDir);
  await ensureDir(inputsDir);
  await ensureDir(outputsDir);

  // Security/consistency: empty them if we are reusing
  await emptyDir(configFilesDir);
  await emptyDir(inputsDir);
  // outputsDir is ensured but we don't want to empty it if we intend
  // to keep prior runs. If you want to always clear it, use emptyDir:
  // await emptyDir(outputsDir);

  // Make sure directories are writable
  await Deno.chmod(configFilesDir, 0o777);
  await Deno.chmod(inputsDir, 0o777);
  await Deno.chmod(outputsDir, 0o777);

  console.log(
    `[${workerId.substring(0, 6)}] [${
      id.substring(0, 6)
    }] creating\n\t ${inputsDir}\n\t ${outputsDir}\n\t ${configFilesDir}`,
  );

  // Copy the inputs (if any)
  const inputs = definition.inputs;
  if (inputs) {
    for (const [name, ref] of Object.entries(inputs)) {
      await dataRefToFile(ref, join(inputsDir, name), address);
    }
  }

  // Otherwise, return Docker volumes to mount
  const result = config.mode === "local" ? [] : [
    {
      host: inputsDir,
      container: "/inputs",
    },
    {
      host: outputsDir,
      container: "/outputs",
    },
  ];

  // Optionally handle configFiles
  if (definition?.configFiles) {
    for (const [name, ref] of Object.entries(definition.configFiles)) {
      const isAbsolutePath = name.startsWith("/");
      const hostFilePath = isAbsolutePath
        ? join(configFilesDir, name)
        : join(inputsDir, name);
      await dataRefToFile(ref, hostFilePath, address);

      // For absolute paths, also mount
      if (config.mode !== "local" && isAbsolutePath) {
        result.push({
          host: hostFilePath,
          container: name?.startsWith("/") ? name : `/inputs/${name}`,
        });
      }
    }
  }

  return result;
};

export const getOutputs = async (
  job: DockerJobDefinitionRow,
  workerId: string,
): Promise<InputsRefs> => {
  const baseDir = getJobBaseDir(job.hash);
  const outputsDir = join(baseDir, "outputs");

  // Gather outputs
  const outputs: InputsRefs = {};
  const files = await getFiles(outputsDir);

  // Decide local vs. remote
  if (config.mode === "local") {
    for (const file of files) {
      const relativePath = file.replace(`${outputsDir}/`, "");
      const hash = await sha256Buffer(await Deno.readFile(file));
      const cachePath = join("/app/data/cache", hash);

      // If the file with this hash is not already in cache, move it there
      const cacheExists = await exists(cachePath);
      if (!cacheExists) {
        // Rename the output file into the cache (moving the inode)
        await Deno.rename(file, cachePath);
      } else {
        // Already have this hash in cache
        // Remove the new output file so we can hard-link from cache
        await Deno.remove(file);
      }

      // Create a hard link from the cache to the original location
      // so that the "outputs" directory still has the file
      // but it doesn't take additional space.
      await Deno.link(cachePath, file);

      // Finally, store a local data ref with info
      outputs[relativePath] = {
        type: DataRefType.local,
        hash,
        value: relativePath,
      };
    }
  } else {
    for (const file of files) {
      const relativePath = file.replace(`${outputsDir}/`, "");
      // The existing approach: convert to a normal dataRef that points to the cloud
      const ref = await fileToDataref(file, config.server);
      outputs[relativePath] = ref;
    }
  }

  console.log(
    `[${workerId.substring(0, 6)}] [${job.hash.substring(0, 6)}] outputs:[${
      Object.keys(outputs).join(",").substring(0, 100)
    }]`,
  );
  return outputs;
};

const getFiles = async (path: string): Promise<string[]> => {
  const pathExists = await exists(path);
  if (!pathExists) {
    throw `getFiles path=${path} does not exist`;
  }
  return new Promise((resolve, reject) => {
    const files: string[] = [];
    klaw(path)
      .on("data", (item: unknown) => {
        if (
          typeof item === "object" &&
          item != null &&
          "stats" in item &&
          "path" in item &&
          typeof item.path === "string" &&
          item.stats != null &&
          typeof item.stats === "object" &&
          "isDirectory" in item.stats &&
          typeof item.stats.isDirectory === "function" &&
          !item.stats.isDirectory()
        ) {
          files.push(item.path);
        }
      })
      .on("error", (err: unknown, item: unknown) => {
        console.error(`error on item`, item);
        console.error(err);
        reject(err);
      })
      .on("end", () => resolve(files));
  });
};
