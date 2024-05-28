import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  StateChange,
  StateChangeValueQueued,
  StateChangeValueWorkerFinished,
  WebsocketMessageType,
} from '/@/shared/types';

import {
  CloseIcon,
  RepeatClockIcon,
} from '@chakra-ui/icons';
import {
  Button,
  useMediaQuery,
} from '@chakra-ui/react';
import { useHashParam } from '@metapages/hash-query';

import { useServerState } from '../hooks/serverStateHook';

interface ButtonCancelOrRetryProps {
  job?: DockerJobDefinitionRow;
}

export const ButtonCancelOrRetry: React.FC<ButtonCancelOrRetryProps> = ({
  job,
}) => {
  const [clicked, setClicked] = useState<boolean>(false);
  const serverState = useServerState();
  const [nocacheString, setnocacheString] = useHashParam("nocache");
  const [isLargerThan800] = useMediaQuery('(min-width: 800px)');

  useEffect(() => {
    setClicked(false);
  }, [serverState]);

  const state = job?.state;

  const onClickCancel = useCallback(() => {
    if (serverState.stateChange && job) {
      setClicked(true);
      serverState.stateChange({
        type: WebsocketMessageType.StateChange,
        payload: {
          tag: "",
          state: DockerJobState.Finished,
          job: job.hash,
          value: {
            reason: DockerJobFinishedReason.Cancelled,
            time: new Date(),
          },
        } as StateChange,
      });
    }
  }, [job, serverState.stateChange]);

  const onClickRetry = useCallback(() => {
    if (serverState.stateChange && job) {
      setClicked(true);

      const value: StateChangeValueQueued = {
        definition: (job.history[0].value as StateChangeValueQueued).definition,
        time: new Date(),
        nocache: nocacheString === "1" || nocacheString === "true",
      };

      serverState.stateChange({
        type: WebsocketMessageType.StateChange,
        payload: {
          tag: "",
          state: DockerJobState.Queued,
          job: job.hash,
          value,
        } as StateChange,
      });
    }
  }, [job, serverState.stateChange]);

  switch (state) {
    case DockerJobState.Queued:
    case DockerJobState.Running:
      return (
        <Button
          aria-label="Cancel"
          leftIcon={<CloseIcon />}
          onClick={onClickCancel}
          isActive={!clicked}
          size="lg"
        >
          { isLargerThan800 ? "Cancel job" : ""}
        </Button>
      );
    case DockerJobState.Finished:
      const value: StateChangeValueWorkerFinished | undefined =
        job?.value as StateChangeValueWorkerFinished;

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
                { isLargerThan800 ? "Re-queue" : ""}
                
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
                { isLargerThan800 ? "Cancel job" : ""}
                
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
