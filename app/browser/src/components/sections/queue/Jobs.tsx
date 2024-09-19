import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  JobsStateMap,
  StateChange,
  StateChangeValueQueued,
} from '/@/shared';

import { CloseIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';

import { useStore } from '/@/store';

export const Jobs: React.FC = () => {
  const jobs = useStore((state) => state.jobStates);

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
    <Box p={2}>
      <TableContainer whiteSpace={'wrap'} fontSize={'0.7rem'}>
        <Table layout={'fixed'} size={'sm'} width={'100%'} variant="simple">
          <Thead>
            <Tr>
              <Th w={'15%'}>Id</Th>
              <Th w={'20%'}>image</Th>
              <Th w={'20%'}>command</Th>
              <Th w={'15%'}>Time</Th>
              <Th w={'15%'}>State</Th>
              <Th w={'15%'}>Cancel</Th>
            </Tr>
          </Thead>
          <Tbody>
            {jobIds.map((jobHash) => (
              <JobComponent key={jobHash} jobId={jobHash} jobs={jobs} />
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </Box>
  );
};

const JobComponent: React.FC<{
  jobId: string;
  jobs: JobsStateMap;
}> = ({ jobId, jobs }) => {
  // How many jobs is this worker running
  const jobBlob = jobs[jobId];
  // console.log('jobBlob', jobBlob);
  const definition = (jobBlob!.history[0]!.value as StateChangeValueQueued)
    .definition;

  return (
    <Tr>
      <Td>{jobId.substring(0, 6)}</Td>
      <Td style={{ wordBreak: "break-word" }}>{definition.image}</Td>
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
  const sendClientStateChange = useStore(
    (state) => state.sendClientStateChange
  );

  useEffect(() => {
    setClicked(false);
  }, [sendClientStateChange]);

  const state = job?.state;

  const onClickCancel = useCallback(() => {
    if (job) {
      setClicked(true);
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

  switch (state) {
    case DockerJobState.Queued:
    case DockerJobState.ReQueued:
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
