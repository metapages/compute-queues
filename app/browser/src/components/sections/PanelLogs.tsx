import { Container } from "@chakra-ui/react"
import { ConsoleHeader } from "/@/components/generic/ConsoleHeader"
import { DisplayLogs, LogsMode } from "/@/components/sections/logs/DisplayLogs"
import { contentHeight } from "/@/styles/theme"

const titleByMode = (mode: LogsMode): string => {
  switch (mode) {
    case 'stdout':
      return 'stdout';
    case 'stdout+stderr':
      return 'console';
    case 'stderr':
      return 'stderr';
    default:
      return '';
  }
}
export const PanelLogs: React.FC<{
  mode: LogsMode,
}> = ({mode}) => {
  const title = titleByMode(mode)
  const showSplit = mode === 'stdout+stderr';
  const showCombine = mode === 'stderr';

  return <Container 
    minH={contentHeight} 
    h={contentHeight} 
    maxH={contentHeight} 
    p={0} 
    minW={'100%'} 
    overflow={'scroll'} 
    bg={'white'}
  >
  <ConsoleHeader title={title} 
    showSplit={showSplit} 
    showCombine={showCombine}
  />
  <Container h={'calc(100% - 1.5rem)'} p={0} minW={'100%'} overflow={'scroll'}>
    <DisplayLogs mode={mode} />
  </Container>
</Container>
}