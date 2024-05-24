import { StatusIcon } from '/@/components/StatusIcon';
import { DockerJobDefinitionRow } from '/@/shared';

export const PanelJobLabel: React.FC<{
  job: DockerJobDefinitionRow | undefined;
}> = ({ job }) => {
  return (
    <>
      <StatusIcon job={job} />
      &nbsp; Job{" "}
    </>
  );
};
