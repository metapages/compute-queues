// https://docs.deno.com/examples/hex-base64-encoding

import { decodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { ensureDir } from 'https://deno.land/std@0.224.0/fs/ensure_dir.ts';
import { dirname } from 'https://deno.land/std@0.224.0/path/mod.ts';

import { config } from '../config.ts';
import {
  DataRef,
  DataRefType,
  fetchRobust as fetch,
} from '../shared/mod.ts';

export const dataRefToBuffer = async (ref: DataRef): Promise<Uint8Array> => {
    switch(ref.type) {
        case DataRefType.base64:
            return decodeBase64(ref.value as string)
            // return Buffer.from(ref.value as string, 'base64');
        case DataRefType.utf8:
            return new TextEncoder().encode(ref.value as string)
            // return Buffer.from(ref.value as string, 'utf8');
        case DataRefType.url:
// TODO: HERE
            throw 'Not yet implemented: DataRef.type === DataRefType.Url';
        default: // undefined assume DataRefType.Base64
            throw 'Not yet implemented: DataRef.type === undefined or unknown';
    }
}

export const dataRefToFile = async (ref: DataRef, filename:string): Promise<void> => {
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
        case DataRefType.hash:
            
            // we know how to get this internal cloud referenced
            const cloudRefUrl = `${config.server}/download/${ref.hash || ref.value}`;
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

export const bufferToBase64Ref = async (buffer: Uint8Array): Promise<DataRef> => {

    var decoder = new TextDecoder('utf8');
    var value = btoa(decoder.decode(buffer));
    return {
        value,
        type: DataRefType.base64,
    }
}

// const downloadFile = async (url:string, path:string) => promisify(pipeline)(
//     (await fetch(url)).body as ReadableStream,
//     createWriteStream(path)
// );
