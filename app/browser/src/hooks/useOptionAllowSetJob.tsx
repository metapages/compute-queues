import { ChangeEvent, useCallback } from "react";

import { useHashParamBoolean } from "@metapages/hash-query/react-hooks";

export const useOptionAllowSetJob = (): [boolean, (event?: ChangeEvent<HTMLInputElement>) => void] => {
  const [allowSetJob, setAllowSetJob] = useHashParamBoolean("allowsetjob");
  const toggleResolveDataRefs = useCallback(
    (_: ChangeEvent<HTMLInputElement>): void => {
      setAllowSetJob(!allowSetJob);
    },
    [allowSetJob, setAllowSetJob],
  );
  return [allowSetJob, toggleResolveDataRefs];
};
