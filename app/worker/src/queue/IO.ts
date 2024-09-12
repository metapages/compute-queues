import {
  emptyDir,
  ensureDir,
  exists,
} from 'https://deno.land/std@0.224.0/fs/mod.ts';
import { join } from 'https://deno.land/std@0.224.0/path/mod.ts';
import klaw from 'npm:klaw@4.1.0';

import { config } from '../config.ts';
import {
  DataRef,
  dataRefToFile,
  DockerJobDefinitionInputRefs,
  DockerJobDefinitionRow,
  fileToDataref,
  InputsRefs,
} from '../shared/mod.ts';
import { Volume } from './DockerJob.ts';

// const TMPDIR = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp';
const TMPDIR = "/tmp/asman";

/**
 *
 * @param job Returns input and output docker volumes to mount into the container
 */
export const convertIOToVolumeMounts = async (
  job: {id:string, definition: DockerJobDefinitionInputRefs},
  address: string,
  workerId: string
): Promise<{ inputs: Volume; outputs: Volume }> => {
  const { id , definition } = job;
  const baseDir = join(TMPDIR, id);
  const inputsDir = join(baseDir, "inputs");
  const outputsDir = join(baseDir, "outputs");

  // create the tmp directory for inputs+outputs
  await ensureDir(inputsDir);
  await ensureDir(outputsDir);

  // security/consistency: empty directories, in case restarting jobs
  await emptyDir(inputsDir);
  await ensureDir(outputsDir);

  // make sure directories are writable
  await Deno.chmod(inputsDir, 0o777);
  await Deno.chmod(outputsDir, 0o777);

  console.log(`[${workerId.substring(0, 6)}] [${id.substring(0, 6)}] creating\n\t ${inputsDir}\n\t ${outputsDir}`);

  // copy the inputs (if any)
  const inputs = definition.inputs;

  if (inputs) {
    for (const [name, inputRef] of Object.entries(inputs)) {
      const ref: DataRef = inputs[name];
      await dataRefToFile(ref, join(inputsDir, name), address);
    }
  }

  const result = {
    inputs: {
      host: inputsDir,
      // TODO: allow this to be configurable
      container: "/inputs",
    },
    outputs: {
      host: outputsDir,
      // TODO: allow this to be configurable
      container: "/outputs",
    },
  };

  return result;
};

export const getOutputs = async (job: DockerJobDefinitionRow, workerId:string
  
): Promise<InputsRefs> => {
  // TODO: duplicate code
  const baseDir = join(TMPDIR, job.hash);
  const outputsDir = join(baseDir, "outputs");

  // copy the inputs (if any)
  const outputs: InputsRefs = {};

  const files = await getFiles(outputsDir);

  for (const file of files) {
    // TODO: handle BIG blobs
    const ref = await fileToDataref(file, config.server);
    // const fileBuffer: Buffer = await fse.readFile(file);
    // const ref: DataRef = await bufferToBase64Ref(fileBuffer);
    outputs[file.replace(`${outputsDir}/`, "")] = ref;
  }

  console.log(
    `[${workerId.substring(0,6)}] [${job.hash.substring(0,6)}] outputs:[${Object.keys(outputs).join(",").substring(
      0,
      100
    )}]`
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
      .on("data", (item :any) => {
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
