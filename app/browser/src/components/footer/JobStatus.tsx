import React from "react";

import { useQueue } from "/@/hooks/useQueue";
import { useStore } from "/@/store";
import {
  ConsoleLogLine,
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  StateChangeValueFinished,
} from "/@shared/client";
import humanizeDuration from "humanize-duration";

import { Box, HStack, Icon, Spinner, Text, useToast, VStack } from "@chakra-ui/react";
import { Check, HourglassMedium, Prohibit, WarningCircle } from "@phosphor-icons/react";

const humanizeDurationOptions = {
  // round: true,
  maxDecimalPoints: 1,
};

const STATUS_ICON_SIZE = 6;
export const JobStatus: React.FC = () => {
  const toast = useToast();
  const { resolvedQueue } = useQueue();

  const workers = useStore(state => state.workers);
  const job = useStore(state => state.jobState);
  const buildLogs = useStore(state => state.buildLogs);

  const state = job?.state;

  if (!state) {
    return <></>;
  }

  if (!resolvedQueue) return <></>;

  const { icon, text, exitCode, desc, jobId, showExitCodeRed } = getJobStateValues(
    job,
    state,
    workers?.workers?.length || 0,
    buildLogs,
  );

  const copyJobId = () => {
    // Note: this does not currently work
    // see https://www.chromium.org/Home/chromium-security/deprecating-permissions-in-cross-origin-iframes/
    navigator?.clipboard?.writeText(jobId);

    // eslint-disable-next-line
    if (!!navigator?.clipboard?.writeText) {
      toast({
        position: "bottom-left",
        duration: 20,
        isClosable: true,
        render: () => (
          <Box color="gray.600" p={3} bg="gray.300" mb={"footerHeight"}>
            <Text>Job Id copied to clipboard</Text>
          </Box>
        ),
      });
    }
  };

  return (
    <HStack h={"100%"} gap={5} alignItems="center" justifyContent={"center"}>
      {icon}
      <VStack gap={0.2} alignItems={"flex-start"}>
        <Text align={"start"} fontWeight={500}>
          {text}
        </Text>
        <HStack gap={2}>
          {desc && (
            <Text display={{ base: "none", md: "block" }} fontSize={"0.7rem"}>
              {desc}
            </Text>
          )}
          {jobId && (
            <Text display={{ base: "none", md: "block" }} cursor={"copy"} onClick={copyJobId} fontSize={"0.7rem"}>
              Job Id: {jobId.slice(0, 5)}
            </Text>
          )}
          {exitCode && (
            <Text color={showExitCodeRed ? "red" : undefined} fontSize={"0.7rem"}>
              Exit Code: {exitCode}
            </Text>
          )}
        </HStack>
      </VStack>
    </HStack>
  );
};

const getJobStateValues = (
  job: DockerJobDefinitionRow | undefined,
  state: DockerJobState,
  workerCount: number,
  buildLogs: ConsoleLogLine[] | null,
) => {
  let text = "";
  let icon = <></>;
  let desc = null;
  let exitCode = null;
  let showExitCodeRed = false;
  const jobId = job?.hash;
  const resultFinished = job?.value as StateChangeValueFinished;
  const errorBlob = resultFinished?.result?.error as { statusCode: number; json: { message: string } } | undefined;

  if (!job) {
    text = "No job started";
    icon = <Icon as={Prohibit} boxSize={STATUS_ICON_SIZE} />;
  }

  switch (state) {
    case DockerJobState.Finished:
      if (!resultFinished) {
        icon = <Icon color={"red"} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
        text = "Job Finished - No Result";
        showExitCodeRed = true;
        break;
      }
      switch (resultFinished.reason) {
        case DockerJobFinishedReason.Cancelled:
          icon = <Icon as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
          text = `Job Cancelled ${resultFinished?.result?.duration ? `(${humanizeDuration(resultFinished.result.duration, humanizeDurationOptions)})` : ""}`;
          break;
        case DockerJobFinishedReason.Error:
          showExitCodeRed = true;
          icon = <Icon color={"red"} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
          text = `Job Failed ${resultFinished?.result?.duration ? `(${humanizeDuration(resultFinished.result.duration, humanizeDurationOptions)})` : ""}`;
          // truncate to char len, add modal if it's longer than one line (to right of exit code)
          desc = errorBlob?.json?.message;
          exitCode = errorBlob?.statusCode;
          break;
        case DockerJobFinishedReason.Success:
          exitCode = resultFinished?.result?.StatusCode;
          text = `Job Complete ${resultFinished?.result?.duration ? `(${humanizeDuration(resultFinished.result.duration, humanizeDurationOptions)})` : ""}`;
          if (exitCode === 0) {
            icon = <Icon color={"green"} as={Check} boxSize={STATUS_ICON_SIZE} />;
          } else {
            icon = <Icon color={"orange"} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
          }
          break;
        case DockerJobFinishedReason.TimedOut:
          icon = <Icon color={"orange"} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
          text = `Job Timed Out ${resultFinished?.result?.duration ? `(${humanizeDuration(resultFinished.result.duration, humanizeDurationOptions)})` : ""}`;
          break;
        case DockerJobFinishedReason.WorkerLost:
          icon = <Icon color={"orange"} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
          text = "Connection with worker lost, waiting to requeue";
          break;
      }
      break;
    case DockerJobState.Queued:
      icon = <Icon as={HourglassMedium} boxSize={STATUS_ICON_SIZE} />;
      text = "Job Queued";
      break;
    case DockerJobState.ReQueued:
      icon = <Icon color={"orange"} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
      text = "Job Requeued";
      break;
    case DockerJobState.Running:
      text = buildLogs && buildLogs.length > 0 ? "Job Building" : "Job Running";
      icon = <Spinner color={"orange"} boxSize={STATUS_ICON_SIZE} />;
      desc = `${workerCount} Worker${workerCount > 1 ? "s" : ""}`;
      break;
  }
  return { text, icon, desc, exitCode, jobId, showExitCodeRed };
};
