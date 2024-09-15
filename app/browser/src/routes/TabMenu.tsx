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
  const [tabIndex, setTabIndex] = useState<number>(0);
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
          <PanelJobLabel />
        </Tab>
        <Tab>Inputs</Tab>
        <Tab>
          <PanelStdLabel stdout={true} />
        </Tab>
        <Tab>
          <PanelStdLabel stdout={false} />
        </Tab>
        <Tab>
          <PanelOutputsLabel />
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
          <PanelJob />
        </TabPanel>

        <TabPanel>
          <PanelInputs />
        </TabPanel>
        <TabPanel background="#ECF2F7">
          <DisplayLogs mode={"stdout"} />
        </TabPanel>

        <TabPanel>
          <DisplayLogs mode={"stderr"} />
        </TabPanel>
        <TabPanel>
          <JobDisplayOutputs />
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
