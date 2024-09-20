import {
  useEffect,
  useRef,
} from 'react';

import {
  convertJobOutputDataRefsToExpectedFormat,
  DataRef,
  DataRefType,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';

import { useMetaframeAndInput } from '@metapages/metaframe-hook';
import {
  isIframe,
  MetaframeInputMap,
} from '@metapages/metapage';

import { UPLOAD_DOWNLOAD_BASE_URL } from '../config';
import { DockerRunResultWithOutputs } from '../shared';
import { useStore } from '../store';
import {
  useOptionJobStartAutomatically,
} from './useOptionJobStartAutomatically';
import { useOptionResolveDataRefs } from './useOptionResolveDataRefs';

const datarefKeyToUrl = (ref: DataRef): DataRef => {
  if (ref.type === DataRefType.key) {
    return {
      value: `${UPLOAD_DOWNLOAD_BASE_URL}/download/${ref.value}`,
      type: DataRefType.url,
    };
  } else {
    return ref;
  }
};

const convertMetaframeOutputKeysToUrls = (outputs: MetaframeInputMap): MetaframeInputMap => {
  const newOutputs: MetaframeInputMap = {};
  Object.keys(outputs).forEach((key) => {
    newOutputs[key] = datarefKeyToUrl(outputs[key]);
  });
  return newOutputs;
}

/**
 * Automatically send the finished job outputs to the metaframe
 */
export const useSendJobOutputs = () => {
  // You usually don't want this on, that means big blobs
  // are going to move around your system
  const [resolveDataRefs] = useOptionResolveDataRefs();
  const userClickedRun = useStore((state) => state.userClickedRun);
  const [jobStartsAutomatically] = useOptionJobStartAutomatically();
  const dockerJobServer = useStore((state) => state.jobState);
  // track if we have sent the outputs for this job hash
  // this will be reset if the state isn't finished
  // e.g. if the job is restarted
  const jobHashOutputsLastSent = useRef<string | undefined>(undefined);

  const metaframeBlob = useMetaframeAndInput();
  useEffect(() => {
    // This is here but currently does not seem to work:
    // https://github.com/metapages/metapage/issues/117
    if (metaframeBlob?.metaframe) {
      metaframeBlob.metaframe.isInputOutputBlobSerialization = false;
    }
  }, [metaframeBlob?.metaframe]);

  // only maybe update metaframe outputs if the job updates and is finished (with outputs)
  useEffect(() => {

    if (!jobStartsAutomatically && !userClickedRun) {
      return;
    }

    const metaframeObj = metaframeBlob?.metaframe;

    if (
      !metaframeObj?.setOutputs ||
      !dockerJobServer ||
      dockerJobServer?.state !== DockerJobState.Finished ||
      !isIframe()
    ) {
      // this is like a reset
      jobHashOutputsLastSent.current = undefined;
      return;
    }
    const stateFinished =
      dockerJobServer.value as StateChangeValueWorkerFinished;
    const result: DockerRunResultWithOutputs = stateFinished.result;
    const { outputs, ...theRest } = result;
    if (!outputs || Object.keys(outputs).length === 0) {
      jobHashOutputsLastSent.current = undefined;
      return;
    }

    if (jobHashOutputsLastSent.current === dockerJobServer.hash) {
      // console.log(`💔 NOT sending outputs to metaframe, did it already`);
      return;
    }

    if (resolveDataRefs) {
      (async () => {
        // TODO: use a local cache to avoid re-downloading the same outputs
        // console.log(`💚 💖 Resolving data refs for metaframe`);
        const metaframeOutputs: MetaframeInputMap | undefined =
          await convertJobOutputDataRefsToExpectedFormat(
            outputs,
            UPLOAD_DOWNLOAD_BASE_URL
          );

        const keysToUrlsOutputs = metaframeOutputs ? convertMetaframeOutputKeysToUrls(metaframeOutputs) : metaframeOutputs;
        
        try {
          // previously we sent the job status code, logs etc, but just send the outputs
          // If you want to send the other stuff, you can on your own
          // metaframeObj.setOutputs!({ ...keysToUrlsOutputs, ...theRest });
          // console.log(`💚 Sending outputs to metaframe`, keysToUrlsOutputs);
          metaframeObj.setOutputs!({ ...keysToUrlsOutputs });
        } catch (err) {
          console.error("Failed to send metaframe outputs", err);
        }
        jobHashOutputsLastSent.current = dockerJobServer.hash;
      })();
    } else {
      // console.log(`💚 Sending outputs to metaframe`, outputs);
      const keysToUrlsOutputs = outputs ? convertMetaframeOutputKeysToUrls(outputs) : outputs;
      metaframeObj.setOutputs!({ ...keysToUrlsOutputs });
      jobHashOutputsLastSent.current = dockerJobServer.hash;
    }
  }, [dockerJobServer, metaframeBlob?.metaframe, userClickedRun, jobStartsAutomatically]);
};
