import React, { useEffect } from "react";

import { JobControlButton } from "/@/components/header/JobControlButton";
import { DockerJobDefinitionParamsInUrlHash, JobInputs } from "/@/shared";
import { useStore } from "/@/store";

import { Badge, Box, Button, Flex, HStack, Icon, Spacer, Text, Tooltip, useMediaQuery } from "@chakra-ui/react";
import { useHashParamJson } from "@metapages/hash-query";
import { DownloadSimple, Gear, PencilSimple, Terminal, UploadSimple } from "@phosphor-icons/react";
import { getInputsCount, getOutputs } from "/@/helpers";

export const MainHeader: React.FC = () => {
  const [isLargerThan400] = useMediaQuery("(min-width: 400px)");
  const [jobDefinitionBlob] = useHashParamJson<DockerJobDefinitionParamsInUrlHash>("job");
  const [jobInputs] = useHashParamJson<JobInputs | undefined>("inputs");

  // only show the edit button if the command points to a script in the inputs
  const setRightPanelContext = useStore(state => state.setRightPanelContext);
  const rightPanelContext = useStore(state => state.rightPanelContext);
  const setMainInputFile = useStore(state => state.setMainInputFile);
  const mainInputFile = useStore(state => state.mainInputFile);

  const currentJobDefinition = useStore(state => state.newJobDefinition);
  const incomingInputsCount = getInputsCount(currentJobDefinition, jobInputs);
  const job = useStore(state => state.jobState);
  const outputs = getOutputs(job);
  const outputsCount = Object.keys(outputs).length;

  useEffect(() => {
    // TODO: make the primary editable file something that can he
    // specified so we don't rely on lexicographical order
    const fileNames = jobInputs ? Object.keys(jobInputs).sort() : [];
    const mainFile = null;
    if (!mainFile && fileNames.length) {
      setMainInputFile(fileNames[0]);
    }
  }, [jobInputs, jobDefinitionBlob]);

  const icon = (svg: React.ElementType, context: string, badge?: string) => {
    const toggleValue = rightPanelContext === context ? null : context;
    return (
      <Box position="relative" display="inline-block">
        <Tooltip label={`${context[0].toUpperCase() + context.slice(1, context.length)}`}>
          <Icon
            _hover={{ bg: "gray.300" }}
            bg={context === rightPanelContext ? "gray.300" : "none"}
            p={"3px"}
            borderRadius={5}
            as={svg}
            boxSize="7"
            onClick={() => setRightPanelContext(toggleValue)}
          />
        </Tooltip>
        {badge ? (
          <Badge
            position="absolute"
            bottom="0"
            right="0"
            transform="translate(40%, 20%)"
            colorScheme="green"
            borderRadius="full"
            boxSize="1rem">
            <Text align={"center"} fontSize={"0.7rem"}>
              {badge}
            </Text>
          </Badge>
        ) : null}
      </Box>
    );
  };

  const editorShown = rightPanelContext === "editScript";
  const rightSectionWidth = isLargerThan400 ? "11rem" : "0rem";
  return (
    <Flex w={"100%"} h={"headerHeight"} bg={"gray.100"} borderBottom={"1px"}>
      <HStack justify={"space-between"} px={2} w={`calc(100% - ${rightSectionWidth})`}>
        <HStack>
          <Icon as={Terminal} boxSize="4" />
          {!mainInputFile ? (
            <Text fontWeight={400}>{jobDefinitionBlob?.command}</Text>
          ) : (
            <Button
              variant={"ghost"}
              bg={editorShown ? "gray.300" : "none"}
              onClick={() => setRightPanelContext(editorShown ? null : "editScript")}
              _hover={{ bg: editorShown ? "gray.300" : "none" }}>
              <HStack gap={2}>
                <Text>{`${mainInputFile}`}</Text>
                <Icon as={PencilSimple} />
              </HStack>
            </Button>
          )}
        </HStack>
        <Spacer />
        <HStack>
          <JobControlButton />
        </HStack>
      </HStack>
      {isLargerThan400 && (
        <HStack borderLeft={"1px"} px={4} bg={"gray.100"} justifyContent={"space-around"} w={rightSectionWidth}>
          {icon(Gear, "settings")}
          {icon(DownloadSimple, "inputs", incomingInputsCount ? incomingInputsCount.toString() : undefined)}
          {icon(UploadSimple, "outputs", outputsCount ? outputsCount.toString() : undefined)}
        </HStack>
      )}
    </Flex>
  );
};
