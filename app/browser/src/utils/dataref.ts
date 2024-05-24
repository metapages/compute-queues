import {
  DataRef,
  DataRefType,
  DataRefTypeDefault,
  fetchRobust as fetch,
  InputsRefs,
} from '/@/shared';
// helpers to upload large input blobs to the cloud, when required
import objectHash from 'object-hash';
import { Unibabel } from 'unibabel';

import {
  DataRefSerializedBlob,
  MetaframeInputMap,
} from '@metapages/metapage';

import { UPLOAD_DOWNLOAD_BASE_URL } from '../config';

const ENV_VAR_DATA_ITEM_LENGTH_MAX = 200;

// Takes map of DataRefs and checks if any are too big, if so
// uploads the data to the cloud, and replaces the data ref
// with a DataRef pointing to the cloud blob
export const copyLargeBlobsToCloud = async (
  inputs: InputsRefs | undefined
): Promise<InputsRefs | undefined> => {
  if (!inputs) {
    return;
  }
  const result: InputsRefs = {};

  await Promise.all(
    Object.keys(inputs).map(async (name) => {
      const type: DataRefType = inputs[name]?.type || DataRefTypeDefault;
      let uint8ArrayIfBig: Uint8Array | undefined;
      switch (type) {
        case DataRefType.hash:
          // this is already cloud storage. weird. or really advanced? who knows, but trust it anyway,
          break;
        case DataRefType.json:
          if (inputs?.[name]?.value) {
            const jsonString = JSON.stringify(inputs[name].value);
            if (jsonString.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
              uint8ArrayIfBig = Unibabel.utf8ToBuffer(jsonString);
            }
          }
          break;
        case DataRefType.utf8:
          if (
            inputs?.[name]?.value?.length > ENV_VAR_DATA_ITEM_LENGTH_MAX
          ) {
            uint8ArrayIfBig = Unibabel.utf8ToBuffer(inputs[name].value);
          }
          break;
        // base64 is the default if unrecognized
        case DataRefType.base64:
        default:
          if (
            inputs?.[name]?.value.length > ENV_VAR_DATA_ITEM_LENGTH_MAX
          ) {
            uint8ArrayIfBig = Unibabel.base64ToBuffer(inputs[name].value);
          }
          break;
      }

      if (uint8ArrayIfBig) {
        // upload and replace the dataref
        const hash = objectHash.sha1(uint8ArrayIfBig);
        const urlGetUpload = `${UPLOAD_DOWNLOAD_BASE_URL}/upload/${hash}`;
        console.log('urlGetUpload', urlGetUpload);
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
  outputs: InputsRefs | undefined
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
        case DataRefType.hash:
          arrayBuffer = await fetchBlobFromHash(
            outputs[name].hash ?? outputs[name].value
          );
          arrayBuffer = new Uint8Array(arrayBuffer);

          const internalBlobRefFromHash: DataRefSerializedBlob = {
            _c: Blob.name,
            _s: true,
            value: Unibabel.bufferToBase64(arrayBuffer),
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
          arrayBuffer = await fetchBlobFromHash(
            outputs[name].hash || outputs[name].value
          );
          const internalBlobRefFromUrl: DataRefSerializedBlob = {
            _s: true,
            _c: Blob.name,
            value: Unibabel.bufferToBase64(arrayBuffer),
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

const fetchBlobFromHash = async (hash: string): Promise<ArrayBuffer> => {
  const resp = await fetch(`${UPLOAD_DOWNLOAD_BASE_URL}/download/${hash}`);
  const json: { url: string; ref: DataRef } = await resp.json();
  const arrayBuffer = await fetchBlobFromUrl(json.url);
  return arrayBuffer;
};
