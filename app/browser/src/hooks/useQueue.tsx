import { useHashParam, useHashParamBoolean } from "@metapages/hash-query/react-hooks";
import { useCallback } from "react";

export const useQueue = () => {
  // set and stored locally
  const [queue, setQueue] = useHashParam("queue", "");
  // set/injected by the parent page
  const [queueOverride] = useHashParam("queueOverride", "");
  const [ignoreQueueOverride, setIgnoreQueueOverride] = useHashParamBoolean("ignoreQueueOverride");
  const resolvedQueue = !ignoreQueueOverride && queueOverride ? queueOverride : queue;
  const isLocalMode = resolvedQueue === "local";

  const toggleLocalMode = useCallback(() => {
    if (queue === "local") {
      const previousQueue = localStorage.getItem("previous-queue");
      if (previousQueue && previousQueue !== "local") {
        setQueue(previousQueue);
      } else {
        setQueue("");
      }
    } else {
      localStorage.setItem("previous-queue", queue ?? "");
      setQueue("local");
    }
  }, [queue, setQueue]);

  return {
    resolvedQueue,
    isLocalMode,
    queue,
    setQueue,
    toggleLocalMode,
    queueOverride,
    ignoreQueueOverride,
    setIgnoreQueueOverride,
  };
};
