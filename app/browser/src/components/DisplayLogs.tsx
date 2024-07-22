import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  DockerJobDefinitionRow,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import { useStore } from '/@/store';

import {
  Code,
  Stack,
} from '@chakra-ui/react';

// show e.g. running, or exit code, or error
export const DisplayLogs: React.FC<{
  stdout: boolean;
  job?: DockerJobDefinitionRow;
}> = ({ job, stdout }) => {
  const state = job?.state;

  const [jobId, setJobId] = useState<string|undefined>(job?.hash);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<string[]>(logs);
  const jobLog = useStore(
    (state) => state.jobLog
  );

  // new job? set jobId
  useEffect(() => {
    setJobId(job?.hash);
  }, [job?.hash]);
  
  // new jobId? clear logs
  useEffect(() => {
    logsRef.current = [];
    setLogs(logsRef.current);
  }, [jobId]);

  // listen to logs
  useEffect(() => {
    if (!jobId || jobLog?.jobId !== jobId) {
      return;
    }
    
    const logs = jobLog.logs.map((log) => log.val);
    logsRef.current = logsRef.current.concat(logs);
    setLogs(logsRef.current);

  }, [jobId, jobLog]);


  if (!job || !state) {
    return (
      <>
        <JustLogs logs={undefined} />
      </>
    );
  }

  switch (state) {
    case DockerJobState.Finished:
      const resultFinished = job?.value as StateChangeValueWorkerFinished;
      return (
        <>
          <JustLogs
            logs={
              stdout
                ? resultFinished?.result?.stdout
                : resultFinished?.result?.stderr
            }
          />
        </>
      );
    case DockerJobState.Running:
      // TODO: handled streaming logs
      return (
        <>
          <JustLogs logs={logs} />
        </>
      );
    case DockerJobState.Queued:
    case DockerJobState.ReQueued:
      // TODO: handled streaming logs
      return (
        <>
          <JustLogs logs={undefined} />
        </>
      );
      
    
  }
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
