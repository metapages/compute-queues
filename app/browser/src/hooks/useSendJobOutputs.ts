import {
  useEffect,
  useRef,
} from 'react';

import {
  convertJobOutputDataRefsToExpectedFormat,
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
import { useOptionResolveDataRefs } from './useOptionResolveDataRefs';

/**
 * Automatically send the finished job outputs to the metaframe
 */
export const useSendJobOutputs = () => {
  // You usually don't want this on, that means big blobs
  // are going to move around your system
  const [resolveDataRefs] = useOptionResolveDataRefs();
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

    if (resolveDataRefs) {
      (async () => {
        // TODO: use a local cache to avoid re-downloading the same outputs
        const metaframeOutputs: MetaframeInputMap | undefined =
          await convertJobOutputDataRefsToExpectedFormat(
            outputs,
            UPLOAD_DOWNLOAD_BASE_URL
          );
        try {
          // previously we sent the job status code, logs etc, but just send the outputs
          // If you want to send the other stuff, you can on your own
          // metaframeObj.setOutputs!({ ...metaframeOutputs, ...theRest });
          metaframeObj.setOutputs!({ ...metaframeOutputs });
        } catch (err) {
          console.error("Failed to send metaframe outputs", err);
        }
        jobHashOutputsLastSent.current = dockerJobServer.hash;
      })();
    } else {
      metaframeObj.setOutputs!({ ...outputs });
    }
  }, [dockerJobServer, metaframeBlob?.metaframe]);
};
