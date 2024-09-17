import {
  DockerJobState,
  JobsStateMap,
  StateChangeValueRunning,
} from '/@/shared';

import {
  Box,
  Table,
  TableCaption,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';

import { useStore } from '../store';

export const Workers: React.FC = () => {
  const workers = useStore((state) => state.workers);
  const jobs = useStore((state) => state.jobStates);

  return (
    <Box width="100%" p={2}>
      <Table width="100%" variant="simple">
        <TableCaption>(will run jobs)</TableCaption>
        <Thead>
          <Tr>
            <Th>ID</Th>
            <Th>CPUs</Th>
            <Th>GPUs</Th>
            <Th>Jobs</Th>
          </Tr>
        </Thead>
        <Tbody>
          {workers?.workers?.map((worker) => (
            <WorkerComponent
              key={worker.id}
              gpus={worker.gpus}
              cpus={worker.cpus}
              workerId={worker.id}
              jobs={jobs}
            />
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};

const WorkerComponent: React.FC<{
  workerId: string;
  cpus: number;
  gpus: number;
  jobs: JobsStateMap;
}> = ({ workerId, cpus, gpus, jobs }) => {
  // How many jobs is this worker running
  const jobCount = !jobs
    ? 0
    : Object.keys(jobs)
        .filter((jobId) => jobs[jobId].state === DockerJobState.Running)
        .reduce<number>((count: number, jobHash: string) => {
          const running = jobs[jobHash].history.filter(
            (state) => state.state === DockerJobState.Running
          );
          if (running.length > 0) {
            const workerRunning = running[running.length - 1]
              .value as StateChangeValueRunning;
            if (workerRunning.worker === workerId) {
              return count + 1;
            }
          }
          return count;
        }, 0);

  return (
    <Tr>
      <Td>{workerId.substring(0, 6)}</Td>
      <Td>{cpus}</Td>
      <Td>{gpus || 0}</Td>
      <Td>{jobCount}</Td>
    </Tr>
  );
};
