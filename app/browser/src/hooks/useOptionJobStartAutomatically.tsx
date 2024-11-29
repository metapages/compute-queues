import { ChangeEvent, useCallback } from "react";

import { useHashParamBoolean } from "@metapages/hash-query/react-hooks";

export const useOptionJobStartAutomatically = (): [boolean, (event: ChangeEvent<HTMLInputElement>) => void] => {
  const [jobStartAutomatically, setJobStartAutomatically] = useHashParamBoolean("autostart");
  const toggleJobStartAutomatically = useCallback(
    (_: ChangeEvent<HTMLInputElement>): void => {
      setJobStartAutomatically(!jobStartAutomatically);
    },
    [jobStartAutomatically, setJobStartAutomatically],
  );
  return [jobStartAutomatically, toggleJobStartAutomatically];
};
