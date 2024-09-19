import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  DockerJobState,
  shaObject,
  StateChange,
  StateChangeValueQueued,
} from '/@/shared';
import pDebounce from 'p-debounce';

import { useStore } from '../store';
import {
  useOptionJobsStartAutomatically,
} from './useOptionJobsStartAutomatically';

/**
 * Get the current client-defined job definition and submit it to the server
 * @returns job submission hook
 */
export const useJobSubmissionHook = () => {
  const [areJobsStartingAutomatically] = useOptionJobsStartAutomatically();
  const dockerJobClient = useStore((state) => state.newJobDefinition);
  const dockerJobServer = useStore((state) => state.jobState);
  const dockerJobServerRef = useRef(dockerJobServer);
  // Check this efficiently
  useEffect(() => {
    dockerJobServerRef.current = dockerJobServer;
  }, [dockerJobServer]);

  const connected = useStore((state) => state.isServerConnected);
  const sendClientStateChange = useStore(
    (state) => state.sendClientStateChange
  );
  const [loading, setLoading] = useState<boolean>(false);

  const sendClientStateChangeDeBounced = useCallback(
    pDebounce((payload: StateChange) => {
      // console.log("🍔 ACTUALLY debounced sending payload", payload);
      sendClientStateChange(payload);
    }, 200),
    [sendClientStateChange]
  );

  // track the job state that matches our job definition (created by URL query params and inputs)
  // when we get the correct job state, it's straightforward to just show it
  const submitJob = useCallback(() => {
    if (!connected || !dockerJobClient?.definition) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    let resubmitInterval: number | undefined = undefined;
    let loadingCheckInterval: number | undefined = undefined;

    (async () => {
      // console.log('❔ dockerJob', dockerJob);
      // console.log('❔ jobStates', jobs);

      const jobHashCurrent = await shaObject(dockerJobClient.definition);

      if (cancelled) {
        return;
      }

      // If we have a matching job from the server, we don't need to submit it again
      if (dockerJobServerRef.current?.hash === jobHashCurrent) {
        return;
      }

      const sendQueuedStateChange = () => {
        // console.log(`🍔🍔 sendQueuedStateChange id=${jobHash}`);
        // inputs are already minified (fat blobs uploaded to the cloud)
        const value: StateChangeValueQueued = {
          definition: dockerJobClient!.definition!,
          time: Date.now(),
        };
        if (dockerJobClient.debug) {
          value.debug = true;
        }
        const payload: StateChange = {
          state: DockerJobState.Queued,
          value,
          job: jobHashCurrent,
          tag: "", // document the meaning of this. It's the worker claim. Might be unneccesary due to history
        };

        sendClientStateChangeDeBounced(payload);
      };

      setLoading(true);
      sendQueuedStateChange();

      resubmitInterval = setInterval(() => {
        if (dockerJobServerRef.current?.hash !== jobHashCurrent) {
          sendQueuedStateChange();
        }
      }, 4000);

      loadingCheckInterval = setInterval(() => {
        if (dockerJobServerRef.current?.hash === jobHashCurrent) {
          setLoading(false);
          clearInterval(loadingCheckInterval);
        }
      }, 1000);
    })();

    return () => {
      cancelled = true;
      setLoading(false);
      if (resubmitInterval) {
        clearInterval(resubmitInterval);
      }
      if (loadingCheckInterval) {
        clearInterval(loadingCheckInterval);
      }
    };
  }, [connected, dockerJobClient, sendClientStateChangeDeBounced]);

  
  useEffect(() => {
    if (areJobsStartingAutomatically) {
      submitJob();
    }
  }, [areJobsStartingAutomatically, submitJob]);

  return {
    submitJob,
    loading,
  };
};
