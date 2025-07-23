import { useCallback, useEffect, useRef, useState } from "react";

import { JobStateTuple, useStore } from "../store";
import { useOptionJobStartAutomatically } from "./useOptionJobStartAutomatically";

/**
 * Get the current client-defined job definition and submit it to the server
 * @returns job submission hook
 */
export const useJobSubmissionHook = () => {
  const [isJobStartingAutomatically] = useOptionJobStartAutomatically();
  const dockerJobClient = useStore(state => state.newJobDefinition);
  const dockerJobClientRef = useRef(dockerJobClient);
  const [jobId, dockerJobServer] = useStore(state => state.jobState);
  const dockerJobServerRef = useRef<JobStateTuple>([jobId, dockerJobServer]);
  // Check this efficiently
  useEffect(() => {
    dockerJobServerRef.current = [jobId, dockerJobServer];
  }, [jobId, dockerJobServer]);

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
    submitJobFromStore();

    // let cancelled = false;
    // let loadingCheckInterval = undefined;

    // (async () => {
    //   const jobHashCurrent = dockerJobClient.hash;

    //   if (cancelled) {
    //     return;
    //   }

    //   const [refJobId, refJob] = dockerJobServerRef.current || [];

    //   // If we have a matching job from the server, we don't need to submit it again
    //   if (refJobId === jobHashCurrent && !!refJob && !isJobDeletedOrRemoved(refJob)) {
    //     return;
    //   }

    //   setLoading(true);
    //   submitJobFromStore();

    //   loadingCheckInterval = setInterval(() => {
    //     if (dockerJobServerRef.current?.[0] === jobHashCurrent) {
    //       setLoading(false);
    //       clearInterval(loadingCheckInterval);
    //     }
    //   }, 1000);
    // })();

    // return () => {
    //   cancelled = true;
    //   setLoading(false);
    //   if (loadingCheckInterval) {
    //     clearInterval(loadingCheckInterval);
    //   }
    // };
  }, [submitJobFromStore, connected, jobId, dockerJobClient]);

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
