import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useStore } from '../store';
import {
  useOptionJobStartAutomatically,
} from './useOptionJobStartAutomatically';

/**
 * Get the current client-defined job definition and submit it to the server
 * @returns job submission hook
 */
export const useJobSubmissionHook = () => {
  const [isJobStartingAutomatically] = useOptionJobStartAutomatically();
  const dockerJobClient = useStore((state) => state.newJobDefinition);
  const dockerJobClientRef = useRef(dockerJobClient);
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
  const submitJobFromStore = useStore(
    (state) => state.submitJob
  );
  const [loading, setLoading] = useState<boolean>(false);

  // Start job automatically? Only do this for the first job
  useEffect(() => {
    if (!isJobStartingAutomatically) {
      return;
    }
    if (!dockerJobClientRef.current && dockerJobClient) {
      dockerJobClientRef.current = dockerJobClient;
      submitJobFromStore();
    }
  }, [dockerJobClient, isJobStartingAutomatically, submitJobFromStore]);


  // const sendClientStateChangeDeBounced = useCallback(
  //   pDebounce((payload: StateChange) => {
  //     // console.log("🍔 ACTUALLY debounced sending payload", payload);
  //     sendClientStateChange(payload);
  //   }, 200),
  //   [sendClientStateChange]
  // );

  // track the job state that matches our job definition (created by URL query params and inputs)
  // when we get the correct job state, it's straightforward to just show it
  const submitJob = useCallback(() => {
    if (!connected || !dockerJobClient?.definition) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let loadingCheckInterval: number | undefined = undefined;

    (async () => {
      const jobHashCurrent = dockerJobClient.hash;//await shaObject(dockerJobClient.definition);

      if (cancelled) {
        return;
      }

      // If we have a matching job from the server, we don't need to submit it again
      if (dockerJobServerRef.current?.hash === jobHashCurrent) {
        return;
      }

      // const sendQueuedStateChange = () => {
      //   console.log(`🍔🍔 sendQueuedStateChange id=${jobHashCurrent}`);
      //   // inputs are already minified (fat blobs uploaded to the cloud)
      //   const value: StateChangeValueQueued = {
      //     definition: dockerJobClient!.definition!,
      //     time: Date.now(),
      //   };
      //   if (dockerJobClient.debug) {
      //     value.debug = true;
      //   }
      //   const payload: StateChange = {
      //     state: DockerJobState.Queued,
      //     value,
      //     job: jobHashCurrent,
      //     tag: "", // document the meaning of this. It's the worker claim. Might be unneccesary due to history
      //   };

      //   sendClientStateChangeDeBounced(payload);
      // };

      setLoading(true);
      submitJobFromStore();
      // sendQueuedStateChange();

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
      if (loadingCheckInterval) {
        clearInterval(loadingCheckInterval);
      }
    };
  }, [submitJobFromStore, connected, dockerJobClient]);

  
  useEffect(() => {
    if (isJobStartingAutomatically) {
      submitJob();
    }
  }, [isJobStartingAutomatically, submitJob]);

  return {
    submitJob,
    loading,
  };
};
