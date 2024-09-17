import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { DisplayLogs } from '/@/components/sections/DisplayLogs';
import { PanelInputs } from '../components/sections/PanelInputs';
import { PanelSettings } from '../components/sections/PanelSettings';
import { PanelOutputs } from '../components/sections/PanelOutputs';
import {
  convertJobOutputDataRefsToExpectedFormat,
  DockerJobState,
  shaObject,
  StateChange,
  StateChangeValueQueued,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import pDebounce from 'p-debounce';
import { UPLOAD_DOWNLOAD_BASE_URL } from '../config';

import {
  Box,
  Container,
  HStack,
  VStack,
} from '@chakra-ui/react';
import { useMetaframeAndInput } from '@metapages/metaframe-hook';
import {
  isIframe,
  MetaframeInputMap,
} from '@metapages/metapage';
import { MainHeader } from '/@/components/MainHeader';
import { MainFooter } from '/@/components/MainFooter';
import { useStore } from '../store';

import { defaultBorder, contentHeight } from '../styles/theme';
import { PanelEditor } from '../components/sections/PanelEditor';
export const Main: React.FC = () => {
  // this is where two complex hooks are threaded together (also in the store):
  // 1. get the job definition
  // 2. send the job definition if changed
  // 3. Show the status of the current job, and allow cancelling
  // 4. If the current job is finished, send the outputs (once)
  const dockerJob = useStore((state) => state.newJobDefinition);
  const jobs = useStore((state) => state.jobStates);
  const connected = useStore((state) => state.isServerConnected);
  const sendClientStateChange = useStore(
    (state) => state.sendClientStateChange
  );
  const rightPanelContext = useStore((state) => state.rightPanelContext);

  const [jobHashCurrentOutputs, setJobHashCurrentOutputs] = useState<
    string | undefined
  >(undefined);
  const ourConfiguredJob = useStore((state) => state.jobState);

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
      ourConfiguredJob?.state === DockerJobState.Finished
    ) {
      const stateFinished: StateChangeValueWorkerFinished =
        ourConfiguredJob.value as StateChangeValueWorkerFinished;
      if (isIframe() && stateFinished?.result?.outputs) {
        // const outputs: InputsRefs = stateFinished!.result!.outputs;
        const { outputs, ...theRest } = stateFinished!.result!;
        (async () => {
          const metaframeOutputs: MetaframeInputMap | undefined =
            await convertJobOutputDataRefsToExpectedFormat(
              outputs,
              UPLOAD_DOWNLOAD_BASE_URL
            );
          try {
            metaframeObj.setOutputs!({ ...metaframeOutputs, ...theRest });
          } catch (err) {
            console.error("Failed to send metaframe outputs", err);
          }
          setJobHashCurrentOutputs(ourConfiguredJob.hash);
        })();
      }
    }
  }, [ourConfiguredJob, metaframeBlob?.metaframe, setJobHashCurrentOutputs]);

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
        const jobHashCurrent = await shaObject(dockerJob.definition);
        if (cancelled) {
          // console.log("cancelled")
          return;
        }

        const sendQueuedStateChange = () => {
          // console.log(`🍔🍔 sendQueuedStateChange id=${jobHash}`);
          // inputs are already minified (fat blobs uploaded to the cloud)
          const value: StateChangeValueQueued = {
            definition: dockerJob!.definition!,
            debug: dockerJob.debug,
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
    dockerJob,
    jobs,
    sendClientStateChangeDeBounced,
    jobHashCurrentOutputs,
  ]);

  const rightPanelOptions = {
    help: <iframe
      style={{ width: "100%", height: contentHeight }}
      src={`https://markdown.mtfm.io/#?url=${window.location.origin}${window.location.pathname}/README.md`}
    />,
    inputs: <PanelInputs />,
    outputs: <PanelOutputs />,
    settings: <PanelSettings />,
    editScript: <PanelEditor />,
    stdErr: <DisplayLogs mode={"stderr"} />
  }
  let rightContent = rightPanelContext && rightPanelOptions[rightPanelContext];

  return (
    <VStack gap={0} minHeight="100vh" minWidth={'40rem'}>
      <MainHeader />
      <HStack gap={0} minWidth="100vw" minHeight={contentHeight}>
        <Box w="50%" minHeight={contentHeight}>
          <Container p={5}>
            <DisplayLogs mode={"stdout"} />
          </Container>
        </Box>
        <Box w="50%" minHeight={contentHeight} borderLeft={rightContent && defaultBorder}>
          {rightContent}
        </Box>
      </HStack>
      <MainFooter job={ourConfiguredJob}/>
    </VStack>
  );
};