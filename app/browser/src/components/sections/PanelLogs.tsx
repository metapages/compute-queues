import { Container } from "@chakra-ui/react"
import { ConsoleHeader } from "/@/components/generic/ConsoleHeader"
import { DisplayLogs, LogsMode } from "/@/components/sections/logs/DisplayLogs"
import { contentHeight } from "/@/styles/theme"

export const PanelLogs: React.FC<{
  title: string,
  showCombine: boolean,
  showSplit: boolean,
  mode: LogsMode,
}> = ({title, showCombine, showSplit, mode}) => {
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