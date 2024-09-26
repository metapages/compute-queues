import {
  Box,
  HStack,
  VStack,
} from '@chakra-ui/react';

import { MainFooter } from '/@/components/MainFooter';
import { MainHeader } from '/@/components/MainHeader';
import { PanelLogs } from '/@/components/sections/PanelLogs';
import { PanelEditor } from '/@/components/sections/PanelEditor';
import { PanelInputs } from '/@/components/sections/PanelInputs';
import { PanelOutputs } from '../components/sections/PanelOutputs';
import { PanelSettings } from '../components/sections/PanelSettings';
import { useStore } from '../store';
import {
  contentHeight,
  defaultBorder,
} from '../styles/theme';

export const Main: React.FC = () => {

  const rightPanelContext = useStore((state) => state.rightPanelContext);

  const showStdErr = rightPanelContext === 'stderr'; 
  const rightPanelOptions = {
    inputs: <PanelInputs />,
    outputs: <PanelOutputs />,
    settings: <PanelSettings />,
    editScript: <PanelEditor />,
    help: <iframe
      style={{ width: "100%", height: contentHeight }}
      src={`https://markdown.mtfm.io/#?url=${window.location.origin}${window.location.pathname}/README.md`}
    />,
    // TODO make panel logs take a mode and have the mode inform the title internally
    stderr: <PanelLogs title={'stderr'} showSplit={false} showCombine={showStdErr} mode={'stderr'} />,
  }
  const rightContent = rightPanelContext && rightPanelOptions[rightPanelContext];
  return (
    <VStack gap={0} minHeight="100vh" minW={'40rem'} overflow={'hide'}>
      <MainHeader />
      <HStack gap={0} w={'100%'} minW="100vw" minH={contentHeight}>
        <Box minW={rightContent ? '50%' : '100%'} minH={contentHeight}>
          <PanelLogs title={showStdErr ? 'stdout' : 'console'} 
            mode={showStdErr ? 'stdout' : 'stdout+stderr'} 
            showCombine={false} showSplit={!showStdErr} />
        </Box>
        <Box minW={rightContent ? '50%' : '0%'} 
          minH={contentHeight} 
          borderLeft={rightContent && defaultBorder}>
          {rightContent}
        </Box>
      </HStack>
      <MainFooter />
    </VStack>
  );
};