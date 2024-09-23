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
    stderr: <PanelLogs title={'stderr'} showSplit={false} showCombine={true} mode={'stderr'} />,
  }
  const rightContent = rightPanelContext && rightPanelOptions[rightPanelContext];
  return (
    <VStack gap={0} minHeight="100vh" minWidth={'40rem'} overflow={'hide'}>
      <MainHeader />
      <HStack gap={0} width={'100%'} minWidth="100vw" minHeight={contentHeight}>
        <Box minW={rightContent ? '50%' : '100%'} minHeight={contentHeight}>
          <PanelLogs title={showStdErr ? 'stdout' : 'console'} 
            mode={showStdErr ? 'stdout' : 'stdout+stderr'} 
            showCombine={false} showSplit={!showStdErr} />
        </Box>
        <Box minW={rightContent ? '50%' : '0%'} 
          minHeight={contentHeight} 
          borderLeft={rightContent && defaultBorder}>
          {rightContent}
        </Box>
      </HStack>
      <MainFooter />
    </VStack>
  );
};