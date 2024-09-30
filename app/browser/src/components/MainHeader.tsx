import { useEffect } from 'react';

import { JobControlButton } from '/@/components/header/JobControlButton';
import {
  DockerJobDefinitionParamsInUrlHash,
  JobInputs,
} from '/@/shared';
import { useStore } from '/@/store';
import {
  defaultBorder,
  headerHeight,
} from '/@/styles/theme';

import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Spacer,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import { useHashParamJson } from '@metapages/hash-query';
import {
  DownloadSimple,
  Gear,
  PencilSimple,
  Terminal,
  UploadSimple,
} from '@phosphor-icons/react';
import { getInputsCount, getOutputs } from './sections/util';

export const MainHeader: React.FC = () => {
  const [jobDefinitionBlob] =
    useHashParamJson<DockerJobDefinitionParamsInUrlHash>("job");
  const [jobInputs] = useHashParamJson<JobInputs | undefined>("inputs");

  // only show the edit button if the command points to a script in the inputs
  const setRightPanelContext = useStore((state) => state.setRightPanelContext);
  const rightPanelContext = useStore((state) => state.rightPanelContext);
  const setMainInputFile = useStore((state) => state.setMainInputFile);
  const mainInputFile = useStore((state) => state.mainInputFile);

  const currentJobDefinition = useStore((state) => state.newJobDefinition);
  const incomingInputsCount = getInputsCount(currentJobDefinition, jobInputs);
  const job = useStore((state) => state.jobState);
  const outputs = getOutputs(job);
  const outputsCount = Object.keys(outputs).length;

  useEffect(() => {
    // check to see if the run command points to a file in inputs
    const fileNames = jobInputs ? Object.keys(jobInputs).sort() : [];
    const command = jobDefinitionBlob?.command;
    let mainFile = null;
    // if (fileNames.length && command?.length) {
    //   for (let file of fileNames) {
    //     if (command.includes(file)) {
    //       // if there's a file that matches the command, set that as the editable file
    //       setMainInputFile(file);
    //     }
    //   }
    // }
    // if no file matches the command, set the editable file to the first input
    if (!mainFile && fileNames.length) {
      setMainInputFile(fileNames[0]);
    }
  }, [jobInputs, jobDefinitionBlob]);

  const icon = (svg: React.ElementType, context: string, badge?:string) => {
    const toggleValue = rightPanelContext === context ? null : context;
    return (
      <Box position="relative" display="inline-block">
      <Tooltip
        label={`${context[0].toUpperCase() + context.slice(1, context.length)}`}
      >
        <Icon
          _hover={{ bg: "black.10" }}
          bg={context === rightPanelContext ? "black.10" : "none"}
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
        boxSize="16px"
      >{badge}</Badge>
      ): null}
    </Box>

      
    );
  };

  const editorShown = rightPanelContext === "editScript";
  return (
    <Flex
      w={"100%"}
      h={headerHeight}
      bg={"black.3"}
      borderBottom={defaultBorder}
    >
      <HStack justify={"space-between"} px={2} w={`calc(100% - 11rem)`}>
        <HStack>
          <Icon as={Terminal} color={"gray.39"} boxSize="4" />

          {!mainInputFile ? (
            <Text fontWeight={400} color={"gray.39"}>
              {jobDefinitionBlob?.command}
            </Text>
          ) : (
            <Button
              variant={"ghost"}
              bg={editorShown ? "black.10" : "none"}
              onClick={() =>
                setRightPanelContext(editorShown ? null : "editScript")
              }
              _hover={{ bg: editorShown ? "black.10" : "none" }}
            >
              <HStack gap={2}>
                <Text>{`${mainInputFile}`}</Text>
                <Icon as={PencilSimple} />
                {/* <Spacer /> */}
                
              </HStack>
            </Button>
          )}

          {/* <Text fontWeight={400} color={'gray.39'}>{jobDefinitionBlob?.command}</Text> */}
          {/* <Text>{`/inputs/${mainInputFile}`}</Text> */}
          {/* <Text>{`${mainInputFile}`}</Text>
          {mainInputFile && (
            <Button
              variant={"ghost"}
              bg={editorShown ? "black.10" : "none"}
              onClick={() =>
                setRightPanelContext(editorShown ? null : "editScript")
              }
              _hover={{ bg: editorShown ? "black.10" : "none" }}
            >
              <HStack gap={2}>
                <Icon as={PencilSimple} />
              </HStack>
            </Button>
          )} */}
        </HStack>
        <Spacer />
        <HStack>
          {/* { mainInputFile && <Button 
              variant={'ghost'} 
              bg={editorShown ? 'black.10' : 'none'}
              onClick={() => setRightPanelContext(editorShown ? null : 'editScript')}
              _hover={{bg: editorShown ? 'black.10' : 'none' }}

              >
              <HStack gap={2}>
                <Icon as={PencilSimple}/>
                <Spacer />
                <Text>{`/inputs/${mainInputFile}`}</Text>
              </HStack>
            </Button>
          } */}
          <JobControlButton />
        </HStack>
      </HStack>
      <HStack
        borderLeft={defaultBorder}
        px={4}
        bg={"black.3"}
        justifyContent={"space-around"}
        w={"11rem"}
      >
        {icon(Gear, "settings")}
        {icon(DownloadSimple, "inputs", incomingInputsCount ? incomingInputsCount.toString() : undefined)}
        {icon(UploadSimple, "outputs", outputsCount ? outputsCount.toString() : undefined)}
      </HStack>
    </Flex>
  );
};
