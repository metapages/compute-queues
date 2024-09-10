import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { DisplayLogs } from '/@/components/DisplayLogs';
import { PanelInputs } from '/@/components/PanelInputs';
import { PanelJob } from '/@/components/tabs/PanelJob';
import { PanelJobLabel } from '/@/components/tabs/PanelJobLabel';
import { JobDisplayOutputs } from '/@/components/tabs/PanelOutputs';
import { PanelOutputsLabel } from '/@/components/tabs/PanelOutputsLabel';
import { PanelQueue } from '/@/components/tabs/PanelQueue';
import { PanelStdLabel } from '/@/components/tabs/PanelStdLabel';
import { TabLabelQueue } from '/@/components/tabs/queue/TabLabelQueue';
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

import { QuestionIcon } from '@chakra-ui/icons';
import {
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from '@chakra-ui/react';
import { useMetaframeAndInput } from '@metapages/metaframe-hook';
import {
  isIframe,
  MetaframeInputMap,
} from '@metapages/metapage';

import { UPLOAD_DOWNLOAD_BASE_URL } from '../config';
import { useStore } from '../store';

export const TabMenu: React.FC = () => {
  const [tabIndex, setTabIndex] = useState<number>(2);
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

        // delete the local cache if the job is not cacheable and also Finished
        // if (!isClientJobCacheable) {
        //   // not cachable means delete all the caches
        //   // remove local cache
        //   console.log(
        //     `🍔🍔 [${jobHash.substring(
        //       0,
        //       6
        //     )}] cache=false so deleting all local caches of the Finished job`
        //   );
        //   // jobs[jobHashCurrent].
        //   const currentState = jobs[jobHashCurrent];
        //   if (
        //     currentState &&
        //     isJobCacheAllowedToBeDeleted(
        //       currentState.history[currentState.history.length - 1]
        //     )
        //   ) {
        //     deleteFinishedJob(jobHashCurrent);
        //     delete jobs[jobHashCurrent];
        //   }
        // }

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

        // resubmitInterval = setInterval(() => {
        //   console.log("Resubmitting job, just in case")
        //   sendQueuedStateChange();
        // }, 6000);

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
    dockerJob,
    jobs,
    sendClientStateChangeDeBounced,
    jobHashCurrentOutputs,
  ]);

  return (
    <Tabs index={tabIndex} onChange={setTabIndex}>
      <TabList>
        <Tab>
          <PanelJobLabel job={ourConfiguredJob} />
        </Tab>
        <Tab>Inputs</Tab>
        <Tab>
          <PanelStdLabel stdout={true} job={ourConfiguredJob} />
        </Tab>
        <Tab>
          <PanelStdLabel stdout={false} job={ourConfiguredJob} />
        </Tab>
        <Tab>
          <PanelOutputsLabel job={ourConfiguredJob} />
        </Tab>
        <Tab>
          <TabLabelQueue />
        </Tab>
        <Tab>
          <QuestionIcon />
          &nbsp; Help{" "}
        </Tab>
      </TabList>

      <TabPanels>
        <TabPanel>
          <PanelJob job={ourConfiguredJob} />
        </TabPanel>

        <TabPanel>
          <PanelInputs />
        </TabPanel>
        <TabPanel background="#ECF2F7">
          <DisplayLogs job={ourConfiguredJob} stdout={true} />
        </TabPanel>

        <TabPanel>
          <DisplayLogs job={ourConfiguredJob} stdout={false} />
        </TabPanel>
        <TabPanel>
          <JobDisplayOutputs job={ourConfiguredJob} />
        </TabPanel>
        <TabPanel>
          <PanelQueue />
        </TabPanel>

        <TabPanel>
          <iframe
            style={{ width: "100%", height: "90vh" }}
            src={`https://markdown.mtfm.io/#?url=${globalThis.location.origin}${
              globalThis.location.pathname.endsWith("/")
                ? globalThis.location.pathname.substring(
                    0,
                    globalThis.location.pathname.length - 2
                  )
                : globalThis.location.pathname
            }/README.md`}
          />
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
};
