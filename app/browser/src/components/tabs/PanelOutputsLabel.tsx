import { DockerJobDefinitionRow } from '/@/shared';

import { getOutputNames } from './PanelOutputs';

export const PanelOutputsLabel: React.FC<{
  job: DockerJobDefinitionRow | undefined;
}> = ({ job }) => {
  const jobCount = getOutputNames(job).length;

  return <> Outputs {`(${jobCount})`}</>;
};
