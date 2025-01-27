import React, { useCallback } from "react";

import { Button, Tooltip } from "@chakra-ui/react";
import { useQueue } from "/@/hooks/useQueue";

export const QueueOverrideButtonAndLabel: React.FC = () => {
  const { ignoreQueueOverride, setIgnoreQueueOverride } = useQueue();

  const onToggle = useCallback(() => {
    if (ignoreQueueOverride) {
      // We are changing to ENABLING the override
      setIgnoreQueueOverride(false);
      // Store the previous queue, so we can toggle back and forth without losing data
      // localStorage.setItem("previous-queue", queue && queue !== "local" ? queue : "");
    } else {
      // We are changing to DISABLING the override, meaning we use our set queue
      setIgnoreQueueOverride(true);
      // const previousQueue = localStorage.getItem("previous-queue");
      // if (previousQueue) {
      //   setQueue(previousQueue);
      // } else {
      //   setQueue(undefined);
      // }
    }
  }, [ignoreQueueOverride, setIgnoreQueueOverride]);

  return (
    <Tooltip label={ignoreQueueOverride ? "Click to use queue from page" : "Click to use queue set here"}>
      {/* onFocus https://github.com/chakra-ui/chakra-ui/issues/5304#issuecomment-1102836734 */}
      <Button
        minWidth={200}
        onFocus={e => e.preventDefault()}
        pr={10}
        variant="ghost"
        onClick={onToggle}
        aria-label="queue override">
        {ignoreQueueOverride ? "Queue set here" : "Queue from page"}
      </Button>
    </Tooltip>
  );
};
