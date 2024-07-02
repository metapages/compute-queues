import { ensureDir } from 'https://deno.land/std@0.224.0/fs/ensure_dir.ts';
import { dirname } from 'https://deno.land/std@0.224.0/path/mod.ts';
import objectHash from 'object-hash';

import { decodeBase64 } from './base64.ts';
import { ENV_VAR_DATA_ITEM_LENGTH_MAX } from './dataref.ts';
import {
  DataRef,
  DataRefType,
  DockerJobDefinitionInputRefs,
  DockerJobState,
  StateChange,
  StateChangeValueQueued,
  StateChangeValueWorkerFinished,
  WebsocketMessageClientToServer,
  WebsocketMessageTypeClientToServer,
} from './types.ts';
import {
  fetchRobust as fetch,
  shaObject,
} from './util.ts';

/**
 * If two workers claim a job, this function will resolve which worker should take the job.
 * @param workerA 
 * @param workerB 
 * @returns preferred worker id
 */
export const resolvePreferredWorker = (workerA :string, workerB:string) => {
  return workerA.localeCompare(workerB) < 0 ? workerA : workerB;
}

export const createNewContainerJobMessage = async (opts: {
  definition: DockerJobDefinitionInputRefs;
  debug?: boolean;
  jobId?: string;
}) :Promise<{message:WebsocketMessageClientToServer, jobId:string, stageChange:StateChange}> => {
  let { definition, debug, jobId } = opts;
  const value: StateChangeValueQueued = {
    definition,
    debug,
    time: Date.now(),
  };
  if (!jobId) {
    jobId = await shaObject(definition);
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
  return {message, jobId, stageChange:payload};
};

export const bufferToBase64Ref = async (buffer: Uint8Array): Promise<DataRef> => {

  var decoder = new TextDecoder('utf8');
  var value = btoa(decoder.decode(buffer));
  return {
      value,
      type: DataRefType.base64,
  }
}

// TODO: use streams instead of loading all in memory
export const fileToDataref = async (file: string, address:string): Promise<DataRef> => {
  const fileBuffer: Uint8Array = await Deno.readFile(file);

  if (fileBuffer.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
    const hash = objectHash.sha1(fileBuffer);
    const urlGetUpload = `${address}/upload/${hash}`;
    const resp = await fetch(urlGetUpload);
    if (!resp.ok) {
      throw new Error(
        `Failed to get upload URL from ${urlGetUpload} status=${resp.status}`
      );
    }
    const json: { url: string; ref: DataRef } = await resp.json();
    const responseUpload = await fetch(json.url, {
      method: "PUT",
      redirect: "follow",
      body: fileBuffer,
      headers: { "Content-Type": "application/octet-stream" },
    });
    await responseUpload.text();
    return json.ref; // the server gave us this ref to use
  } else {
    const ref: DataRef = await bufferToBase64Ref(fileBuffer);
    return ref;
  }
};

export const finishedJobOutputsToFiles = async (finishedState: StateChangeValueWorkerFinished, outputsDirectory:string, address:string): Promise<void> => {

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
      })
  );
}

export const dataRefToFile = async (ref: DataRef, filename:string, address:string): Promise<void> => {
  const dir = dirname(filename);
  await ensureDir(dir);
  let errString:string;
  switch(ref.type) {
      case DataRefType.base64:
          const bytes = decodeBase64(ref.value as string)
          await Deno.writeFile(filename, bytes, { mode: 0o644 });
          // await fse.writeFile(filename, Buffer.from(ref.value as string, 'base64'));
          return;
      case DataRefType.utf8:
          await Deno.writeTextFile(filename, ref.value as string);
          // await fse.writeFile(filename, Buffer.from(ref.value as string, 'utf8'));
          return;
      case DataRefType.json:
          await Deno.writeTextFile(filename, JSON.stringify(ref.value));
          // await fse.writeFile(filename, JSON.stringify(ref.value));
          return;
      case DataRefType.url:

          const downloadFile = await Deno.open(filename, { create: true, write: true });


          const responseUrl = await fetch(ref.value, {redirect:'follow'});
          if (!responseUrl.ok) {
              errString = `Failed to download="${ref.value}" status=${responseUrl.status} statusText=${responseUrl.statusText}`;
              console.error(errString);
              throw new Error(errString);
          }
          if (!responseUrl.body) {
              errString = `Failed to download="${ref.value}" status=${responseUrl.status} no body in response`
              console.error(errString);
              throw new Error(errString);
          }

          await responseUrl.body.pipeTo(downloadFile.writable);

          // console.log(`fse.createWriteStream url ${filename}`)
          // const fileStreamUrl = fse.createWriteStream(filename);
          // console.log(`👍 fse.createWriteStream url ${filename}`)

          
          // @ts-ignore
          // await streamPipeline(responseUrl.body, fileStreamUrl);
          return;
      case DataRefType.key:
          
          // we know how to get this internal cloud referenced
          const cloudRefUrl = `${address}/download/${ref.value}`;
          // console.log('cloudRefUrl', cloudRefUrl);
          const responseHash = await fetch(cloudRefUrl);

          

          const json : { url:string, ref: DataRef} = await responseHash.json();
          // console.log('json', json);
          // console.log('json.url', json.url);


          // console.log('fetching')
          const responseHashUrl = await fetch(json.url, {redirect:'follow'});
          // console.log('fetched ok', responseHashUrl.ok)
          if (!responseHashUrl.ok) {
              throw new Error(`Failed to download="${json.url}" status=${responseHashUrl.status} statusText=${responseHashUrl.statusText}`);
          }
          if (!responseHashUrl.body) {
              throw new Error(`Failed to download="${json.url}" status=${responseHashUrl.status} no body in response`);
          }

          const downloadFileForHash = await Deno.open(filename, { create: true, write: true });
          // downloadFileForHash.writable.on('error', (err:any) => {
          //     fileStreamHash.close();
          //     console.error('fileStream error', err)
          // });

          await responseHashUrl.body.pipeTo(downloadFileForHash.writable);

          // console.log(`fse.createWriteStream hash ${filename}`)
          // const fileStreamHash = fse.createWriteStream(filename);
          // // console.log(`👍 fse.createWriteStream hash ${filename}`)
          // fileStreamHash.on('error', (err:any) => {
          //     fileStreamHash.close();
          //     console.error('fileStream error', err)
          // });


          // @ts-ignore
          // await streamPipeline(responseHashUrl.body, fileStreamHash);
          break;
      default: // undefined assume DataRefType.Base64
          throw `Not yet implemented: DataRef.type === undefined or unrecognized value="${ref.type}"`;
  }
}
