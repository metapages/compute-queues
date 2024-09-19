import {
  useCallback,
  useEffect,
  // useState,
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

export const JobControlButton: React.FC = () => {
  const job = useStore((state) => state.jobState);
  const [isLargerThan600] = useMediaQuery("(min-width: 600px)");
  // Question: do we need this?
  // const [clicked, setClicked] = useState<boolean>(false);
  const sendClientStateChange = useStore(
    (state) => state.sendClientStateChange
  );
  const [debug] = useHashParamBoolean("debug");

  useEffect(() => {
    // setClicked(false);
  }, [sendClientStateChange]);

  const state = job?.state;

  const onClickCancel = useCallback(() => {
    if (job) {
      // setClicked(true);
      sendClientStateChange({
        tag: "",
        state: DockerJobState.Finished,
        job: job.hash,
        value: {
          reason: DockerJobFinishedReason.Cancelled,
          time: Date.now(),
        },
      } as StateChange);
    }
  }, [job, sendClientStateChange]);

  const onClickRetry = useCallback(() => {
    if (job) {
      // setClicked(true);

      const value: StateChangeValueQueued = {
        definition: (job.history[0].value as StateChangeValueQueued).definition,
        time: Date.now(),
        debug,
      };

      sendClientStateChange({
        tag: "",
        state: DockerJobState.Queued,
        job: job.hash,
        value,
      } as StateChange);
    }
  }, [job, sendClientStateChange, debug]);

  const disabledButton = (
    <HeaderButton
      ariaLabel="Disabled"
      text={isLargerThan600 ? 'Disabled' : ''}
      icon={<Icon as={Lock} size={'1.2rem'} />}
    />
  );

  const cancelButton = (
    <HeaderButton
      ariaLabel="Stop-job"
      icon={<Stop weight='duotone' color='red' size={'1.2rem'} />}
      onClick={onClickCancel}
      text={isLargerThan600 ? "Stop Job" : ""}
      color={'red'}
    />
  );

  const requeueButton = (
    <HeaderButton
      ariaLabel="Re-queue"
      icon={<Icon as={Repeat} size={'1.2rem'} />}
      onClick={onClickRetry}
      text={isLargerThan600 ? "Re-queue" : ""}
    />
  );

  const runButton = (
    <HeaderButton
      ariaLabel="Run-job"
      icon={<Play weight='duotone' color='green' size={'1.2rem'} />}
      onClick={() => {}}
      text={isLargerThan600 ? "Run Job" : ""}
      color={'green'}
    />
  );

  const runButtonDisabled = (
    <HeaderButton
      ariaLabel="Run-job"
      icon={<Play weight='duotone' color='gray' size={'1.2rem'} />}
      text={isLargerThan600 ? "Run Job" : ""}
      color={'gray'}
    />
  );

  switch (state) {
    case DockerJobState.Queued:
    case DockerJobState.Running:
      return cancelButton;
    case DockerJobState.Finished:
      const value: StateChangeValueWorkerFinished | undefined =
        job?.value as StateChangeValueWorkerFinished;
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
};