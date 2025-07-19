import React, { useCallback, useEffect, useState } from "react";

import { useStore } from "/@/store";
import { DockerJobFinishedReason, DockerJobState, InMemoryDockerJob, StateChange } from "/@shared/client";

import { CloseIcon } from "@chakra-ui/icons";
import { IconButton } from "@chakra-ui/react";

export const ButtonJobCancel: React.FC<{ jobId: string; job: InMemoryDockerJob }> = ({ jobId, job }) => {
  const [clicked, setClicked] = useState<boolean>(false);
  const sendClientStateChange = useStore(state => state.sendClientStateChange);

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
        job: jobId,
        value: {
          reason: DockerJobFinishedReason.Cancelled,
          time: Date.now(),
          message: "Job cancelled by client",
        },
      } as StateChange);
    }
  }, [job, sendClientStateChange]);

  switch (state) {
    case DockerJobState.Queued:
    case DockerJobState.Running:
      return (
        <IconButton
          aria-label="Cancel"
          icon={<CloseIcon boxSize={3} />}
          onClick={onClickCancel}
          isActive={!clicked}></IconButton>
      );
    case DockerJobState.Finished:
      return null;
    default:
      return null;
  }
};
