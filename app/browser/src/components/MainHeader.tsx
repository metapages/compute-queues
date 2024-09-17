import { Tooltip, Icon, Flex, HStack, Spacer, Button, Text, } from "@chakra-ui/react";
import { useHashParamJson } from "@metapages/hash-query";
import { Terminal, PencilSimple, Play, Gear, UploadSimple, DownloadSimple } from "@phosphor-icons/react";
import { useEffect } from "react";
import { DockerJobDefinitionParamsInUrlHash } from "../shared";
import { useStore } from "../store";
import { headerHeight, defaultBorder } from "../styles/theme";
import { JobInputs } from "./sections/PanelInputs";

export const MainHeader: React.FC = () => {
  const [jobDefinitionBlob] = useHashParamJson<DockerJobDefinitionParamsInUrlHash>("job");
  const [jobInputs] = useHashParamJson<JobInputs | undefined>("inputs");

  // only show the edit button if the command points to a script in the inputs
  const setRightPanelContext = useStore((state) => state.setRightPanelContext);
  const rightPanelContext = useStore((state) => state.rightPanelContext);
  const setMainInputFile = useStore((state) => state.setMainInputFile);
  const mainInputFile = useStore((state) => state.mainInputFile);

  useEffect(() => {
    // check to see if the run command points to a file in inputs
    const fileNames = Object.keys(jobInputs).sort();
    const command = jobDefinitionBlob.command;
    let mainFile = null;
    if (fileNames.length && command.length) {
      for (let file of fileNames) {
        if (command.includes(file)) {
          // if there's a file that matches the command, set that as the editable file
          setMainInputFile(file);
        }
      }
    }
    // if no file matches the command, set the editable file to the first input
    if (!mainFile && fileNames.length) {
      setMainInputFile(fileNames[0]);
    }
  }, [jobInputs, jobDefinitionBlob])

  {/* <ButtonCancelOrRetry job={ourConfiguredJob} /> */}
  const icon = (svg, context) => {
    return <Tooltip label={`${context[0].toUpperCase() + context.slice(1,context.length)}`}>
      <Icon 
        _hover={{ bg: 'black.10' }} 
        bg={context === rightPanelContext ? 'black.10' : 'none'}
        p={'3px'} 
        borderRadius={5} 
        as={svg} 
        boxSize="7" 
        onClick={() => setRightPanelContext(context)}
        />
      </Tooltip>
  }

  return (
    <Flex w={'100%'} h={headerHeight} bg={'black.3'} borderBottom={defaultBorder} >
      <HStack justify={'space-between'} px={2} w={`calc(100% - 11rem)`}>
        <HStack>
          <Icon as={Terminal} color={'gray.39'} boxSize="4" />
          <Text fontWeight={400} color={'gray.39'}>{jobDefinitionBlob.command}</Text>
        </HStack>
        <Spacer/>
        <HStack>
          { mainInputFile && <Button 
              variant={'ghost'} 
              onClick={() => setRightPanelContext('editScript')}
              _hover={{bg: 'none'}}
              >
              <HStack gap={2}>
                <Icon as={PencilSimple}/>
                <Spacer />
                <Text>Edit Script</Text>
              </HStack>
            </Button>
          }
          <Button variant={'ghost'} _hover={{bg: 'none'}}>
            <HStack gap={2}>
              <Play weight='duotone' color='green' size={'1.2rem'} />
              <Spacer />
            </HStack>
            <Text color={'green.600'} fontWeight={500} fontSize={'0.9rem'}>Run Job</Text>
          </Button>
        </HStack>
      </HStack>
      <HStack borderLeft={defaultBorder} px={4} bg={'black.3'} justifyContent={'space-around'} w={'11rem'}>
        {icon(Gear, 'settings')}
        {icon(UploadSimple, 'inputs')}
        {icon(DownloadSimple, 'outputs')}
      </HStack>
    </Flex>
  )
}