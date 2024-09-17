import { WarningIcon } from "@chakra-ui/icons";
import { useHashParam } from "@metapages/hash-query";
import { useActiveJobsCount } from "/@/hooks/useActiveJobsCount";
import { useWorkersCount } from "/@/hooks/useWorkersCount";

export const TabLabelQueue: React.FC = () => {
  const [queue] = useHashParam("queue", "");
  const activeJobsCount = useActiveJobsCount();
  const workersCount = useWorkersCount();

  return (
    <>
      {queue && workersCount > 0 ? null : <WarningIcon color="red" />}&nbsp;
      Queue {`(${activeJobsCount})`}
    </>
  );
};
