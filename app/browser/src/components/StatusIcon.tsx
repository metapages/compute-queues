import { DockerJobDefinitionParamsInUrlHash } from '/@/components/types';
import { useServerState } from '/@/hooks/serverStateHook';
import {
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';

import {
  CheckIcon,
  WarningIcon,
} from '@chakra-ui/icons';
import { Spinner } from '@chakra-ui/react';
import {
  useHashParam,
  useHashParamJson,
} from '@metapages/hash-query';

export const StatusIcon: React.FC<{
  job?: DockerJobDefinitionRow;
}> = ({ job }) => {
  const [queue] = useHashParam("queue", "");
  const [jobDefinitionBlob] =
    useHashParamJson<DockerJobDefinitionParamsInUrlHash>("job");
  const serverState = useServerState();
  const state = job?.state;

  let isJobHereOrOnServer = !!job;
  if (!job) {
    if (jobDefinitionBlob?.image) {
      isJobHereOrOnServer = true;
    }
  }

  if (!queue) {
    return <WarningIcon color="red" />;
  }

  if (!!queue && !serverState.connected) {
    return <Spinner size="sm" />;
  }

  if (!job) {
    if (isJobHereOrOnServer) {
      return <Spinner size="sm" />;
    } else {
      return <WarningIcon color="red" />;
    }
  }

  if (!state) {
    return <Spinner size="sm" />;
  }

  switch (state) {
    case DockerJobState.Finished:
      const resultFinished = job.value as StateChangeValueWorkerFinished;
      if (!resultFinished) {
        return <WarningIcon color="red" />;
      }
      switch (resultFinished.reason) {
        case DockerJobFinishedReason.Cancelled:
          return <WarningIcon color="blue" />;
        case DockerJobFinishedReason.Error:
          return <WarningIcon color="red" />;
        case DockerJobFinishedReason.Success:
          return <CheckIcon color="green" />;
        case DockerJobFinishedReason.TimedOut:
          return <WarningIcon color="orange" />;
        case DockerJobFinishedReason.WorkerLost:
          return <WarningIcon color="orange" />;
      }
    case DockerJobState.Queued:
    case DockerJobState.ReQueued:
      return <WarningIcon color="orange" />;
    case DockerJobState.Running:
      return <Spinner size="sm" />;
  }
};
