import { Icon, Tooltip } from "@chakra-ui/react";
import { Queue as QueueIcon } from "@phosphor-icons/react";
import React from "react";
import { Queue } from "/@/components/sections/queue/Queue";
import { useQueue } from "/@/hooks/useQueue";
import { useStore } from "/@/store";

export const QueueControl: React.FC = () => {
  const setRightPanelContext = useStore(state => state.setRightPanelContext);
  const rightPanelContext = useStore(state => state.rightPanelContext);
  const workers = useStore(state => state.workers);
  const { resolvedQueue } = useQueue();
  const workerCount = workers?.workers ? Object.keys(workers.workers).length : 0;
  const isNoWorkers = workerCount === 0;
  const isOpen = rightPanelContext === "queue";
  const color = !resolvedQueue ? undefined : isNoWorkers ? "orange" : "none";
  const textColor = !resolvedQueue ? (isOpen ? undefined : "red.300") : isNoWorkers ? undefined : undefined;

  const toggleQueue = () => {
    setRightPanelContext(isOpen ? null : "queue");
  };

  return (
    <Tooltip
      defaultIsOpen={!resolvedQueue && !isOpen}
      label={
        !resolvedQueue
          ? "Set a queue key"
          : isNoWorkers
            ? `Queue workers: ${workerCount}`
            : `Queue workers: ${workerCount}`
      }>
      <Icon
        as={QueueIcon}
        _hover={{ bg: "gray.300" }}
        color={color}
        bg={isOpen ? "gray.300" : "none"}
        textColor={textColor}
        p={"3px"}
        borderRadius={5}
        boxSize="6"
        onClick={toggleQueue}
      />
    </Tooltip>
  );
};
