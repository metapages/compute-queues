import { DockerJobState } from '/@/shared';

import { useServerState } from './serverStateHook';

export const useActiveJobsCount = () => {
  const {jobStates} = useServerState();

  if (jobStates?.state?.jobs === undefined) {
    return 0;
  }

  const jobIds = (
    Object.keys(jobStates?.state?.jobs)
  ).filter((jobId) => {
    const jobState = jobStates?.state?.jobs
      ? jobStates.state.jobs[jobId].state
      : DockerJobState.Finished;
    return jobState !== DockerJobState.Finished;
  });

  return jobIds.length;
};
