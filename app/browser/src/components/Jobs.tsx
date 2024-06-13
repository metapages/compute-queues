import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  BroadcastJobStates,
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  StateChange,
  StateChangeValueQueued,
  WebsocketMessageTypeClientToServer,
} from '/@/shared';

import { CloseIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';

import { useServerState } from '../hooks/serverStateHook';

export const Jobs: React.FC = () => {
  const {jobStates} = useServerState();
  const jobs = jobStates?.state?.jobs || {};

  const jobIds = jobs ? Object.keys(jobs) : [];
  jobIds.sort((jobA, jobB) => {
    const jobAActive =
      jobs[jobA].state === DockerJobState.Running ||
      jobs[jobA].state === DockerJobState.Queued;
    const jobBActive =
      jobs[jobB].state === DockerJobState.Running ||
      jobs[jobB].state === DockerJobState.Queued;
    if (jobAActive && !jobBActive) {
      return -1;
    }
    if (!jobAActive && jobBActive) {
      return 1;
    }

    const timeA = jobs[jobA].value.time;
    const timeB = jobs[jobB].value.time;
    return new Date(timeB).getTime() - new Date(timeA).getTime();
  });

  return (
    <Box width="100%" p={2}>
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>Id</Th>
            <Th>image</Th>
            <Th>command</Th>
            <Th>Time</Th>
            <Th>State</Th>
            <Th>Cancel</Th>
          </Tr>
        </Thead>
        <Tbody>
          {jobIds.map((jobHash) => (
            <JobComponent key={jobHash} jobId={jobHash} state={jobStates} />
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};

const JobComponent: React.FC<{
  jobId: string;
  state: BroadcastJobStates;
}> = ({ jobId, state }) => {
  // How many jobs is this worker running
  const jobBlob = state.state.jobs[jobId];
  const definition = (jobBlob!.history[0]!.value as StateChangeValueQueued)
    .definition;

  return (
    <Tr>
      <Td>{jobId}</Td>
      <Td>{definition.image}</Td>
      <Td>{definition.command}</Td>
      <Td>TBD</Td>
      <Td>{jobBlob.state}</Td>
      <Td>
        <ButtonJobCancel job={jobBlob} />
      </Td>
    </Tr>
  );
};

const ButtonJobCancel: React.FC<{ job: DockerJobDefinitionRow }> = ({
  job,
}) => {
  const [clicked, setClicked] = useState<boolean>(false);
  const {stateChange} = useServerState();

  useEffect(() => {
    setClicked(false);
  }, [stateChange]);

  const state = job?.state;

  const onClickCancel = useCallback(() => {
    if (stateChange && job) {
      setClicked(true);
      stateChange({
        type: WebsocketMessageTypeClientToServer.StateChange,
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
  }, [job, stateChange]);

  switch (state) {
    case DockerJobState.Queued:
    case DockerJobState.Running:
      return (
        <Button
          aria-label="Cancel"
          // @ts-ignore
          leftIcon={<CloseIcon />}
          onClick={onClickCancel}
          isActive={!clicked}
          size="sm"
        ></Button>
      );
    case DockerJobState.Finished:
      return null;
    default:
      return null;
  }
};
