import {
  Box,
  HStack,
  useMediaQuery,
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
  const [isLargerThan700] = useMediaQuery("(min-width: 700px)");

  const rightPanelContext = useStore((state) => state.rightPanelContext);

  const editorShown = rightPanelContext === 'editScript';
  const stdErrShown = rightPanelContext === 'stderr'; 
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
    stderr: <PanelLogs mode={'stderr'} />,
  }
  const rightContent = rightPanelContext && rightPanelOptions[rightPanelContext];
  const rightWidth = rightPanelContext ?
    (editorShown && !isLargerThan700 ? '100%' : '50%') :
    '0%';
  const leftWidth = rightPanelContext ?
    (editorShown && !isLargerThan700 ? '0%' : '50%') :
    '100%';
  return (
    <VStack gap={0} minHeight="100vh">
      <MainHeader />
      <HStack gap={0} w={'100%'} minW="100vw" minH={contentHeight}>
        <Box minW={leftWidth} minH={contentHeight}>
          <PanelLogs mode={stdErrShown ? 'stdout' : 'stdout+stderr'} />
        </Box>
        <Box minW={rightWidth} 
          minH={contentHeight} 
          borderLeft={rightContent && defaultBorder}>
          {rightContent}
        </Box>
      </HStack>
      <MainFooter />
    </VStack>
  );
};