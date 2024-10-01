import { getOutputs } from './util';
import { PanelContainer } from '/@/components/generic/PanelContainer';
import { PanelHeader } from '/@/components/generic/PanelHeader';
import {
  DataRef,
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
    <PanelContainer gap={4}>
      <PanelHeader title={`Outputs (${outputs ? Object.keys(outputs).length : 0})`} />
      <HStack px={4} width="100%" justifyContent="space-between">
        <Text>{"/outputs/<files>"}</Text>
      </HStack>
      <Container width="100%" overflow={'scroll'} p={0}>
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
    </PanelContainer>
  );
};
