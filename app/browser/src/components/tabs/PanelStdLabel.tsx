import { useStore } from '/@/store';

export const PanelStdLabel: React.FC<{
  stdout?: boolean;
}> = ({ stdout = true }) => {
  const runLogs = useStore((state) => state.runLogs);
  const lineCountTotal = runLogs?.length || 0;
  const lineCountStdout = runLogs?.filter((l) => !l[2])?.length || 0;
  const lineCountStderr = lineCountTotal - lineCountStdout;
  const lineCount = stdout ? lineCountStdout : lineCountStderr;

  return (
    <>
      {" "}
      {stdout ? "Stdout" : "Stderr"} {lineCount > 0 ? `(${lineCount})` : null}
    </>
  );
};
