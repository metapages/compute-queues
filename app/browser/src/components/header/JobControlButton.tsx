import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  DockerJobFinishedReason,
  DockerJobState,
  StateChange,
  StateChangeValueQueued,
  StateChangeValueWorkerFinished,
} from '/@/shared/types';

import {
  Button,
  HStack,
  Icon,
  Spacer,
  Text,
  useMediaQuery,
} from '@chakra-ui/react';
import { useHashParamBoolean } from '@metapages/hash-query';

import { useStore } from '../../store';
import { Play, Repeat, Stop, Lock } from '@phosphor-icons/react';
import { useJobSubmissionHook } from '/@/hooks/useJobSubmissionHook';
import { useOptionJobsStartAutomatically } from '/@/hooks/useOptionJobsStartAutomatically';

export const JobControlButton: React.FC = () => {
  
  const [jobsStartAutomatically] = useOptionJobsStartAutomatically();
  const clientJobDefinition = useStore((state) => state.newJobDefinition);
  const serverJobState = useStore((state) => state.jobState);
  const [isLargerThan800] = useMediaQuery("(min-width: 800px)");
  
  const {submitJob, loading} = useJobSubmissionHook();
  const cancelJob = useStore(
    (state) => state.cancelJob
  );
  const deleteJobCache = useStore(
    (state) => state.deleteJobCache
  );
  
  const sendClientStateChange = useStore(
    (state) => state.sendClientStateChange
  );
  const [debug] = useHashParamBoolean("debug");

  // useEffect(() => {
  //   setClicked(false);
  // }, [sendClientStateChange]);

  const state = serverJobState?.state;

  const onClickCancel = useCallback(() => {
    cancelJob();
  }, [cancelJob]);

  const onClickRetry = useCallback(() => {
    if (serverJobState) {
      // setClicked(true);

      const value: StateChangeValueQueued = {
        definition: (serverJobState.history[0].value as StateChangeValueQueued).definition,
        time: Date.now(),
        debug,
      };

      sendClientStateChange({
        tag: "",
        state: DockerJobState.Queued,
        job: serverJobState.hash,
        value,
      } as StateChange);
    }
  }, [serverJobState, sendClientStateChange, debug]);

  const disabledButton = (
    <HeaderButton
      ariaLabel="Disabled"
      text={isLargerThan800 ? 'Disabled' : ''}
      icon={<Icon as={Lock} size={'1.2rem'} />}
    />
  );

  const cancelButton = (
    <HeaderButton
      ariaLabel="Stop-job"
      icon={<Stop weight='duotone' color='red' size={'1.2rem'} />}
      onClick={onClickCancel}
      text={isLargerThan800 ? "Stop Job" : ""}
      color={'red'}
    />
  );

  const requeueButton = (
    <HeaderButton
      ariaLabel="Re-queue"
      icon={<Icon as={Repeat} size={'1.2rem'} />}
      onClick={onClickRetry}
      text={isLargerThan800 ? "Re-queue" : ""}
    />
  );

  const runButton = (
    <HeaderButton
      ariaLabel="Run-job"
      icon={<Play weight='duotone' color='green' size={'1.2rem'} />}
      onClick={submitJob}
      text={isLargerThan800 ? "Run Job" : ""}
      color={'green'}
    />
  );

  const runButtonDisabled = (
    <HeaderButton
      ariaLabel="Run-job"
      icon={<Play weight='duotone' color='gray' size={'1.2rem'} />}
      text={isLargerThan800 ? "Run Job" : ""}
      color={'gray'}
    />
  );

  if (!state) {
    return runButton;
  }

  switch (state) {
    case DockerJobState.Queued:
    case DockerJobState.Running:
      return cancelButton;
    case DockerJobState.Finished:
      const value: StateChangeValueWorkerFinished | undefined =
        serverJobState?.value as StateChangeValueWorkerFinished;
      if (value) {
        switch (value.reason) {
          case DockerJobFinishedReason.Error:
          case DockerJobFinishedReason.Success:
          case DockerJobFinishedReason.Cancelled:
          case DockerJobFinishedReason.TimedOut:
            return requeueButton;
          case DockerJobFinishedReason.WorkerLost:
            return cancelButton;
        }
      }
      return disabledButton;
    default:
      return disabledButton;
  }
};

const HeaderButton: React.FC<{
  text: string, 
  ariaLabel: string, 
  onClick?: () => void, 
  icon?: any,
  color?: string,
}> = ({text, ariaLabel, onClick, icon, color}) => {
  return <Button disabled={true}
    width={'7.5rem'}
    aria-label={ariaLabel}
    variant={'ghost'} 
    _hover={{bg: 'none'}}
    onClick={onClick}
    cursor={onClick ? 'pointer' : 'not-allowed'}
  >
    <HStack gap={2}>
      {icon}
      <Spacer />
    </HStack>
    <Text color={color || 'gray.35'} fontWeight={500} fontSize={'0.9rem'}>{text}</Text>
  </Button>
}