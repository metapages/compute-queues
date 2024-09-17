import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { 
  UploadSimple, 
  DownloadSimple, 
  Gear,
  PencilSimple,
  Repeat,
  List,
  QuestionMark,
  Terminal,
  Play,
  Prohibit,
  Stop,
  ArrowDown,
  X,
} from "@phosphor-icons/react";
import { useHashParamJson } from '@metapages/hash-query';
import { DockerJobDefinitionParamsInUrlHash } from '/@/shared';
import { JobInputs } from '/@/components/tabs/PanelInputs';

import { RiSignalWifiErrorLine, RiSignalWifiFill } from "react-icons/ri";

import { DisplayLogs } from '/@/components/DisplayLogs';
import { PanelInputs } from '/@/components/tabs/PanelInputs';
import { PanelJob } from '/@/components/tabs/PanelJob';
import { PanelSettings } from '/@/components/tabs/PanelSettings';
import { PanelJobLabel } from '/@/components/tabs/PanelJobLabel';
import { PanelOutputs } from '/@/components/tabs/PanelOutputs';
import { PanelOutputsLabel } from '/@/components/tabs/PanelOutputsLabel';
import { PanelQueue } from '/@/components/tabs/PanelQueue';
import { PanelStdLabel } from '/@/components/tabs/PanelStdLabel';
import { TabLabelQueue } from '/@/components/tabs/queue/TabLabelQueue';
import { useDockerJobDefinition } from '/@/hooks/jobDefinitionHook';
import {
  convertJobOutputDataRefsToExpectedFormat,
  DockerJobDefinitionRow,
  DockerJobState,
  shaObject,
  StateChange,
  StateChangeValueQueued,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import pDebounce from 'p-debounce';
import { UPLOAD_DOWNLOAD_BASE_URL } from '../config';

import { QuestionIcon } from '@chakra-ui/icons';
import {
  Box,
  Center,
  Container,
  Text,
  Icon,
  HStack,
  VStack,
  Spacer,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Flex,
  Button,
  Tooltip,
} from '@chakra-ui/react';
import {
  useHashParam,
  useHashParamInt,
} from '@metapages/hash-query';
import { useMetaframeAndInput } from '@metapages/metaframe-hook';
import {
  isIframe,
  MetaframeInputMap,
} from '@metapages/metapage';
import JobStatus from '/@/components/JobStatus';
import { MainHeader } from '/@/components/MainHeader';
import { MainFooter } from '/@/components/MainFooter';
import { useStore } from '../store';

import { defaultBorder, contentHeight } from '../styles/theme';
import { PanelEditor } from '/@/components/tabs/PanelEditor';
export const Main: React.FC = () => {
  // this is where two complex hooks are threaded together:
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

  const [jobHash, setJobHash] = useState<string | undefined>(undefined);
  const [jobHashCurrentOutputs, setJobHashCurrentOutputs] = useState<
    string | undefined
  >(undefined);
  const [ourConfiguredJob, setOurConfiguredJob] = useState<
    DockerJobDefinitionRow | undefined
  >(undefined);

  const metaframeBlob = useMetaframeAndInput();
  useEffect(() => {
    // This is here but currently does not seem to work:
    // https://github.com/metapages/metapage/issues/117
    if (metaframeBlob?.metaframe) {
      metaframeBlob.metaframe.isInputOutputBlobSerialization = false;
    }
  }, [metaframeBlob?.metaframe]);
  // const [debug] = useHashParamBoolean("debug");

  // Update the local job hash (id) on change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (dockerJob) {
        const jobHashCurrent = await shaObject(dockerJob.definition);
        if (cancelled) {
          return;
        }

        // console.log('🍔? jobHashCurrent', jobHashCurrent);
        if (jobHash !== jobHashCurrent) {
          // console.log('🍔🍔 setJobHash', jobHashCurrent);
          setJobHash(jobHashCurrent);
        }
      } else {
        setJobHash(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dockerJob, jobHash, setJobHash]);

  // Update the local job definition on change
  useEffect(() => {
    if (!jobHash) {
      if (ourConfiguredJob !== undefined) {
        setOurConfiguredJob(undefined);
      }
      return;
    }
    const serverJobState = jobs?.[jobHash];
    if (!serverJobState) {
      // only clear the job IF it's different from our last inputs
      if (jobHash !== jobHashCurrentOutputs) {
        // console.log('🍔🍔 setJob undefined');
        setOurConfiguredJob(undefined);
      }
    } else if (!ourConfiguredJob) {
      // console.log('🍔🍔 setJob (bc !job)', newJobState);
      setOurConfiguredJob(serverJobState);
    } else {
      if (
        serverJobState.hash !== ourConfiguredJob.hash ||
        serverJobState.history.length !== ourConfiguredJob.history.length
      ) {
        // console.log('🍔🍔 setJob (bc newJobState.hash !== job.hash) ', newJobState);
        setOurConfiguredJob(serverJobState);
      }
    }
  }, [jobHash, jobs, ourConfiguredJob, setOurConfiguredJob]);

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
          // if (metaframeOutputs) {
          try {
            metaframeObj.setOutputs!({ ...metaframeOutputs, ...theRest });
          } catch (err) {
            console.error("Failed to send metaframe outputs", err);
          }
          // } else {
          //   console.log(`❗no metaframeOutputs`);
          // }
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

        // console.log('dockerJob.definitionMeta', dockerJob.definitionMeta);
        // console.log('jobHashCurrent', jobHashCurrent);
        if (cancelled) {
          // console.log("cancelled")
          return;
        }
        if (jobHash !== jobHashCurrent) {
          setJobHash(jobHashCurrent);
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

          // console.log('payload', payload);

          sendClientStateChangeDeBounced(payload);
        };

        const currentJobFromTheServer = jobs[jobHashCurrent];

        if (currentJobFromTheServer) {
          // Do we need to do anything here?
          // console.log("🍔🍔 existing job with the same id id", jobHashCurrent);
          // console.log(
          //   "🍔🍔 existing job with the same id",
          //   currentJobFromTheServer
          // );
          // const isCurrentJobFromTheServerFinished =
          //   currentJobFromTheServer.history[
          //     currentJobFromTheServer.history.length - 1
          //   ]?.state === DockerJobState.Finished;

          // if (isCurrentJobFromTheServerFinished) {

          //   if (isClientJobCacheable) {
          //     console.log('🍔🍔 existing job with the same id is cacheable and finished', jobHashCurrent);
          //     setOurConfiguredJob(currentJobFromTheServer);
          //   } else {
          //     console.log(`!isClientJobCacheable and isCurrentJobFromTheServerFinished SO sendQueuedStateChange`)
          //     sendQueuedStateChange();
          //   }
          // } else {
          // console.log('🍔🍔 existing server job is not finished, but resending just in case');
          // sendQueuedStateChange();
          // console.log(
          //   "🍔🍔 existing server job is not finished, so we do nothing, since new results will come back cached or not"
          // );
          // }
        } else {
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
    outputs: <PanelOutputs job={ourConfiguredJob} />,
    settings: <PanelSettings />,
    queue: <PanelQueue />,
    editScript: <PanelEditor />,
  }
  let rightContent = rightPanelContext && rightPanelOptions[rightPanelContext];

  return (
    <VStack gap={0} minHeight="100vh" minWidth={'40rem'}>
      <MainHeader />
      <HStack gap={0} minWidth="100vw" minHeight={contentHeight}>
        <Box w="50%" minHeight={contentHeight}>
          <Container p={5}>
            <DisplayLogs job={ourConfiguredJob} stdout={true} />
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