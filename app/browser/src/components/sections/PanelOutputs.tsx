import { PanelContainer } from '/@/components/generic/PanelContainer';
import { PanelHeader } from '/@/components/generic/PanelHeader';
import {
  DataRef,
  DockerJobDefinitionRow,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import { useStore } from '/@/store';

import {
  Container,
  HStack,
  Icon,
  Table,
  Tbody,
  Td,
  Text,
  Tr,
} from '@chakra-ui/react';
import { ArrowDown } from '@phosphor-icons/react';

// import { UPLOAD_DOWNLOAD_BASE_URL } from '/@/config';

export const PanelOutputs: React.FC = () => {
  const job = useStore((state) => state.jobState);
  const outputs = getOutputs(job);

  const downloadFile = async (name: string, outPut: DataRef) => {
    // TODO: add download functionality
    // use dataRefToBuffer?
  }
  return (
    <PanelContainer>
      <PanelHeader title={`Outputs (${outputs ? Object.keys(outputs).length : 0})`} />
      <Container width="100%" overflow={'scroll'} p={0}>
        <Text px={4}>{"/outputs/<files>"}</Text>
        <Container>
          <Table px={5} variant="simple">
            <Tbody>
              {Object.keys(outputs).map((name) => {
                return <Tr key={name} justifyContent={'space-between'}>
                  <Td>
                    <HStack p={2} justifyContent={'space-between'}>
                      <Text>{name}</Text>
                      <Icon onClick={() => downloadFile(name, outputs[name])} boxSize={'1.4rem'} as={ArrowDown}></Icon>
                    </HStack>
                  </Td>
                </Tr>
              })}
            </Tbody>
          </Table>
        </Container>
      </Container>
    </PanelContainer>
  );
};

export const getOutputs = (job?: DockerJobDefinitionRow) => {
  if (!job?.state || job.state !== DockerJobState.Finished) {
    return {};
  }
  const result = (job.value as StateChangeValueWorkerFinished).result;
  if (result && result.outputs) {
    return result.outputs;
  }
  return {};
};