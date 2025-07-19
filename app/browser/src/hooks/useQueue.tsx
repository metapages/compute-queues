import { useCallback } from "react";

import { getHashParamsFromWindow } from "@metapages/hash-query";
import { useHashParam, useHashParamBoolean } from "@metapages/hash-query/react-hooks";

export const getQueueFromUrl = () => {
  const [_, hashParams] = getHashParamsFromWindow();
  const queue = hashParams["queue"];
  const queueOverride = hashParams["queueOverride"];
  const ignoreQueueOverride = hashParams["ignoreQueueOverride"] === "true";
  const resolvedQueue = !ignoreQueueOverride && queueOverride ? queueOverride : queue;
  return resolvedQueue;
};

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
