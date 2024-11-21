import React, { useEffect, useState, useRef } from "react";
import 'xterm/css/xterm.css';
import { useXTerm } from 'react-xtermjs';

import { PanelHeader } from "/@/components/generic/PanelHeader";
import { PanelContainer } from "/@/components/generic/PanelContainer";
import { useStore } from "/@/store";
import { ConsoleLogLine } from "/@/shared";


export const PanelTerminal: React.FC = () => {
  const [jobId, setJobId] = useState<string | undefined>();
  const setShowTerminal = useStore(state => state.setShowTerminal);
  const sendConsoleMessage = useStore(state => state.sendConsoleMessage);
  const buildLogs = useStore(state => state.buildLogs)
  const runLogs = useStore(state => state.runLogs)
  const runLogsCache =  useRef<string[]>([]);
  const runBuildCache =  useRef<string[]>([]);
  const jobState = useStore(state => state.jobState);
  const currentLine = useRef<string>('');

  // update the job id
  useEffect(() => {
    setJobId(jobState?.hash);
    runLogsCache.current = [];
    runBuildCache.current = [];
  }, [jobState]);

  const handleNewLine = (logs: ConsoleLogLine[]): string[] => {
    let handledLogs = [];
    for (let line of logs) {
      const lines = line[0]?.split("\n");
      handledLogs = handledLogs.concat(lines)
    }
    return handledLogs;
  }

  // update logs
  useEffect(() => {
    if (!jobId) {
      return;
    }
    const buildLogsHandled = handleNewLine(buildLogs);
    if (runBuildCache.current.length !== buildLogsHandled.length) {
      const buildToWrite = buildLogsHandled.slice(runBuildCache.current.length, buildLogsHandled.length);
      for (let line of buildToWrite) {
        instance?.write(line);
      }
      runBuildCache.current = [...runBuildCache.current, ...buildToWrite]
    }

    const runLogsHandled = handleNewLine(runLogs);
    if (runLogsCache.current.length !== runLogsHandled.length) {
      const runToWrite = runLogsHandled.slice(runBuildCache.current.length, runLogsHandled.length);
      for (let line of runToWrite) {
        instance?.write(line);
      }
      runBuildCache.current = [...runBuildCache.current, ...runToWrite]
    }
  }, [buildLogs, runLogs]);

  const { instance, ref } = useXTerm()

  useEffect(() => {
    if (instance) {
      instance?.onData((data) => {
        if (data === '\r') {
          instance?.write('\r\n');
          sendConsoleMessage(currentLine.current, jobId);
          currentLine.current = '';
        } else {
          instance?.write(data)
          currentLine.current = currentLine.current + data;
        }
      });
      instance?.onResize((cols, rows) => {
        console.log(cols, rows)
      });
    }
  }, [instance, jobId]);

  return (
    <PanelContainer>
      <PanelHeader title={"Terminal"} onClearTerminal={() => instance?.reset()} onClose={() => setShowTerminal(false)} />
      <div ref={ref} style={{ width: '100%', height: '100vh' }} />
    </PanelContainer>
  );
};