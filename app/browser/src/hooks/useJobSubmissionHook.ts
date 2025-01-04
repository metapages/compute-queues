import { useCallback, useEffect, useRef, useState } from "react";

import { useStore } from "../store";
import { useOptionJobStartAutomatically } from "./useOptionJobStartAutomatically";

/**
 * Get the current client-defined job definition and submit it to the server
 * @returns job submission hook
 */
export const useJobSubmissionHook = () => {
  const [isJobStartingAutomatically] = useOptionJobStartAutomatically();
  const dockerJobClient = useStore(state => state.newJobDefinition);
  const dockerJobClientRef = useRef(dockerJobClient);
  const dockerJobServer = useStore(state => state.jobState);
  const dockerJobServerRef = useRef(dockerJobServer);
  // Check this efficiently
  useEffect(() => {
    dockerJobServerRef.current = dockerJobServer;
  }, [dockerJobServer]);

  const connected = useStore(state => state.isServerConnected);
  const submitJobFromStore = useStore(state => state.submitJob);
  const queryJob = useStore(state => state.queryJob);
  const [loading, setLoading] = useState<boolean>(false);

  // Start job automatically? Only do this for the first job
  useEffect(() => {
    // always query the job to see if it's already running/finished
    queryJob();
    if (!isJobStartingAutomatically) {
      return;
    }
    if (!dockerJobClientRef.current && dockerJobClient) {
      dockerJobClientRef.current = dockerJobClient;
      submitJobFromStore();
    }
  }, [dockerJobClient, isJobStartingAutomatically, submitJobFromStore, queryJob]);

  // track the job state that matches our job definition (created by URL query params and inputs)
  // when we get the correct job state, it's straightforward to just show it
  const submitJob = useCallback(() => {
    if (!connected || !dockerJobClient?.definition) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let loadingCheckInterval = undefined;

    (async () => {
      const jobHashCurrent = dockerJobClient.hash; //await shaObject(dockerJobClient.definition);

      if (cancelled) {
        return;
      }

      // If we have a matching job from the server, we don't need to submit it again
      if (dockerJobServerRef.current?.hash === jobHashCurrent) {
        return;
      }

      setLoading(true);
      submitJobFromStore();

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
