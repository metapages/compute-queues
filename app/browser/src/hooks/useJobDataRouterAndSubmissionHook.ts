import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  convertJobOutputDataRefsToExpectedFormat,
  DockerJobState,
  shaObject,
  StateChange,
  StateChangeValueQueued,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import pDebounce from 'p-debounce';

import { useMetaframeAndInput } from '@metapages/metaframe-hook';
import {
  isIframe,
  MetaframeInputMap,
} from '@metapages/metapage';

import { UPLOAD_DOWNLOAD_BASE_URL } from '../config';
import { DockerRunResultWithOutputs } from '../shared';
import { useStore } from '../store';
import { useOptionResolveDataRefs } from './useOptionResolveDataRefs';

export const useJobDataRouterAndSubmissionHook = () => {
  // You usually don't want this on, that means big blobs
  // are going to move around your system
  const [resolveDataRefs] = useOptionResolveDataRefs();

  // this is where two complex hooks are threaded together (also in the store):
  // 1. get the job definition
  // 2. send the job definition if changed
  // 3. Show the status of the current job, and allow cancelling
  // 4. If the current job is finished, send the outputs (once)
  const dockerJobClient = useStore((state) => state.newJobDefinition);
  const dockerJobServer = useStore((state) => state.jobState);

  const connected = useStore((state) => state.isServerConnected);
  const sendClientStateChange = useStore(
    (state) => state.sendClientStateChange
  );

  const [jobHashCurrentOutputs, setJobHashCurrentOutputs] = useState<
    string | undefined
  >(undefined);

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
      metaframeObj?.setOutputs &&
      dockerJobServer?.state === DockerJobState.Finished &&
      dockerJobServer?.value
    ) {
      const stateFinished: StateChangeValueWorkerFinished =
        dockerJobServer.value as StateChangeValueWorkerFinished;
      const result: DockerRunResultWithOutputs = stateFinished.result;
      if (isIframe() && result?.outputs) {
        // const outputs: InputsRefs = stateFinished!.result!.outputs;
        const { outputs, ...theRest } = result;
        if (Object.keys(outputs).length > 0) {
          if (resolveDataRefs) {
            (async () => {
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
              setJobHashCurrentOutputs(dockerJobServer.hash);
            })();
          } else {
            metaframeObj.setOutputs!({ ...outputs  });
          }
          
        }
      }
    }
  }, [dockerJobServer, metaframeBlob?.metaframe, setJobHashCurrentOutputs]);

  const sendClientStateChangeDeBounced = useCallback(
    pDebounce((payload: StateChange) => {
      // console.log("🍔 ACTUALLY debounced sending payload", payload);
      sendClientStateChange(payload);
    }, 200),
    [sendClientStateChange]
  );

  // track the job state that matches our job definition (created by URL query params and inputs)
  // when we get the correct job state, it's straightforward to just show it
  useEffect(() => {
    if (!connected) {
      // console.log('❔ not connected');
      return;
    }
    let cancelled = false;

    let resubmitInterval: number | undefined = undefined;

    (async () => {
      // console.log('❔ dockerJob', dockerJob);
      // console.log('❔ jobStates', jobs);

      if (dockerJob && jobs) {
        const jobHashCurrent = await shaObject(dockerJobClient.definition);

        if (cancelled) {
          // console.log("cancelled")
          return;
        }

        const sendQueuedStateChange = () => {
          // console.log(`🍔🍔 sendQueuedStateChange id=${jobHash}`);
          // inputs are already minified (fat blobs uploaded to the cloud)
          const value: StateChangeValueQueued = {
            definition: dockerJobClient!.definition!,
            debug: dockerJobClient.debug,
            time: Date.now(),
          };
          const payload: StateChange = {
            state: DockerJobState.Queued,
            value,
            job: jobHashCurrent,
            tag: "", // document the meaning of this. It's the worker claim. Might be unneccesary due to history
          };

          sendClientStateChangeDeBounced(payload);
        };

        const currentJobFromTheServer = jobs[jobHashCurrent];

        if (!currentJobFromTheServer) {
          // no job found, let's add it
          // BUT only if our last outputs aren't this jobId
          // because the server eventually deletes our job, but we can know we have already computed it
          if (jobHashCurrentOutputs !== jobHashCurrent) {
            // console.log(
            //   `jobHashCurrentOutputs !== jobHashCurrent SO sendQueuedStateChange`
            // );
            sendQueuedStateChange();
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      if (resubmitInterval) {
        clearInterval(resubmitInterval);
      }
    };
  }, [
    connected,
    dockerJobClient,
    jobs,
    sendClientStateChangeDeBounced,
    jobHashCurrentOutputs,
  ]);

  return {
    submitJob,
    stopJob,
    clearJobCache,
  };
};
