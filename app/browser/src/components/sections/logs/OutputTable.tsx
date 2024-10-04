import React, { useCallback } from "react";
import { DockerJobDefinitionRow, DockerJobState, InputsRefs, StateChangeValueWorkerFinished } from "/@/shared";
import { useStore } from "/@/store";

import { Box, Center, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { ArrowDown } from "@phosphor-icons/react";

import { downloadFile, zipAndDownloadDatarefs } from "/@/helpers";

export const OUTPUT_TABLE_ROW_HEIGHT = 35;

export const OutputTable: React.FC = () => {
  const job = useStore(state => state.jobState);
  const outputs = getOutputs(job);
  const outputCount = Object.keys(outputs).length;

  const downloadAll = useCallback(async () => {
    await zipAndDownloadDatarefs(outputs, "all-outputs");
  }, [outputs]);

  if (Object.keys(outputs).length === 0) return <></>;
  return (
    <Box mt={3} maxW={"25rem"} minW={"20rem"} border={"1px"} borderRadius="md" w={"80%"} overflow={"hidden"}>
      <VStack gap={0} bg={"gray.100"}>
        <Center p={0} w={"100%"} borderBottom={"1px"}>
          <HStack w={"calc(100% - 1rem)"} p={1.5} h={`${OUTPUT_TABLE_ROW_HEIGHT}px`} justifyContent={"space-between"}>
            <Text fontWeight={600}>Outputs</Text>
            <HStack>
              <Text>Download All ({outputCount})</Text>
              <Icon onClick={downloadAll} as={ArrowDown}></Icon>
            </HStack>
          </HStack>
        </Center>
        <VStack w={"100%"} bg={"gray.100"}>
          {Object.keys(outputs).map((name, i) => {
            const lastRow = Object.keys(outputs).length - 1 === i;
            return (
              <HStack
                key={`${name}-${i}`}
                w={"calc(100% - 1rem)"}
                h={`${OUTPUT_TABLE_ROW_HEIGHT}px`}
                p={1.5}
                borderBottom={lastRow ? "none" : "1px"}
                justifyContent={"space-between"}>
                <Text>{name}</Text>
                <Icon onClick={() => downloadFile(name, outputs[name])} as={ArrowDown}></Icon>
              </HStack>
            );
          })}
        </VStack>
      </VStack>
    </Box>
  );
};

export const getOutputs = (job?: DockerJobDefinitionRow): InputsRefs => {
  if (!job?.state || job.state !== DockerJobState.Finished) {
    return {};
  }
  const result = (job.value as StateChangeValueWorkerFinished).result;
  if (result && result.outputs) {
    return result.outputs;
  }
  return {};
};
