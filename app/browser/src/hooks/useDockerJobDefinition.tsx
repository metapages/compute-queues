/**
 * Via Context provide the current docker job definition which is combined from metaframe inputs
 * and URL query parameters, and the means to change (some of) them
 */
import { useEffect } from 'react';

import {
  copyLargeBlobsToCloud,
  DataRefType,
  DockerJobDefinitionInputRefs,
  DockerJobDefinitionMetadata,
  DockerJobDefinitionParamsInUrlHash,
  isDataRef,
  shaObject,
} from '/@/shared';

import {
  useHashParamBoolean,
  useHashParamJson,
} from '@metapages/hash-query';
import { useMetaframeAndInput } from '@metapages/metaframe-hook';
import {
  DataRefSerialized,
  Metaframe,
} from '@metapages/metapage';

import { UPLOAD_DOWNLOAD_BASE_URL } from '../config';
import { useStore } from '../store';
import { JobInputs } from '/@/shared';

/**
 * Gets the configuration from 1) the URL hash parameters and 2) the metaframe inputs,
 * combines them together, and sets the docker job definition in the store
 */
export const useDockerJobDefinition = () => {
  // TODO: unclear if this does anything anymore
  const [debug] = useHashParamBoolean("debug");

  // we listen to the job parameters embedded in the URL changing
  const [definitionParamsInUrl] = useHashParamJson<
    DockerJobDefinitionParamsInUrlHash | undefined
  >("job");
  // input text files are stored in the URL hash
  const [jobInputs] = useHashParamJson<JobInputs | undefined>("inputs");

  // this changes when the metaframe inputs change
  const metaframeBlob = useMetaframeAndInput();
  // important: do NOT auto serialize input blobs, since the worker is
  // the only consumer, it wastes resources
  // Output blobs tho?
  useEffect(() => {
    // This is here but currently does not seem to work:
    // https://github.com/metapages/metapage/issues/117
    if (metaframeBlob?.metaframe) {
      metaframeBlob.metaframe.isInputOutputBlobSerialization = false;
    }
  }, [metaframeBlob?.metaframe]);

  // When all the things are updated, set the new job definition
  const setNewJobDefinition = useStore((state) => state.setNewJobDefinition);

  // if the URL inputs change, or the metaframe inputs change, maybe update the store.newJobDefinition
  useEffect(() => {
    let cancelled = false;
    // So convert all possible input data types into datarefs for smallest internal representation (no big blobs)
    const definition: DockerJobDefinitionInputRefs = {
      ...definitionParamsInUrl,
    };

    // These are inputs set in the metaframe and stored in the url hash params. They
    // are always type: DataRefType.utf8 because they come from the text editor
    definition.inputs = !jobInputs
      ? {}
      : Object.fromEntries(
          Object.keys(jobInputs).map((key) => {
            return [
              key,
              { type: DataRefType.utf8, value: jobInputs[key] as string },
            ];
          })
        );

    // console.log("🍔 useEffect definition", definition);

    if (!definition.image && !definition.build) {
      return;
    }

    (async () => {
      if (cancelled) {
        return;
      }
      // convert inputs into internal data refs so workers can consume
      // Get ALL inputs, not just the most recent, since inputs come
      // in from different sources at different times, and we accumulate them
      let inputs = metaframeBlob?.metaframe?.getInputs() || {};

      // TODO: this shouldn't be needed, but there is a bug:
      // https://github.com/metapages/metapage/issues/117
      // This converts blobs and files into base64 strings
      inputs = await Metaframe.serializeInputs(inputs);
      if (cancelled) {
        return;
      }
      Object.keys(inputs).forEach((name) => {
        const fixedName = name.startsWith("/") ? name.slice(1) : name;
        let value = inputs[name];
        // null (and undefined) cannot be serialized, so skip them
        if (value === undefined || value === null) {
          return;
        }
        if (typeof value === "object" && value?._s === true) {
          const blob = value as DataRefSerialized;
          // serialized blob/typedarray/arraybuffer
          definition.inputs![fixedName] = {
            value: blob.value,
            type: DataRefType.base64,
          };
        } else {
          // If it's a DataRef, just use it, then there's 
          // no need to serialize it, or further process
          if (isDataRef(value)) {
            definition.inputs![fixedName] = value;
          } else if (typeof value === "object") {
            if (value?.type)
              definition.inputs![fixedName] = {
                value,
                type: DataRefType.json,
              };
          } else if (typeof value === "string") {
            definition.inputs![fixedName] = {
              value,
              type: DataRefType.utf8,
            };
          } else if (typeof value === "number") {
            definition.inputs![fixedName] = {
              value: `${value}`,
              type: DataRefType.utf8,
            };
          } else {
            console.error(`I don't know how to handle input ${name}:`, value);
          }
          // TODO: is this true: Now all (non-blob) values are DataMode.utf8
        }
      });

      // at this point, these inputs *could* be very large blobs.
      // any big things are uploaded to cloud storage, then the input is replaced with a reference to the cloud lump
      definition.inputs = await copyLargeBlobsToCloud(
        definition.inputs,
        UPLOAD_DOWNLOAD_BASE_URL
      );
      if (cancelled) {
        return;
      }

      // if uploading a large blob means new inputs have arrived and replaced this set, break out
      const jobHashCurrent = await shaObject(definition);
      const newJobDefinition: DockerJobDefinitionMetadata = {
        hash: jobHashCurrent,
        definition,
        debug,
      };
      // console.log(`🍔 setDefinitionMeta`, newJobDefinition)

      setNewJobDefinition(newJobDefinition);

      return () => {
        // console.log("🍔😞 useEffect cancelled");
        cancelled = true;
      };
    })();
  }, [metaframeBlob.inputs, definitionParamsInUrl, jobInputs, debug]);
};
