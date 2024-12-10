import {
  emptyDir,
  ensureDir,
  exists,
} from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import klaw from "npm:klaw@4.1.0";

import { config } from "../config.ts";
import {
  dataRefToFile,
  DockerJobDefinitionInputRefs,
  DockerJobDefinitionRow,
  fileToDataref,
  InputsRefs,
} from "../shared/mod.ts";
import { Volume } from "./DockerJob.ts";

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
  const configFilesDir = join(baseDir, "configFiles");
  const inputsDir = join(baseDir, "inputs");
  const outputsDir = join(baseDir, "outputs");

  // create the tmp directory for inputs+outputs
  await ensureDir(configFilesDir);
  await ensureDir(inputsDir);
  await ensureDir(outputsDir);

  // security/consistency: empty directories, in case restarting jobs
  await emptyDir(configFilesDir);
  await emptyDir(inputsDir);
  await ensureDir(outputsDir);

  // make sure directories are writable
  await Deno.chmod(configFilesDir, 0o777);
  await Deno.chmod(inputsDir, 0o777);
  await Deno.chmod(outputsDir, 0o777);

  console.log(
    `[${workerId.substring(0, 6)}] [${
      id.substring(0, 6)
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
      let hostFilePath = isAbsolutePath
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
    // This will send big blobs to the cloud
    const ref = await fileToDataref(file, config.server);
    outputs[file.replace(`${outputsDir}/`, "")] = ref;
  }

  console.log(
    `[${workerId.substring(0, 6)}] [${job.hash.substring(0, 6)}] outputs:[${
      Object.keys(outputs).join(",").substring(
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
      .on("data", (item: any) => {
        if (item && !item.stats.isDirectory()) files.push(item.path);
      })
      .on("error", (err: any, item: any) => {
        console.error(`error on item`, item);
        console.error(err);
        reject(err);
      })
      .on("end", () => resolve(files));
  });
};
