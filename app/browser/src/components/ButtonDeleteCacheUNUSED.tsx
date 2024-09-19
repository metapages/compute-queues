import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  DockerJobDefinitionRow,
  DockerJobState,
  PayloadClearJobCache,
  PayloadClearJobCacheConfirm,
  WebsocketMessageClientToServer,
  WebsocketMessageTypeClientToServer,
  WebsocketMessageTypeServerBroadcast,
} from '/@/shared/types';

import { CloseIcon } from '@chakra-ui/icons';
import {
  Button,
  useMediaQuery,
  useToast,
} from '@chakra-ui/react';

import { deleteFinishedJob } from '../cache';
import { useStore } from '../store';

interface ButtonDeleteCacheProps {
  job?: DockerJobDefinitionRow;
}

export const ButtonDeleteCacheUNUSED: React.FC<ButtonDeleteCacheProps> = ({
  job,
}) => {
  const toast = useToast();
  const jobs = useStore((state) => state.jobStates);
  const sendMessage = useStore(
    (state) => state.sendMessage
  );
  const [sentJobId, setSendJobId] = useState<string | undefined>(undefined);

  const rawMessage = useStore(
    (state) => state.rawMessage
  );

  useEffect(() => {
    const possibleMessage = rawMessage;
    if (!possibleMessage || !sentJobId) {
      return;
    }
    switch (possibleMessage.type) {
      case WebsocketMessageTypeServerBroadcast.ClearJobCacheConfirm:
        // We asked for this now we have a response
        if ((possibleMessage.payload as PayloadClearJobCacheConfirm).jobId === sentJobId) {
          setSendJobId(undefined);
          toast({
            title: `Cache cleared for ${sentJobId.substring(0,6)}`,
            status: "success",
            duration: 2000,
            isClosable: true,
          });
          
        }
        break;
      default:
        //ignored
        break;
    }

  }, [rawMessage, sentJobId, toast])
  
  
  const [isLargerThan800] = useMediaQuery("(min-width: 800px)");

  const onClickDeleteCache = useCallback(() => {

    const jobId = job?.hash;
    if (jobId) {
      deleteFinishedJob(jobId);
      // NB: I am NOT updating the store state because I don't want to retrigger
      // a resubmit, the user can do that.
      delete jobs[jobId];
      setSendJobId(jobId);
      sendMessage({
        type: WebsocketMessageTypeClientToServer.ClearJobCache,
        payload: {
          jobId,
        } as PayloadClearJobCache,
      } as WebsocketMessageClientToServer);
    }
  }, [job, sendMessage, jobs]);

  
  const isCacheDeletable = job?.state === DockerJobState.Finished;
  const text = isCacheDeletable ? "Clear job cache" : "Job must be finished to clear cache";

  return (
    <Button
      isDisabled={!job || !isCacheDeletable}
      aria-label="Cancel job"
      leftIcon={<CloseIcon />}
      onClick={onClickDeleteCache}
      isLoading={!!sentJobId}
      size="lg"
    >
      {isLargerThan800 ? text : ""}
    </Button>
  );

};
