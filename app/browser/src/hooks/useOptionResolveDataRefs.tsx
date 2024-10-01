import { ChangeEvent, useCallback } from "react";

import { useHashParamBoolean } from "@metapages/hash-query";

export const useOptionResolveDataRefs = (): [boolean, (event?: ChangeEvent<HTMLInputElement>) => void] => {
  const [resolveDatarefs, setResolveDatarefs] = useHashParamBoolean("resolverefs");
  const toggleResolveDataRefs = useCallback(
    (_: ChangeEvent<HTMLInputElement>): void => {
      setResolveDatarefs(!resolveDatarefs);
    },
    [resolveDatarefs, setResolveDatarefs],
  );
  return [resolveDatarefs, toggleResolveDataRefs];
};
