import { StatusIcon } from '/@/components/StatusIcon';
import { useStore } from '/@/store';

export const PanelJobLabel: React.FC = () => {
  const job = useStore((state) => state.jobState);
  return (
    <>
      <StatusIcon job={job} />
      &nbsp; Job{" "}
    </>
  );
};
