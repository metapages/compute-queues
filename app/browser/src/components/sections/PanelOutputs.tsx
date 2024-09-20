import { useRef } from 'react';
import {
  DataRef,
  DockerJobDefinitionRow,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import { useStore } from '/@/store';

import {
  Table,
  Tbody,
  Td,
  Text,
  Center,
  Tr,
  Container,
  HStack,
  Icon,
} from '@chakra-ui/react';
import { ArrowDown } from '@phosphor-icons/react'

import { PanelHeader } from '/@/components/generic/PanelHeader';
import { PanelContainer } from '/@/components/generic/PanelContainer';
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
      <PanelHeader title={'Outputs'} />
      <HStack px={4} width="100%" justifyContent="space-between">
        <Text>{"/outputs/<files>"}</Text>
        
      </HStack>
      <Center px={4} width="100%">
        <Text fontSize={'0.9rem'}>Output Files</Text>
      </Center>
      <Container>
        <Table px={5} variant="simple">
          <Tbody>
            {Object.keys(outputs).map((name) => {
              
              return <Tr key={name} justifyContent={'space-between'}>
                <Td>
                  <HStack justifyContent={'space-between'}>
                    <Text>{name}</Text>
                    <Icon onClick={() => downloadFile(name, outputs[name])} boxSize={'1.4rem'} as={ArrowDown}></Icon>
                  </HStack>
                </Td>
              </Tr>
            })}
          </Tbody>
        </Table>
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