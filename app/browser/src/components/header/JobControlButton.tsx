import React, { useCallback, useEffect, useState } from "react";

import { useJobSubmissionHook } from "/@/hooks/useJobSubmissionHook";
import { useOptionJobStartAutomatically } from "/@/hooks/useOptionJobStartAutomatically";
import { useQueue } from "/@/hooks/useQueue";
import { DockerJobFinishedReason, DockerJobState } from "/@shared/client";

import { Button, HStack, Icon, Spacer, Text, Tooltip, useMediaQuery } from "@chakra-ui/react";
import { Backspace, Play, Queue as QueueIcon, Stop } from "@phosphor-icons/react";

import { useStore } from "../../store";

export const JobControlButton: React.FC = () => {
  const [_, serverJobState] = useStore(state => state.jobState);
  const clientJobDefinition = useStore(state => state.newJobDefinition);

  const [isLargerThan600] = useMediaQuery("(min-width: 600px)");
  const [isJobRequeued, setIsJobRequeued] = useState(false);
  const { resolvedQueue } = useQueue();

  const mainInputFileContent = useStore(state => state.mainInputFileContent);
  const setUserClickedRun = useStore(state => state.setUserClickedRun);
  const [temporarilyForceShowQueued, setTemporarilyForceShowQueued] = useState(false);
  const [jobStartAutomatically] = useOptionJobStartAutomatically();

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
  const deleteJobCache = useStore(state => state.deleteJobCache);

  const state = serverJobState?.state;
  const isMissingBuild = !(clientJobDefinition?.definition?.build || clientJobDefinition?.definition?.image);

  const onClickCancel = useCallback(() => {
    cancelJob();
  }, [cancelJob]);

  const onClickDeleteAndMaybeRetry = useCallback(async () => {
    await deleteJobCache();
    if (jobStartAutomatically) {
      setUserClickedRun(true);
      setIsJobRequeued(true);
      await new Promise(resolve => setTimeout(resolve, 500));
      resubmitJob();
    }
  }, [resubmitJob, setUserClickedRun, jobStartAutomatically, deleteJobCache]);

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
    <HeaderButton
      tooltip="Add a docker build or image"
      ariaLabel="No docker build or image"
      color={"red"}
      text={isLargerThan600 ? "" : ""}
    />
  );

  // const _noQueueButton = (
  //   <HeaderButton
  //     tooltip="Add a queue (button below)"
  //     ariaLabel="No queue"
  //     color={"red"}
  //     text={isLargerThan600 ? "No queue 👇" : ""}
  //   />
  // );

  // const disabledButton = (
  //   <HeaderButton
  //     ariaLabel="Disabled"
  //     tooltip="Disabled"
  //     text={isLargerThan600 ? "Disabled" : ""}
  //     icon={<Icon as={Lock} size={"1.2rem"} />}
  //   />
  // );

  const cancelButton = (
    <HeaderButton
      ariaLabel="Stop-job"
      tooltip="Stop the job"
      icon={<Stop weight="duotone" color="red" size={"1.2rem"} />}
      onClick={onClickCancel}
      text={isLargerThan600 ? "Stop Job" : ""}
      color={"red"}
    />
  );

  const saveAndRunButton = (
    <HeaderButton
      ariaLabel="Save-and-run"
      tooltip="Save and run the job"
      icon={<Play weight="duotone" color="green" size={"1.2rem"} />}
      onClick={onClickSaveAndRun}
      text={isLargerThan600 ? "Save+Run" : ""}
      loading={loading}
    />
  );

  const queuedButton = (
    <HeaderButton
      ariaLabel="Queued"
      tooltip="Job is queued"
      icon={<QueueIcon color="green" size={"1.2rem"} />}
      onClick={() => {}}
      text={isLargerThan600 ? "queued..." : ""}
    />
  );

  const deleteMaybeRetryButton = (
    <HeaderButton
      ariaLabel="Re-queue"
      tooltip="Delete cache (and re-run if autorun is enabled)"
      // icon={<Icon as={Repeat} color="green" size={"1.2rem"} />}
      icon={<Icon as={Backspace} size={"1.2rem"} />}
      onClick={onClickDeleteAndMaybeRetry}
      loading={isJobRequeued}
      text={isLargerThan600 ? "Delete" : ""}
      // color={"green"}
    />
  );

  const runButton = (
    <HeaderButton
      ariaLabel="Run-job"
      tooltip="Run the job"
      icon={<Play weight="duotone" color="green" size={"1.2rem"} />}
      onClick={onClickRun}
      text={isLargerThan600 ? "Run Job" : ""}
      color={"green"}
    />
  );

  const _runButtonDisabled = (
    <HeaderButton
      ariaLabel="Run-job"
      tooltip=""
      icon={<Play weight="duotone" color="gray" size={"1.2rem"} />}
      text={isLargerThan600 ? "Run Job" : ""}
      color={"gray"}
    />
  );

  // console.log(
  //   `🐸🅾️ JobControlButton [${serverJobState?.id?.substring(0, 5)}] state=[${serverJobState?.state}] ${serverJobState?.finished?.reason ? serverJobState?.finished?.reason : ""}`,
  // );

  if (isMissingBuild) {
    return noBuildButton;
  }

  if (!resolvedQueue) {
    // return noQueueButton;
    return null;
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
      const reason = serverJobState?.finished?.reason;
      if (reason) {
        switch (reason) {
          case DockerJobFinishedReason.Deleted:
            return runButton;
          case DockerJobFinishedReason.Cancelled:
          case DockerJobFinishedReason.JobReplacedByClient:
          case DockerJobFinishedReason.Error:
          case DockerJobFinishedReason.Success:
          case DockerJobFinishedReason.TimedOut:
            return deleteMaybeRetryButton;
          case DockerJobFinishedReason.WorkerLost:
            return cancelButton;
        }
      }
      return deleteMaybeRetryButton;
    }
    default:
      return deleteMaybeRetryButton;
  }
};

const HeaderButton: React.FC<{
  text: string;
  tooltip: string;
  ariaLabel: string;
  onClick?: () => void;
  icon?: JSX.Element;
  color?: string;
  loading?: boolean;
}> = ({ text, tooltip, ariaLabel, onClick, icon, color, loading }) => {
  return (
    <Tooltip label={tooltip}>
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
    </Tooltip>
  );
};
