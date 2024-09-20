import {
  DataRef,
  DataRefType,
  DataRefTypeDefault,
  DataRefTypesSet,
  decodeBase64,
  fetchRobust as fetch,
  InputsRefs,
} from '/@/shared';
// helpers to upload large input blobs to the cloud, when required
import objectHash from 'object-hash';

import {
  DataRefSerializedBlob,
  MetaframeInputMap,
} from '@metapages/metapage';

export const ENV_VAR_DATA_ITEM_LENGTH_MAX = 200;

export const isDataRef = (value: any): boolean => {
  return !!(
    value &&
    typeof value === "object" &&
    (value as DataRef)?.type &&
    DataRefTypesSet.has((value as DataRef).type!) &&
    (value as DataRef)?.value
  );
};

export const dataRefToBuffer = async (ref: DataRef): Promise<Uint8Array> => {
  switch (ref.type) {
    case DataRefType.base64:
      return decodeBase64(ref.value as string);
    // return Buffer.from(ref.value as string, 'base64');
    case DataRefType.utf8:
      return new TextEncoder().encode(ref.value as string);
    // return Buffer.from(ref.value as string, 'utf8');
    case DataRefType.url:
      // TODO: HERE
      throw "Not yet implemented: DataRef.type === DataRefType.Url";
    default: // undefined assume DataRefType.Base64
      throw "Not yet implemented: DataRef.type === undefined or unknown";
  }
};

// Takes map of DataRefs and checks if any are too big, if so
// uploads the data to the cloud, and replaces the data ref
// with a DataRef pointing to the cloud blob
export const copyLargeBlobsToCloud = async (
  inputs: InputsRefs | undefined,
  address: string
): Promise<InputsRefs | undefined> => {
  if (!inputs || Object.keys(inputs).length === 0) {
    return;
  }
  const result: InputsRefs = {};

  await Promise.all(
    Object.keys(inputs).map(async (name) => {
      const type: DataRefType = inputs[name]?.type || DataRefTypeDefault;
      let uint8ArrayIfBig: Uint8Array | undefined;
      switch (type) {
        case DataRefType.key:
          // this is already cloud storage. weird. or really advanced? who knows, but trust it anyway,
          break;
        case DataRefType.json:
          if (inputs?.[name]?.value) {
            const jsonString = JSON.stringify(inputs[name].value);
            if (jsonString.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
              uint8ArrayIfBig = utf8ToBuffer(jsonString);
            }
          }
          break;
        case DataRefType.utf8:
          if (inputs?.[name]?.value?.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
            uint8ArrayIfBig = utf8ToBuffer(inputs[name].value);
          }
          break;
        // base64 is the default if unrecognized
        case DataRefType.base64:
        default:
          if (inputs?.[name]?.value.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
            uint8ArrayIfBig = decodeBase64(inputs[name].value);
          }
          break;
      }

      if (uint8ArrayIfBig) {
        // upload and replace the dataref
        const hash = objectHash.sha1(uint8ArrayIfBig);
        const urlGetUpload = `${address}/upload/${hash}`;
        // console.log('urlGetUpload', urlGetUpload);
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
          body: uint8ArrayIfBig,
          headers: { "Content-Type": "application/octet-stream" },
        });
        await responseUpload.text();
        result[name] = json.ref; // the server gave us this ref to use
      } else {
        result[name] = inputs[name];
      }
    })
  );
  return result;
};

// Takes map of DataRefs and converts all to desired DataMode
// e.g. gets urls and downloads to local ArrayBuffers
export const convertJobOutputDataRefsToExpectedFormat = async (
  outputs: InputsRefs | undefined,
  address: string
): Promise<MetaframeInputMap | undefined> => {
  if (!outputs) {
    return;
  }
  let arrayBuffer: ArrayBuffer;
  let newOutputs: MetaframeInputMap = {};

  await Promise.all(
    Object.keys(outputs).map(async (name: string) => {
      const type: DataRefType = outputs[name].type || DataRefTypeDefault;
      switch (type) {
        case DataRefType.base64:
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
        case DataRefType.key:
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
        case DataRefType.json:
          newOutputs[name] = outputs[name].value; //Unibabel.utf8ToBase64(JSON.stringify(outputs[name].value));
          break;
        case DataRefType.url:
          arrayBuffer = await fetchBlobFromUrl(outputs[name].value);
          // newOutputs[name] = Unibabel.bufferToBase64(arrayBuffer);
          arrayBuffer = await fetchBlobFromHash(outputs[name].value, address);
          const internalBlobRefFromUrl: DataRefSerializedBlob = {
            _s: true,
            _c: Blob.name,
            value: bufferToBase64(arrayBuffer),
            fileType: undefined, // TODO: can we figure this out?
            size: arrayBuffer.byteLength,
          };
          newOutputs[name] = internalBlobRefFromUrl;
          break;
        case DataRefType.utf8:
          newOutputs[name] = outputs[name].value; //Unibabel.utf8ToBase64(outputs[name].value);
          break;
      }
    })
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

const fetchBlobFromHash = async (
  hash: string,
  address: string
): Promise<ArrayBuffer> => {
  const resp = await fetch(`${address}/download/${hash}`);
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

/**
 * Decodes a base64-encoded string.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc4648#section-4}
 *
 * @param b64 The base64-encoded string to decode.
 * @returns The decoded data.
 *
 * @example
 * ```ts
 * import { decodeBase64 } from "https://deno.land/std@$STD_VERSION/encoding/base64.ts";
 *
 * decodeBase64("Zm9vYmFy"); // Uint8Array(6) [ 102, 111, 111, 98, 97, 114 ]
 * ```
 */
// export function base64ToBuffer(str:string) :Uint8Array {
//   const binaryString = atob(str);
//   const len = binaryString.length;
//   const bytes = new Uint8Array(len);
//   for (let i = 0; i < len; i++) {
//       bytes[i] = binaryString.charCodeAt(i);
//   }
//   return bytes;
// }

// 👍
export function bufferToBinaryString(buffer: ArrayBuffer): string {
  var base64Str = Array.prototype.map
    .call(buffer, function (ch: number) {
      return String.fromCharCode(ch);
    })
    .join("");
  return base64Str;
}

// 👍
export const bufferToBase64 = (buffer: ArrayBuffer): string => {
  var binstr = bufferToBinaryString(buffer);
  return btoa(binstr);
};
