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
  VStack,
  Container,
  HStack,
  Icon,
} from '@chakra-ui/react';
import { PanelHeader } from '/@/components/generic/PanelHeader';
import { contentHeight } from '/@/styles/theme';
import { ArrowDown } from '@phosphor-icons/react'
import { UPLOAD_DOWNLOAD_BASE_URL } from '/@/config';
import { convertJobOutputDataRefsToExpectedFormat } from '/@/shared/dataref';
import { useRef } from 'react';
export const PanelOutputs: React.FC> = () => {
  const src = useRef<null | string>(null)
  const job = useStore((state) => state.jobState);
  const outputs = getOutputs(job);

  const downloadFile = async (name: string, outPut: DataRef) => {
    const res = await convertJobOutputDataRefsToExpectedFormat(outputs, UPLOAD_DOWNLOAD_BASE_URL)
    console.log(res)
    if (res) {
      for (let obj of Object.keys(res)) {
        console.log(obj, res[obj].value)
        src.current = window.URL.createObjectURL(new Blob([res[obj].value]))
        console.log(src.current)
        // const url = window.URL.createObjectURL(new Blob([res[obj].value]))
        // const a = document.createElement("a");
        // // document.body.appendChild(a);
        // a.href = url;
        // a.download = obj;
        // a.click();
        // window.URL.revokeObjectURL(url);
      }
    }
  }
  return (
    <VStack w={'100%'} minHeight={contentHeight} bg={'black.3'} >
      <PanelHeader title={'Outputs'} />
      {src.current && <img src={src.current} />}
      <Center px={4} width="100%">
        <Text fontSize={'0.9rem'}>Output Items</Text>
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
    </VStack>
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
