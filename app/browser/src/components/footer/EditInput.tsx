import React, { useEffect } from "react";

import { DockerJobDefinitionParamsInUrlHash, JobInputs } from "/@/shared";
import { useStore } from "/@/store";

import { Button, HStack, Icon, Text, Tooltip } from "@chakra-ui/react";
import { useHashParamJson } from "@metapages/hash-query/react-hooks";
import { PencilSimple, Terminal } from "@phosphor-icons/react";

export const EditInput: React.FC = () => {
  const [jobDefinitionBlob] = useHashParamJson<
    DockerJobDefinitionParamsInUrlHash
  >("job");
  const [jobInputs] = useHashParamJson<JobInputs | undefined>("inputs");

  // only show the edit button if the command points to a script in the inputs
  const setRightPanelContext = useStore((state) => state.setRightPanelContext);
  const rightPanelContext = useStore((state) => state.rightPanelContext);
  const setMainInputFile = useStore((state) => state.setMainInputFile);
  const mainInputFile = useStore((state) => state.mainInputFile);

  useEffect(() => {
    // TODO: make the primary editable file something that can he
    // specified so we don't rely on lexicographical order
    const fileNames = jobInputs ? Object.keys(jobInputs).sort() : [];
    const mainFile = null;
    if (!mainFile && fileNames.length) {
      setMainInputFile(fileNames[0]);
    }
  }, [jobInputs, jobDefinitionBlob]);

  const editorShown = rightPanelContext === "editScript";
  return (
    <Tooltip label={editorShown ? "Close" : "Edit"}>
      <HStack>
        <Icon as={Terminal} boxSize="4" />
        {!mainInputFile
          ? <Text fontWeight={400}>{jobDefinitionBlob?.command}</Text>
          : (
            <Button
              variant={"ghost"}
              bg={editorShown ? "gray.300" : "none"}
              onClick={() =>
                setRightPanelContext(editorShown ? null : "editScript")}
              _hover={{ bg: editorShown ? "gray.300" : "none" }}
            >
              <HStack gap={2}>
                <Text>{`${mainInputFile}`}</Text>
                <Icon as={PencilSimple} />
              </HStack>
            </Button>
          )}
      </HStack>
    </Tooltip>
  );
};
