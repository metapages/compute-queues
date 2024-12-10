import React, { useEffect, useRef, useState } from "react";

import {
  ConsoleLogLine,
  DockerJobState,
  StateChangeValueFinished,
} from "/@/shared/types";
import { useStore } from "/@/store";
import { AnsiUp } from "ansi_up";
import linkifyHtml from "linkify-html";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList as List } from "react-window";

import { Box, Code, VStack } from "@chakra-ui/react";

import { OUTPUT_TABLE_ROW_HEIGHT, OutputTable } from "./OutputTable";

export type LogsMode = "stdout+stderr" | "stdout" | "stderr" | "build";

const EMPTY_ARRAY: ConsoleLogLine[] = [];
const options = { defaultProtocol: "https" };
const LINE_HEIGHT = 20;
// show e.g. running, or exit code, or error
export const DisplayLogs: React.FC<{
  mode: LogsMode;
}> = ({ mode }) => {
  const ansi_up = new AnsiUp();
  const logsRef = useRef<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | undefined>();
  const [showOutputTable, setShowOutputTable] = useState(false);
  const [outputCount, setOutputCount] = useState(0);
  const myref = useRef(null);
  const job = useStore((state) => state.jobState);

  useEffect(() => {
    if (!job?.state || job.state !== DockerJobState.Finished) return;

    const result = (job.value as StateChangeValueFinished).result;
    if (result && result.outputs && mode.includes("stdout")) {
      // setShowOutputTable(true);
      setOutputCount(Object.keys(result.outputs).length);
    }
  }, [job, mode]);

  const showRef = () => {
    if (myref.current) {
      myref.current._outerRef.scroll({
        top: myref.current._outerRef.scrollHeight,
        left: 0,
        behavior: "smooth",
      });
    }
  };

  // if the logs change, or if the ref changes, scroll to the bottom
  useEffect(() => {
    if (myref.current) showRef();
  }, [myref.current, logsRef.current]);

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

    const allLogs = (buildLogs || EMPTY_ARRAY).concat(runLogs || EMPTY_ARRAY);
    let currentLogs: ConsoleLogLine[] = EMPTY_ARRAY;
    const stdOutLogs = [];
    const stdErrLogs = [];
    for (const log of allLogs) {
      if (log[2]) {
        stdErrLogs.push(log);
      } else {
        stdOutLogs.push(log);
      }
    }
    switch (mode) {
      case "stdout+stderr":
        currentLogs = allLogs;
        break;
      case "stdout":
        currentLogs = stdOutLogs;
        break;
      case "stderr":
        currentLogs = stdErrLogs;
        break;
      case "build":
        currentLogs = buildLogs || EMPTY_ARRAY;
        break;
    }
    let logsNewlineHandled: string[] = [];
    currentLogs.forEach((line) => {
      if (!line) {
        return;
      }
      const lines = line[0]?.split("\n");
      logsNewlineHandled = logsNewlineHandled.concat(lines);
    });
    // logsRef.current = outputCount ? [...logsNewlineHandled, "OUTPUT_TABLE_PLACEHOLDER"] : logsNewlineHandled;
    logsRef.current = logsNewlineHandled;
    setLogs(logsRef.current);
  }, [mode, jobState, jobId, buildLogs, runLogs, showOutputTable, outputCount]);

  if (!jobId) {
    return <VStack alignItems={"flex-start"} h={"100%"} pl={3}></VStack>;
  }

  const getItemSize = (index) => {
    // if (logs[index] === "OUTPUT_TABLE_PLACEHOLDER") return OUTPUT_TABLE_ROW_HEIGHT * (outputCount + 1) + LINE_HEIGHT;
    return LINE_HEIGHT;
  };

  // eslint-disable-next-line
  const Row: React.FC<{ index: number; style: any }> = ({ index, style }) => {
    // if this is the last log in the list, add the output table
    // this will allow the table to scroll with the other log content
    // if (logs[index] === "OUTPUT_TABLE_PLACEHOLDER") {
    //   return (
    //     <Box style={style}>
    //       <OutputTable />
    //     </Box>
    //   );
    // }
    const formattedLog = linkifyHtml(
      ansi_up.ansi_to_html(logs[index]),
      options,
    );
    return (
      <Code
        style={style}
        sx={{ display: "block", textWrap: "nowrap" }}
        bg={"none"}
        dangerouslySetInnerHTML={{ __html: formattedLog }}
      />
    );
  };

  return (
    <VStack alignItems={"flex-start"} h={"100%"} pl={3}>
      <AutoSizer>
        {({ height, width }) => {
          return (
            <List
              height={height}
              itemSize={getItemSize}
              itemCount={logsRef.current.length}
              width={width}
              ref={(el) => {
                myref.current = el;
              }}
            >
              {Row}
            </List>
          );
        }}
      </AutoSizer>
      {/* {!logs.length && showOutputTable && <OutputTable />} */}
    </VStack>
  );
};
