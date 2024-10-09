import React, { useCallback, useEffect, useState } from "react";

import { useJobSubmissionHook } from "/@/hooks/useJobSubmissionHook";
import { DockerJobFinishedReason, DockerJobState, StateChangeValueWorkerFinished } from "/@/shared/types";

import { Button, HStack, Icon, Spacer, Text, useMediaQuery } from "@chakra-ui/react";
import { useHashParam } from "@metapages/hash-query";
import { Lock, Play, Queue as QueueIcon, Repeat, Stop } from "@phosphor-icons/react";

import { useStore } from "../../store";

export const JobControlButton: React.FC = () => {
  const serverJobState = useStore(state => state.jobState);
  const clientJobDefinition = useStore(state => state.newJobDefinition);

  const [isLargerThan600] = useMediaQuery("(min-width: 600px)");
  const [isJobRequeued, setIsJobRequeued] = useState(false);
  const [queue] = useHashParam("queue", "");

  const mainInputFileContent = useStore(state => state.mainInputFileContent);
  const setUserClickedRun = useStore(state => state.setUserClickedRun);
  const [temporarilyForceShowQueued, setTemporarilyForceShowQueued] = useState(false);

  // If we get a new job state, we are not in the process of requeueing
  useEffect(() => {
    if (serverJobState) {
      setIsJobRequeued(false);
    }
  }, [serverJobState]);

  const { submitJob, loading } = useJobSubmissionHook();
  const cancelJob = useStore(state => state.cancelJob);
  const saveInputFileAndRun = useStore(state => state.saveInputFileAndRun);
  const resubmitJob = useStore(state => state.resubmitJob);

  const state = serverJobState?.state;
  const isMissingBuild = !(clientJobDefinition?.definition?.build || clientJobDefinition?.definition?.image);

  const onClickCancel = useCallback(() => {
    cancelJob();
  }, [cancelJob]);

  const onClickRetry = useCallback(() => {
    setUserClickedRun(true);
    setIsJobRequeued(true);
    resubmitJob();
  }, [resubmitJob, setUserClickedRun]);

  const onClickSaveAndRun = useCallback(() => {
    setUserClickedRun(true);
    saveInputFileAndRun();
    setTemporarilyForceShowQueued(true);
    setTimeout(() => {
      setTemporarilyForceShowQueued(false);
    }, 1000);
  }, [saveInputFileAndRun, setUserClickedRun]);

  const onClickRun = useCallback(() => {
    submitJob();
    setUserClickedRun(true);
  }, [submitJob, setUserClickedRun]);

  const noBuildButton = (
    <HeaderButton ariaLabel="No docker build or image" color={"red"} text={isLargerThan600 ? "No docker image" : ""} />
  );

  const noQueueButton = <HeaderButton ariaLabel="No queue" color={"red"} text={isLargerThan600 ? "No queue 👇" : ""} />;

  const disabledButton = (
    <HeaderButton
      ariaLabel="Disabled"
      text={isLargerThan600 ? "Disabled" : ""}
      icon={<Icon as={Lock} size={"1.2rem"} />}
    />
  );

  const cancelButton = (
    <HeaderButton
      ariaLabel="Stop-job"
      icon={<Stop weight="duotone" color="red" size={"1.2rem"} />}
      onClick={onClickCancel}
      text={isLargerThan600 ? "Stop Job" : ""}
      color={"red"}
    />
  );

  const saveAndRunButton = (
    <HeaderButton
      ariaLabel="Save-and-run"
      icon={<Play weight="duotone" color="green" size={"1.2rem"} />}
      onClick={onClickSaveAndRun}
      text={isLargerThan600 ? "Save+Run" : ""}
      loading={loading}
    />
  );

  const queuedButton = (
    <HeaderButton
      ariaLabel="Queued"
      icon={<QueueIcon color="green" size={"1.2rem"} />}
      onClick={() => {}}
      text={isLargerThan600 ? "queued..." : ""}
    />
  );

  const requeueButton = (
    <HeaderButton
      ariaLabel="Re-queue"
      icon={<Icon as={Repeat} color="green" size={"1.2rem"} />}
      onClick={onClickRetry}
      loading={isJobRequeued}
      text={isLargerThan600 ? "Run Again" : ""}
      color={"green"}
    />
  );

  const runButton = (
    <HeaderButton
      ariaLabel="Run-job"
      icon={<Play weight="duotone" color="green" size={"1.2rem"} />}
      onClick={onClickRun}
      text={isLargerThan600 ? "Run Job" : ""}
      color={"green"}
    />
  );

  const _runButtonDisabled = (
    <HeaderButton
      ariaLabel="Run-job"
      icon={<Play weight="duotone" color="gray" size={"1.2rem"} />}
      text={isLargerThan600 ? "Run Job" : ""}
      color={"gray"}
    />
  );

  if (isMissingBuild) {
    return noBuildButton;
  }

  if (!queue) {
    return noQueueButton;
  }

  if (temporarilyForceShowQueued) {
    return queuedButton;
  }

  if (!state) {
    return runButton;
  }

  if (mainInputFileContent) {
    return saveAndRunButton;
  }

  switch (state) {
    case DockerJobState.Queued:
    case DockerJobState.Running:
      return cancelButton;
    case DockerJobState.Finished: {
      const value: StateChangeValueWorkerFinished | undefined = serverJobState?.value as StateChangeValueWorkerFinished;
      if (value) {
        switch (value.reason) {
          case DockerJobFinishedReason.Error:
          case DockerJobFinishedReason.Success:
          case DockerJobFinishedReason.Cancelled:
          case DockerJobFinishedReason.TimedOut:
            return requeueButton;
          case DockerJobFinishedReason.WorkerLost:
            return cancelButton;
        }
      }
      return disabledButton;
    }
    default:
      return disabledButton;
  }
};

const HeaderButton: React.FC<{
  text: string;
  ariaLabel: string;
  onClick?: () => void;
  icon?: JSX.Element;
  color?: string;
  loading?: boolean;
}> = ({ text, ariaLabel, onClick, icon, color, loading }) => {
  return (
    <Button
      // why is this here?
      // disabled={true}
      w={text.length ? "7.5rem" : "3rem"}
      aria-label={ariaLabel}
      variant={"ghost"}
      _hover={{ bg: "none" }}
      onClick={onClick}
      cursor={onClick ? "pointer" : "not-allowed"}
      isLoading={loading}>
      <HStack gap={2}>
        {icon}
        {text.length && <Spacer />}
      </HStack>
      <Text color={color || "gray.600"} fontWeight={500} fontSize={"0.9rem"}>
        {text}
      </Text>
    </Button>
  );
};
