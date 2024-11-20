import React, { useEffect, useState, useRef } from "react";
import 'xterm/css/xterm.css';
import { useXTerm } from 'react-xtermjs';

import { PanelHeader } from "/@/components/generic/PanelHeader";
import { PanelContainer } from "/@/components/generic/PanelContainer";
import { useStore } from "/@/store";


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

  // update logs
  useEffect(() => {
    if (!jobId) {
      return;
    }
    if (runBuildCache.current.length !== buildLogs.length) {
      const buildToWrite = buildLogs.slice(runBuildCache.current.length, buildLogs.length);
      let buildNewlineHandled = [];
      for (let line of buildToWrite) {
        const lines = line[0]?.split("\n");
        buildNewlineHandled = buildNewlineHandled.concat(lines)
        for (let l of lines) {
          instance?.write(l);
        }
      }
      runBuildCache.current = [...runBuildCache.current, ...buildNewlineHandled]
    }

    if (runLogsCache.current.length !== runLogs.length) {
      const runToWrite = buildLogs.slice(runBuildCache.current.length, buildLogs.length);
      let runNewlineHandled = [];
      for (let line of runToWrite) {
        const lines = line[0]?.split("\n");
        runNewlineHandled = runNewlineHandled.concat(lines)
        for (let l of lines) {
          instance?.write(l);
        }
      }
      runBuildCache.current = [...runBuildCache.current, ...runNewlineHandled]
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