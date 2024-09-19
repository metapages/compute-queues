import { useCallback } from 'react';

import {
  DockerJobFinishedReason,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared/types';

import {
  CloseIcon,
  RepeatClockIcon,
} from '@chakra-ui/icons';
import {
  Button,
  useMediaQuery,
} from '@chakra-ui/react';

import { useJobSubmissionHook } from '../hooks/useJobSubmissionHook';
import {
  useOptionJobsStartAutomatically,
} from '../hooks/useOptionJobsStartAutomatically';
import { useStore } from '../store';

export const ButtonJobStartControl: React.FC = () => {

  // Our currently configured job definition
  const jobDefinition = useStore(
    (state) => state.newJobDefinition
  );
  // The state (from the server) of the job
  const jobState = useStore(
    (state) => state.jobState
  );

  const [jobsStartAutomatically] = useOptionJobsStartAutomatically();
  const {submitJob, loading} = useJobSubmissionHook();
  const sendClientStateChange = useStore(
    (state) => state.sendClientStateChange
  );
  const cancelJob = useStore(
    (state) => state.cancelJob
  );

  
  const [isLargerThan800] = useMediaQuery("(min-width: 800px)");





  const onClickCancel = useCallback(() => {
    if (jobDefinition) {
      setClicked(true);
      cancelJob();
    }
  }, [cancelJob]);

  const onClickRetry = useCallback(() => {
    // if (jobDefinition) {
    //   setClicked(true);

    //   const value: StateChangeValueQueued = {
    //     definition: (job.history[0].value as StateChangeValueQueued).definition,
    //     time: Date.now(),
    //     debug,
    //   };

    //   sendClientStateChange({
    //     tag: "",
    //     state: DockerJobState.Queued,
    //     job: job.hash,
    //     value,
    //   } as StateChange);
    // }
  }, [jobDefinition, sendClientStateChange]);

  switch (jobState.state) {
    case DockerJobState.Queued:
    case DockerJobState.Running:
      return (
        <Button
          aria-label="Cancel"
          leftIcon={<CloseIcon />}
          onClick={onClickCancel}
          // isActive={!clicked}
          size="lg"
        >
          {isLargerThan800 ? "Cancel job" : ""}
        </Button>
      );
    case DockerJobState.Finished:
      const value: StateChangeValueWorkerFinished | undefined =
      jobState?.value as StateChangeValueWorkerFinished;

      if (value) {
        switch (value.reason) {
          case DockerJobFinishedReason.Error:
          case DockerJobFinishedReason.Success:
          case DockerJobFinishedReason.Cancelled:
          case DockerJobFinishedReason.TimedOut:
            return (
              <Button
                aria-label="Re-queue"
                leftIcon={<RepeatClockIcon />}
                size="lg"
                onClick={onClickRetry}
              >
                {isLargerThan800 ? "Re-queue" : ""}
              </Button>
            );
          case DockerJobFinishedReason.WorkerLost:
            return (
              <Button
                aria-label="Disabled"
                leftIcon={<CloseIcon />}
                isDisabled={true}
                size="lg"
              >
                {isLargerThan800 ? "Cancel job" : ""}
              </Button>
            );
        }
      }
      return (
        <Button
          aria-label="Disabled"
          leftIcon={<CloseIcon />}
          isDisabled={true}
          size="lg"
        />
      );
    default:
      return (
        <Button
          aria-label="Disabled"
          leftIcon={<CloseIcon />}
          isDisabled={true}
          size="lg"
        />
      );
  }
};
