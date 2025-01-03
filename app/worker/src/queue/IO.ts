import { emptyDir, ensureDir, exists } from "std/fs";
import { dirname, join } from "std/path";
import klaw from "klaw";

import { config } from "/@/config.ts";
import {
  type DataRef,
  dataRefToFile,
  DataRefType,
  type DockerJobDefinitionInputRefs,
  type DockerJobDefinitionRow,
  fileToDataref,
  hashFileOnDisk,
  type InputsRefs,
  sanitizeFilename,
} from "@metapages/compute-queues-shared";
import type { Volume } from "/@/queue/DockerJob.ts";

// const TMPDIR = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp';
const TMPDIR = "/tmp/worker-metapage-io";

/**
 * @param job Returns input and output docker volumes to mount into the container
 */
export const convertIOToVolumeMounts = async (
  job: { id: string; definition: DockerJobDefinitionInputRefs },
  address: string,
  workerId: string,
): Promise<Volume[]> => {
  const { id, definition } = job;
  const baseDir = join(TMPDIR, id);
  const cacheDir = join(TMPDIR, "cache");
  const configFilesDir = join(baseDir, "configFiles");
  const inputsDir = join(baseDir, "inputs");
  const outputsDir = join(baseDir, "outputs");

  // create the tmp directory for inputs+outputs
  await ensureDir(cacheDir);
  await ensureDir(configFilesDir);
  await ensureDir(inputsDir);
  await ensureDir(outputsDir);

  // security/consistency: empty directories, in case restarting jobs
  await emptyDir(configFilesDir);
  await emptyDir(inputsDir);
  // await emptyDir(outputsDir);

  // make sure directories are writable
  await Deno.chmod(baseDir, 0o777);
  await Deno.chmod(configFilesDir, 0o777);
  await Deno.chmod(inputsDir, 0o777);
  await Deno.chmod(outputsDir, 0o777);

  console.log(
    `[${workerId.substring(0, 6)}] [${id.substring(0, 6)
    }] creating\n\t ${inputsDir}\n\t ${outputsDir}\n\t ${configFilesDir}`,
  );

  // copy the inputs (if any)
  const inputs = definition.inputs;

  if (inputs) {
    for (const [name, ref] of Object.entries(inputs)) {
      await dataRefToFile(ref, join(inputsDir, name), address);
    }
  }
  const result: Volume[] = [
    {
      host: inputsDir,
      // TODO: allow this to be configurable
      container: "/inputs",
    },
    {
      host: outputsDir,
      // TODO: allow this to be configurable
      container: "/outputs",
    },
  ];

  if (definition?.configFiles) {
    for (const [name, ref] of Object.entries(definition.configFiles)) {
      const isAbsolutePath = name.startsWith("/");
      const hostFilePath = isAbsolutePath
        ? join(configFilesDir, name)
        : join(inputsDir, name);
      await dataRefToFile(ref, hostFilePath, address);
      // /inputs are already mounted in
      if (isAbsolutePath) {
        result.push({
          host: hostFilePath,
          container: name?.startsWith("/") ? name : `/inputs/${name}`,
        });
      }
    }
  }

  return result;
};

const getLocalDataRef = async (file: string, address: string) => {
  const hash = await hashFileOnDisk(file);
  const sanitizedHash = sanitizeFilename(hash);
  const cachedFilePath = `${TMPDIR}/cache/${sanitizedHash}`;
  await ensureDir(dirname(cachedFilePath));

  if (await exists(cachedFilePath)) {
    await Deno.remove(file);
    await Deno.link(cachedFilePath, file);
  } else {
    await Deno.link(file, cachedFilePath);
  }

  const dataRef: DataRef = {
    value: `${address}/api/v1/download/${sanitizedHash}`,
    type: DataRefType.url,
    hash,
  };
  return dataRef;
};

/**
 * Converts file outputs to datarefs (small JSON references to files in the cloud)
 * @param job
 * @param workerId
 * @returns
 */
export const getOutputs = async (
  job: DockerJobDefinitionRow,
  workerId: string,
): Promise<InputsRefs> => {
  // TODO: duplicate code
  const baseDir = join(TMPDIR, job.hash);
  const outputsDir = join(baseDir, "outputs");

  // copy the inputs (if any)
  const outputs: InputsRefs = {};

  const files = await getFiles(outputsDir);

  for (const file of files) {
    // This will send big blobs to the cloud unless local mode
    const ref = await (config.mode === "local"
      ? getLocalDataRef(file, config.server)
      : fileToDataref(file, config.server));
    outputs[file.replace(`${outputsDir}/`, "")] = ref;
  }

  console.log(
    `[${workerId.substring(0, 6)}] [${job.hash.substring(0, 6)}] outputs:[${Object.keys(outputs).join(",").substring(
      0,
      100,
    )
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
    const files: string[] = []; // files, full path
    klaw(path)
      // .pipe(excludeDirFilter)
      .on("data", (item: { stats: { isDirectory: () => boolean }, path: string }) => {
        if (item && !item.stats.isDirectory()) files.push(item.path);
      })
      .on("error", (err: unknown, item: unknown) => {
        console.error(`error on item`, item);
        console.error(err);
        reject(err);
      })
      .on("end", () => resolve(files));
  });
};
