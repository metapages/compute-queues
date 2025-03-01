import { ChangeEvent, useCallback, useEffect, useState } from "react";

import { useHashParamBoolean } from "@metapages/hash-query/react-hooks";

export const useOptionShowTerminalFirst = (): [boolean, (event: ChangeEvent<HTMLInputElement>) => void, boolean] => {
  // UGLY HACK DUE TO:
  // https://github.com/metapages/hash-query/issues/1
  const [loading, setLoading] = useState<boolean>(true);
  useEffect(() => {
    setTimeout(() => {
      setLoading(false);
    }, 200);
  }, []);
  const [showTerminalFirst, setShowTerminalFirst] = useHashParamBoolean("terminal");
  const toggleJobStartAutomatically = useCallback(
    (_: ChangeEvent<HTMLInputElement>): void => {
      setShowTerminalFirst(!showTerminalFirst);
    },
    [showTerminalFirst, setShowTerminalFirst],
  );
  return [showTerminalFirst, toggleJobStartAutomatically, loading];
};
