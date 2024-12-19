import React, { useCallback, useEffect, useState } from "react";
import { CloseIcon } from "@chakra-ui/icons";
import { IconButton } from "@chakra-ui/react";
import {
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  StateChange,
} from "@metapages/compute-queues-shared";
import { useStore } from "/@/store";

export const ButtonJobCancel: React.FC<{ job: DockerJobDefinitionRow }> = (
  { job },
) => {
  const [clicked, setClicked] = useState<boolean>(false);
  const sendClientStateChange = useStore((state) =>
    state.sendClientStateChange
  );

  useEffect(() => {
    setClicked(false);
  }, [sendClientStateChange]);

  const state = job?.state;

  const onClickCancel = useCallback(() => {
    if (job) {
      setClicked(true);
      sendClientStateChange({
        tag: "",
        state: DockerJobState.Finished,
        job: job.hash,
        value: {
          reason: DockerJobFinishedReason.Cancelled,
          time: Date.now(),
        },
      } as StateChange);
    }
  }, [job, sendClientStateChange]);

  switch (state) {
    case DockerJobState.Queued:
    case DockerJobState.ReQueued:
    case DockerJobState.Running:
      return (
        <IconButton
          aria-label="Cancel"
          icon={<CloseIcon boxSize={3} />}
          onClick={onClickCancel}
          isActive={!clicked}
        >
        </IconButton>
      );
    case DockerJobState.Finished:
      return null;
    default:
      return null;
  }
};
