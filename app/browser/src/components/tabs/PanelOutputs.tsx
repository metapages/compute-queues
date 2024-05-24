import {
  DockerJobDefinitionRow,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';

import {
  Box,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';
import { useHashParam } from '@metapages/hash-query';

export const JobDisplayOutputs: React.FC<{
  job: DockerJobDefinitionRow | undefined;
}> = ({ job }) => {
  const [queue] = useHashParam("queue");
  return (
    <Box maxW="100%" p={2}>
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>Outputs:</Th>
          </Tr>
        </Thead>
        <Tbody>
          {getOutputNames(job).map((name) => (
            <Tr key={name}>
              <Td>{name}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};

export const getOutputNames = (job?: DockerJobDefinitionRow) => {
  if (!job?.state || job.state !== DockerJobState.Finished) {
    return [];
  }
  const result = (job.value as StateChangeValueWorkerFinished).result;
  if (result && result.outputs) {
    const names = Object.keys(result.outputs);
    names.sort();
    return names;
  }
  return [];
};
