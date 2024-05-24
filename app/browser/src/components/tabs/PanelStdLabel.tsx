import {
  DockerJobDefinitionRow,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';

export const PanelStdLabel: React.FC<{
  job: DockerJobDefinitionRow | undefined;
  stdout?: boolean;
}> = ({ job, stdout = true }) => {
  const lineCount = getStd(stdout, job);

  return (
    <>
      {" "}
      {stdout ? "Stdout" : "Stderr"}{" "}
      {lineCount !== null ? `(${lineCount})` : null}
    </>
  );
};

export const getStd = (
  stdout: boolean,
  job?: DockerJobDefinitionRow
): null | number => {
  if (!job?.state || job.state !== DockerJobState.Finished) {
    return null;
  }
  const result = (job.value as StateChangeValueWorkerFinished).result;

  const lines = (stdout ? result?.stdout : result?.stderr) ?? null;
  const count =
    lines !== null
      ? lines.reduce((count, line) => count + line.split("\n").length, 0)
      : null;

  return count;
};
