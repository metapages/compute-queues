import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { ConsoleLogLine } from '/@/shared';
import { useStore } from '/@/store';

import {
  Code,
  Stack,
} from '@chakra-ui/react';

export type LogsMode = "stdout+stderr" | "stdout" | "stderr" | "build";

const EMPTY_ARRAY: ConsoleLogLine[] = [];

// show e.g. running, or exit code, or error
export const DisplayLogs: React.FC<{
  mode: LogsMode;
}> = ({ mode }) => {
  const logsRef = useRef<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | undefined>();
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
        currentLogs = runLogs || EMPTY_ARRAY;
        break;
      case "stdout":
        currentLogs = runLogs?.filter((l) => !l[2]) || EMPTY_ARRAY;
        break;
      case "stderr":
        currentLogs = runLogs?.filter((l) => l[2]) || EMPTY_ARRAY;
        break;
      case "build":
        currentLogs = buildLogs || [];
        break;
    }

    logsRef.current = currentLogs?.map((l) => l[0]);
    setLogs(logsRef.current);
  }, [mode, jobState, jobId, buildLogs, runLogs]);

  if (!jobId) {
    return <JustLogs logs={undefined} />;
  }

  return <JustLogs logs={logs} />;
};

const JustLogs: React.FC<{
  logs?: string[];
}> = ({ logs }) => {
  let logsNewlineHandled: string[] = [];
  if (logs) {
    logs.forEach((line) => {
      if (!line) {
        return;
      }
      const lines = line?.split("\n");
      logsNewlineHandled = logsNewlineHandled.concat(lines);
    });
  }
  return (
    <Stack spacing={1}>
      {logsNewlineHandled.map((line, i) => (
        <Code key={i} fontSize={10}>
          {line}
        </Code>
      ))}
    </Stack>
  );
};
