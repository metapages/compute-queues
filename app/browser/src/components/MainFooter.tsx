import { Box, HStack, Spacer, Icon, Tooltip } from "@chakra-ui/react";
import { List, QuestionMark } from "@phosphor-icons/react";
import { DockerJobDefinitionRow } from "../shared";
import { useStore } from "../store";
import { defaultBorder, footerHeight } from "../styles/theme";
import JobStatus from "./footer/JobStatus";
import { QueueButtonAndModal } from "./sections/queue/QueueButtonAndModal";

export const MainFooter: React.FC<{
  job: DockerJobDefinitionRow | undefined;
}> = ({ job }) => {
  const setRightPanelContext = useStore((state) => state.setRightPanelContext);
  const rightPanelContext = useStore((state) => state.rightPanelContext);
  const helpPanelShown = rightPanelContext === 'help'
  const queueModalShown = rightPanelContext === 'queue'
  
  // add modal for queue, not right content
  return (
    <Box bg={'black.3'} px={3} borderTop={defaultBorder} minWidth="100vw" h={footerHeight}>
      <HStack justify={'space-between'} h={'3.5rem'}>
        <JobStatus job={job} />
        <Spacer/>
        <HStack gap={3}>
          <QueueButtonAndModal />
          <Tooltip label={'Help'}>
            <Icon 
              bg={helpPanelShown ? 'black.10' : 'none'}
              p={'3px'} 
              borderRadius={'50%'} 
              as={QuestionMark} 
              boxSize="6"
              onClick={() => setRightPanelContext(helpPanelShown ? null : 'help')}
              />
          </Tooltip>
        </HStack>
      </HStack>
    </Box>
  )
}