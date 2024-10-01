import { useCallback } from 'react';

import { PanelContainer } from '/@/components/generic/PanelContainer';
import { PanelHeader } from '/@/components/generic/PanelHeader';
import { useStore } from '/@/store';

import {
  Container,
  HStack,
  Icon,
  Spacer,
  Table,
  Tbody,
  Td,
  Text,
  Tr,
} from '@chakra-ui/react';
import { ArrowDown } from '@phosphor-icons/react';

import {
  downloadFile,
  getOutputs,
  zipAndDownloadDatarefs,
} from '/@/shared/util';

export const PanelOutputs: React.FC = () => {
  const job = useStore(state => state.jobState);
  const outputs = getOutputs(job);
  const downloadAll = useCallback(async () => {
    await zipAndDownloadDatarefs(outputs, "all-outputs");
  }, [outputs]);
  const outputCount = outputs ? Object.keys(outputs).length : 0;

  return (
    <PanelContainer>
      <PanelHeader title={`Outputs`} />
      <HStack px={4} width="100%" justifyContent="space-between">
        <Text>{"/outputs/<files>"}</Text>
        <Spacer />
        <Text>Download All ({outputCount})</Text>
        <Icon onClick={downloadAll} boxSize={"1.1rem"} as={ArrowDown}></Icon>
      </HStack>
      <Container width="100%" overflow={"scroll"} p={0}>
        <Container>
          <Table px={5} variant="simple">
            <Tbody>
              {Object.keys(outputs).map((name) => {
                return (
                  <Tr key={name} justifyContent={"space-between"}>
                    <Td>
                      <HStack p={2} justifyContent={"space-between"}>
                        <Text>{name}</Text>
                        <Icon
                          onClick={() => downloadFile(name, outputs[name])}
                          boxSize={"1.4rem"}
                          as={ArrowDown}
                        ></Icon>
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Container>
      </Container>
    </PanelContainer>
  );
};
