/**
 * Via Context provide the current docker job definition which is combined from metaframe inputs
 * and URL query parameters, and the means to change (some of) them
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  DockerJobDefinitionMetadata,
  DockerJobDefinitionParamsInUrlHash,
} from '/@/components/types';
import {
  DataRefType,
  DockerJobDefinitionInputRefs,
} from '/@/shared';
import { copyLargeBlobsToCloud } from '/@/utils/dataref';

import {
  useHashParam,
  useHashParamJson,
} from '@metapages/hash-query';
import { useMetaframeAndInput } from '@metapages/metaframe-hook';
import {
  DataRefSerialized,
  Metaframe,
} from '@metapages/metapage';

import { JobInputs } from '../components/PanelInputs';

type Props = {
  children: any;
};

interface DockerJobDefinitionObject {
  // this is the entire job definition
  definitionMeta?: DockerJobDefinitionMetadata;
  // TODO: metaframe inputs
}

const defaultDockerJobDefinitionObject: DockerJobDefinitionObject = {
  definitionMeta: undefined,
};

const DockerJobDefinitionContext = createContext<DockerJobDefinitionObject>(
  defaultDockerJobDefinitionObject
);

export const DockerJobDefinitionProvider = ({ children }: Props) => {
  // we listen to the job parameters embedded in the URL changing
  const [definitionParamsInUrl] = useHashParamJson<
    DockerJobDefinitionParamsInUrlHash | undefined
  >("job");
  const [jobInputs] = useHashParamJson<JobInputs | undefined>("inputs");

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

  const [nocacheString] = useHashParam("nocache");
  const nocache = nocacheString === "1" ? true : false;
  const [definitionMeta, setDefinitionMeta] = useState<
    DockerJobDefinitionMetadata | undefined
  >(undefined);

  // if the URL inputs change, or the metaframe inputs change, maybe update the dockerJobDefinitionMeta
  useEffect(() => {
    // console.log(`🍔 useEffect`)
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

    if (!definition.image) {
      setDefinitionMeta(undefined);
      return;
    }

    (async () => {
      if (cancelled) {
        return;
      }
      // convert inputs into internal data refs so workers can consume
      let inputs = metaframeBlob.inputs;
      // TODO: this shouldn't be needed, but there is a bug:
      // https://github.com/metapages/metapage/issues/117
      inputs = await Metaframe.serializeInputs(inputs);
      if (cancelled) {
        return;
      }
      Object.keys(inputs).forEach((name) => {
        let value = inputs[name];
        if (typeof value === "object" && value._s === true) {
          const blob = value as DataRefSerialized;
          // serialized blob/typedarray/arraybuffer
          definition.inputs![name] = {
            value: blob.value,
            type: DataRefType.base64,
          };
        } else {
          if (typeof value === "object") {
            definition.inputs![name] = {
              value,
              type: DataRefType.json,
            };
          } else if (typeof value === "string") {
            definition.inputs![name] = {
              value,
              type: DataRefType.utf8,
            };
          } else if (typeof value === "number") {
            definition.inputs![name] = {
              value: `${value}`,
              type: DataRefType.utf8,
            };
          }else {
            console.error(`I don't know how to handle input ${name}:`, value);
          }
          // Now all (non-blob) values are DataMode.utf8
        }
      });

      // at this point, these inputs could be very large blobs.
      // any big things are uploaded to cloud storage, then the input is replaced with a reference to the cloud lump
      definition.inputs = await copyLargeBlobsToCloud(definition.inputs);
      if (cancelled) {
        return;
      }

      // if uploading a large blob means new inputs have arrived and replaced this set, break out
      const newJobDefinition: DockerJobDefinitionMetadata = {
        definition,
        nocache,
      };
      // console.log(`🍔 setDefinitionMeta`, newJobDefinition)
      setDefinitionMeta(newJobDefinition);

      return () => {
        // console.log("🍔😞 useEffect cancelled");
        cancelled = true;
      };
    })();
  }, [metaframeBlob.inputs, definitionParamsInUrl, jobInputs]);

  return (
    <DockerJobDefinitionContext.Provider value={{ definitionMeta }}>
      {children}
    </DockerJobDefinitionContext.Provider>
  );
};

export const useDockerJobDefinition = () => {
  return useContext(DockerJobDefinitionContext);
};
