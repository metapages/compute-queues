import {
  DataRef,
  DockerJobDefinitionRow,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import { useStore } from '/@/store';

import {
  Text,
  HStack,
  Icon,
  Box,
  VStack,
} from '@chakra-ui/react';
import { ArrowDown } from '@phosphor-icons/react'
import { defaultBorder } from '/@/styles/theme';
// import { UPLOAD_DOWNLOAD_BASE_URL } from '/@/config';

export const OutputTable: React.FC = () => {
  const job = useStore((state) => state.jobState);
  const outputs = getOutputs(job);
  const outputCount = Object.keys(outputs).length;
  const downloadFile = async (name: string, outPut: DataRef) => {
    // TODO: add download functionality
    // use dataRefToBuffer?
  };

  const downloadAll = async () => {
    // TODO: add download functionality
    // use dataRefToBuffer?
  };
  return (
    <Box m={3} 
      maxWidth={'25rem'}  
      minWidth={'15rem'} 
      border="1px solid" 
      borderColor="gray.87" 
      borderRadius="md" 
      width={'80%'}
      overflow={'hidden'}
    >
      <VStack gap={0}>
        <HStack width={'100%'} bg={'black.3'} borderBottom={defaultBorder} p={2} justifyContent={'space-between'}>
          <Text fontWeight={600}>Outputs</Text>
          <HStack>
            <Text>Download All ({outputCount})</Text>
            <Icon onClick={downloadAll} boxSize={'1.1rem'} as={ArrowDown}></Icon>
          </HStack>
        </HStack>
        <VStack width={'100%'} bg={'black.10'}>
          {Object.keys(outputs).map((name, i) => {
            const lastRow = Object.keys(outputs).length - 1 === i;
            return <HStack key={`${name}-${i}`} width={'calc(100% - 1rem)'} p={2} borderBottom={lastRow ? 'none' : defaultBorder} justifyContent={'space-between'}>
              <Text>{name}</Text>
              <Icon onClick={() => downloadFile(name, outputs[name])} boxSize={'1.1rem'} as={ArrowDown}></Icon>
            </HStack>
          })}
        </VStack>
      </VStack>
    </Box>
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