import { useStore } from '/@/store';

import { getOutputNames } from './PanelOutputs';

export const PanelOutputsLabel: React.FC = () => {
  const job = useStore((state) => state.jobState);
  const jobCount = getOutputNames(job).length;

  return <> Outputs {`(${jobCount})`}</>;
};
