import { DockerJobState } from "/@shared/client";

import { useStore } from "../store";

export const useActiveJobsCount = () => {
  const jobs = useStore(state => state.jobStates);

  if (jobs === undefined) {
    return 0;
  }

  const jobIds = Object.keys(jobs).filter(jobId => {
    const jobState = jobs ? jobs[jobId].state : DockerJobState.Finished;
    return jobState !== DockerJobState.Finished;
  });

  return jobIds.length;
};
