import {
  useEffect,
  useRef,
  useState,
} from 'react';
import linkifyHtml from 'linkify-html';
import { AnsiUp } from 'ansi_up';
import { ConsoleLogLine, DockerJobState, StateChangeValueWorkerFinished } from '/@/shared/types';
import { useStore } from '/@/store';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import {
  Box,
  Code,
  VStack,
} from '@chakra-ui/react';
import { OUTPUT_TABLE_ROW_HEIGHT, OutputTable } from './OutputTable';

export type LogsMode = "stdout+stderr" | "stdout" | "stderr" | "build";

const EMPTY_ARRAY: ConsoleLogLine[] = [];
const options = { defaultProtocol: 'https' };
const LINE_HEIGHT = 20;
// show e.g. running, or exit code, or error
export const DisplayLogs: React.FC<{
  mode: LogsMode;
}> = ({ mode }) => {
  const ansi_up = new AnsiUp();
  const logsRef = useRef<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | undefined>();
  const [showOutputTable, setShowOutputTable] = useState(false)
  const [outputCount, setOutputCount] = useState(0)
  const myref = useRef(null);
  const job = useStore((state) => state.jobState);

  useEffect(() => {
    if (!job?.state || job.state !== DockerJobState.Finished) return;

    const result = (job.value as StateChangeValueWorkerFinished).result;
    if (result && result.outputs && mode.includes('stdout')) {
      setShowOutputTable(true);
      setOutputCount(Object.keys(result.outputs).length)
    }
  }, [job, mode])

  const showRef = () => {
    if (myref.current) {
      myref.current._outerRef.scrollTop = myref.current._outerRef.scrollHeight;
    }
  }

  // new jobId? reset the local logs ref
  useEffect(() => {
    logsRef.current = [];
    setLogs(logsRef.current);
  }, [jobId]);

  const jobState = useStore((state) => state.jobState);
  const buildLogs = useStore((state) => state.buildLogs);
  const runLogs = useStore((state) => state.runLogs);

  // update the job id
  useEffect(() => {
    setJobId(jobState?.hash);
    logsRef.current = [];
    setLogs(logsRef.current);
  }, [jobState]);

  // Actually update logs
  useEffect(() => {
    if (!jobId) {
      return;
    }

    let currentLogs: ConsoleLogLine[] = EMPTY_ARRAY;
    switch (mode) {
      case "stdout+stderr":
        currentLogs = (buildLogs || EMPTY_ARRAY).concat(runLogs || EMPTY_ARRAY);
        break;
      case "stdout":
        currentLogs = (buildLogs || EMPTY_ARRAY).concat(runLogs?.filter((l) => !l[2]) || EMPTY_ARRAY);
        break;
      case "stderr":
        currentLogs = runLogs?.filter((l) => l[2]) || EMPTY_ARRAY;
        break;
      case "build":
        currentLogs = buildLogs || [];
        break;
    }
    let logsNewlineHandled: any[] = [];
    currentLogs.forEach((line) => {
      if (!line) {
        return;
      }
      const lines = line[0]?.split("\n");
      logsNewlineHandled = logsNewlineHandled.concat(lines);
    });
    logsRef.current = logsNewlineHandled;
    setLogs(logsRef.current);
    showRef();
  }, [mode, jobState, jobId, buildLogs, runLogs, showOutputTable]);

  if (!jobId) {
    return <VStack alignItems={'flex-start'} h={'100%'} pl={3}></VStack>
  }

  const getItemSize = (index) => {
    if (index === logs.length - 1) return (OUTPUT_TABLE_ROW_HEIGHT * (outputCount + 1)) + LINE_HEIGHT;
    return logs[index].length ? LINE_HEIGHT : 0;
  }

  const Row = ({ index, style }) => {
    let formattedLog = linkifyHtml(ansi_up.ansi_to_html(logs[index]), options);
    const codeEl = <Code 
      style={style} 
      sx={{display: 'block', textWrap: 'nowrap'}} 
      bg={'none'} 
      dangerouslySetInnerHTML={{ __html: formattedLog }} 
      />
    // if this is the last log in the list, add the output table
    // this will allow the table to scroll naturally
    if (index === logs.length - 1) {
      return <Box style={style}>
        {codeEl}
        <OutputTable />
      </Box>;
    }
    return codeEl;
  };

  return <VStack alignItems={'flex-start'} h={'100%'} pl={3}>
    <AutoSizer>
      {({height, width}) => {
        return <List
          height={height}
          itemSize={getItemSize}
          itemCount={logsRef.current.length}
          width={width}
          ref={myref}
        >
          {Row}
        </List>
      }}
    </AutoSizer>
    {!logs.length && showOutputTable && <OutputTable />}
  </VStack>
  ;
};