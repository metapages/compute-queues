import { Box, Container, HStack, useMediaQuery, VStack } from '@chakra-ui/react';

import { useStore } from '../store';

import { MainFooter } from '/@/components/MainFooter';
import { MainHeader } from '/@/components/MainHeader';
import { PanelLogs } from '/@/components/sections/PanelLogs';
import { PanelEditor } from '/@/components/sections/PanelEditor';
import { PanelInputs } from '/@/components/sections/PanelInputs';
import { PanelOutputs } from '/@/components/sections/PanelOutputs';
import { PanelSettings } from '/@/components/sections/PanelSettings';
import { JobControlButton } from '/@/components/header/JobControlButton';
import { JobStatus } from '/@/components/footer/JobStatus';
import { PanelDocs } from '/@/components/sections/PanelDocs';

export const Main: React.FC = () => {
  const rightPanelContext = useStore(state => state.rightPanelContext);
  const [isWiderThan1000] = useMediaQuery('(min-width: 1000px)');
  const [isTallerThan200] = useMediaQuery('(min-height: 200px)');

  const editorShown = rightPanelContext === 'editScript';
  const stdErrShown = rightPanelContext === 'stderr';
  const rightPanelOptions = {
    inputs: <PanelInputs />,
    outputs: <PanelOutputs />,
    settings: <PanelSettings />,
    editScript: <PanelEditor />,
    help: <PanelDocs />,
    stderr: <PanelLogs mode={'stderr'} />,
  };
  const rightContent = rightPanelContext && rightPanelOptions[rightPanelContext];
  let rightWidth = '0%';
  if (rightPanelContext) {
    if (!isWiderThan1000) {
      if (editorShown) {
        rightWidth = '100%';
      } else if (stdErrShown) {
        rightWidth = '50%';
      } else {
        rightWidth = '80%';
      }
    } else {
      rightWidth = '50%';
    }
  }
  const leftWidth = `calc(100% - ${rightWidth})`;

  if (!isTallerThan200) {
    return (
      <Container m={0} bg={'gray.300'} minW={'100%'} minH={'100%'} h={'100vh'} w={'100vw'}>
        <HStack justifyContent={'space-around'} minH={'100%'}>
          <JobStatus />
          <JobControlButton />
        </HStack>
      </Container>
    );
  }
  return (
    <VStack gap={0} minWidth={'200px'} minHeight='100vh'>
      <MainHeader />
      <HStack gap={0} w={'100%'} minW='100vw' minH={'contentHeight'}>
        <Box minW={leftWidth} minH={'contentHeight'}>
          <PanelLogs mode={stdErrShown ? 'stdout' : 'stdout+stderr'} />
        </Box>
        <Box minW={rightWidth} minH={'contentHeight'} borderLeft={rightContent && '1px'}>
          {rightContent}
        </Box>
      </HStack>
      <MainFooter />
    </VStack>
  );
};
