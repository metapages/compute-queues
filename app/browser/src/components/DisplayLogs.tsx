import {
  DockerJobDefinitionRow,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';

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
    case DockerJobState.Queued:
    case DockerJobState.ReQueued:
    case DockerJobState.Running:
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
      const lines = line.split("\n");
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
