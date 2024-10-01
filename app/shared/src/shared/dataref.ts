import {
  DataRef,
  DataRefType,
  DataRefTypeDefault,
  decodeBase64,
  fetchRobust as fetch,
  InputsRefs,
  sha256Buffer,
} from "/@/shared";

import { DataRefSerializedBlob, MetaframeInputMap } from "@metapages/metapage";

export const ENV_VAR_DATA_ITEM_LENGTH_MAX = 200;

export const dataRefToDownloadLink = async (ref: DataRef): Promise<string> => {
  const buffer = await dataRefToBuffer(ref);
  return URL.createObjectURL(new Blob([buffer], { type: "application/octet-stream" }));
};

export const dataRefToBuffer = async (ref: DataRef): Promise<Uint8Array> => {
  switch (ref.type) {
    case DataRefType.base64:
      return decodeBase64(ref.value as string);
    case DataRefType.utf8:
      return new TextEncoder().encode(ref.value as string);
    case DataRefType.json:
      return new TextEncoder().encode(JSON.stringify(ref.value));
    case DataRefType.url: {
      const arrayBufferFromUrl = await urlToUint8Array(ref.value as string);
      return arrayBufferFromUrl;
    }
    case DataRefType.key: {
      // hard code this for now
      const arrayBufferFromKey = await fetchBlobFromHash(ref.value, "https://container.mtfm.io");
      return new Uint8Array(arrayBufferFromKey);
    }
    default: // undefined assume DataRefType.Base64
      throw `Not yet implemented: DataRef.type "${ref.type}" unknown`;
  }
};

// Takes map of DataRefs and checks if any are too big, if so
// uploads the data to the cloud, and replaces the data ref
// with a DataRef pointing to the cloud blob
// We assume (roughly) immutable uploads based on hash
// so we keep a tally of already uploaded blobs
const AlreadyUploaded: { [hash: string]: boolean } = {};
export const copyLargeBlobsToCloud = async (
  inputs: InputsRefs | undefined,
  address: string,
): Promise<InputsRefs | undefined> => {
  if (!inputs || Object.keys(inputs).length === 0) {
    return;
  }
  const result: InputsRefs = {};

  await Promise.all(
    Object.keys(inputs).map(async name => {
      const type: DataRefType = inputs[name]?.type || DataRefTypeDefault;
      let uint8ArrayIfBig: Uint8Array | undefined;
      switch (type) {
        case DataRefType.key:
          // this is already cloud storage. no need to re-upload
          break;
        case DataRefType.url:
          // this is already somewhere else.
          break;
        case DataRefType.json:
          if (inputs?.[name]?.value) {
            const jsonString = JSON.stringify(inputs[name].value);
            if (jsonString.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
              uint8ArrayIfBig = utf8ToBuffer(jsonString);
            }
          }
          break;
        case DataRefType.base64:
          if (inputs?.[name]?.value.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
            uint8ArrayIfBig = decodeBase64(inputs[name].value);
          }
          break;
        case DataRefType.utf8:
          if (inputs?.[name]?.value?.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
            uint8ArrayIfBig = utf8ToBuffer(inputs[name].value);
          }
          break;

        default:
      }

      if (uint8ArrayIfBig) {
        // upload and replace the dataref

        const hash = await sha256Buffer(uint8ArrayIfBig);
        // but not if we already have, since these files are immutable
        if (!AlreadyUploaded[hash]) {
          const urlGetUpload = `${address}/upload/${hash}`;
          // console.log('urlGetUpload', urlGetUpload);
          const resp = await fetch(urlGetUpload, { redirect: "follow" });
          if (!resp.ok) {
            throw new Error(`Failed to get upload URL from ${urlGetUpload} status=${resp.status}`);
          }
          const json: { url: string; ref: DataRef } = await resp.json();
          const responseUpload = await fetch(json.url, {
            method: "PUT",
            redirect: "follow",
            body: uint8ArrayIfBig,
            headers: { "Content-Type": "application/octet-stream" },
          });
          await responseUpload.text();
          result[name] = json.ref; // the server gave us this ref to use
          AlreadyUploaded[hash] = true;
        } else {
          result[name] = {
            value: hash,
            type: DataRefType.key,
          };
        }
      } else {
        result[name] = inputs[name];
      }
    }),
  );
  return result;
};

// Takes map of DataRefs and converts all to desired DataMode
// e.g. gets urls and downloads to local ArrayBuffers
export const convertJobOutputDataRefsToExpectedFormat = async (
  outputs: InputsRefs | undefined,
  address: string,
): Promise<MetaframeInputMap | undefined> => {
  if (!outputs) {
    return;
  }
  let arrayBuffer: ArrayBuffer;
  const newOutputs: MetaframeInputMap = {};

  await Promise.all(
    Object.keys(outputs).map(async (name: string) => {
      const type: DataRefType = outputs[name].type || DataRefTypeDefault;
      switch (type) {
        case DataRefType.base64: {
          // well that was easy
          const internalBlobRefFromBase64: DataRefSerializedBlob = {
            _s: true,
            _c: "Blob",
            value: outputs[name].value,
            size: 0,
            fileType: undefined, // TODO: can we figure this out?
          };
          newOutputs[name] = internalBlobRefFromBase64;
          break;
        }
        case DataRefType.key: {
          arrayBuffer = await fetchBlobFromHash(outputs[name].value, address);
          arrayBuffer = new Uint8Array(arrayBuffer);

          const internalBlobRefFromHash: DataRefSerializedBlob = {
            _c: Blob.name,
            _s: true,
            value: bufferToBase64(arrayBuffer),
            size: arrayBuffer.byteLength,
            fileType: undefined, // TODO: can we figure this out?
          };
          newOutputs[name] = internalBlobRefFromHash;
          break;
        }
        case DataRefType.json:
          newOutputs[name] = outputs[name].value; //Unibabel.utf8ToBase64(JSON.stringify(outputs[name].value));
          break;
        case DataRefType.url: {
          arrayBuffer = await fetchBlobFromUrl(outputs[name].value);
          const internalBlobRefFromUrl: DataRefSerializedBlob = {
            _s: true,
            _c: Blob.name,
            value: bufferToBase64(arrayBuffer),
            fileType: undefined, // TODO: can we figure this out?
            size: arrayBuffer.byteLength,
          };
          newOutputs[name] = internalBlobRefFromUrl;
          break;
        }
        case DataRefType.utf8:
          newOutputs[name] = outputs[name].value; //Unibabel.utf8ToBase64(outputs[name].value);
          break;
      }
    }),
  );

  return newOutputs;
};

const fetchBlobFromUrl = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "Content-Type": "application/octet-stream" },
  });
  const arrayBuffer = await response.arrayBuffer();
  return arrayBuffer;
};

export const fetchJsonFromUrl = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
  });
  const json = await response.json();
  return json;
};

export const urlToUint8Array = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

const fetchBlobFromHash = async (hash: string, address: string): Promise<ArrayBuffer> => {
  const resp = await fetch(`${address}/download/${hash}`, { redirect: "follow" });
  const json: { url: string; ref: DataRef } = await resp.json();
  const arrayBuffer = await fetchBlobFromUrl(json.url);
  return arrayBuffer;
};

const _encoder = new TextEncoder();
export const utf8ToBuffer = (str: string): Uint8Array => {
  return _encoder.encode(str);
};

const _decoder = new TextDecoder();
export const bufferToUtf8 = (buffer: Uint8Array): string => {
  return _decoder.decode(buffer);
};

// 👍
export function bufferToBinaryString(buffer: ArrayBuffer): string {
  const base64Str = Array.prototype.map
    .call(buffer, function (ch: number) {
      return String.fromCharCode(ch);
    })
    .join("");
  return base64Str;
}

// 👍
export const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const binstr = bufferToBinaryString(buffer);
  return btoa(binstr);
};
