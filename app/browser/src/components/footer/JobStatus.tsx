import React from "react";
import { useHashParam } from '@metapages/hash-query';

import {
  Text,
  Icon,
  HStack,
  Spinner,
  VStack,
} from "@chakra-ui/react";
import {
  Prohibit,
  WarningCircle,
  Check,
  HourglassMedium,
} from "@phosphor-icons/react";
import {
  DockerJobFinishedReason,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import { useStore } from '/@/store';

const STATUS_ICON_SIZE = 6;
export const JobStatus: React.FC = () => {
  const [queue] = useHashParam("queue");
  if (!queue || queue === "") return <></>
  const workers = useStore((state) => state.workers);
  const job = useStore((state) => state.jobState);

  const state = job?.state;

  if (!state) {
    return <></>
  }

  const { icon, text, exitCode, desc, jobId, showExitCodeRed } = getJobStateValues(
    job, 
    state, 
    workers?.workers?.length || 0
  );

  // Question: should the jobId be click to copy? - yes
  return <HStack h={'100%'} gap={5} alignItems='center' justifyContent={'center'}>
      {icon}
      <VStack gap={0.2} alignItems={"flex-start"}>
        <Text align={"start"} fontWeight={500}>{text}</Text>
        <HStack gap={2}>
          {desc && <Text fontSize={'0.7rem'}>{desc}</Text>}
          {jobId && <Text fontSize={'0.7rem'}>Job Id: {jobId.slice(0, 5)}</Text>}
          {exitCode !== null && <Text color={showExitCodeRed && 'red'} fontSize={'0.7rem'}>Exit Code: {exitCode}</Text>}
        </HStack>
      </VStack>
  </HStack>
};

const getJobStateValues = (job, state, workerCount): {
  icon: any, 
  text: string, 
  exitCode: any, 
  desc: any,
  jobId: any,
  showExitCodeRed: boolean,
} => {
  let text = '';
  let icon = <></>
  let desc = null;
  let exitCode = null;
  let showExitCodeRed = false;
  let jobId = job?.hash;

  if (!job) {
    text = "No job started"
    icon = <Icon as={Prohibit} boxSize={STATUS_ICON_SIZE} />
  }
  
  switch (state) {
    case DockerJobState.Finished:
      const resultFinished = job.value as StateChangeValueWorkerFinished;

      if (!resultFinished) {
        icon = <Icon color={'red'} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
        text = "Job Finished - No Result";
        showExitCodeRed = true;
        break;
      }
      switch (resultFinished.reason) {
        case DockerJobFinishedReason.Cancelled:
          icon = <Icon as={WarningCircle} boxSize={STATUS_ICON_SIZE} />
          text = "Job Cancelled";
          break; 
        case DockerJobFinishedReason.Error:
          const errorBlob:
            { statusCode: number; json: { message: string } }
            | undefined = resultFinished?.result?.error;
          showExitCodeRed = true;
          icon = <Icon color={'red'} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
          text = "Job Failed";
          // truncate to char len, add modal if it's longer than one line (to right of exit code)
          desc = errorBlob?.json?.message;
          exitCode = errorBlob?.statusCode;
          break; 
        case DockerJobFinishedReason.Success:
          exitCode = resultFinished?.result?.StatusCode;
          text = "Job Complete"
          if (exitCode === 0) {
            icon = <Icon color={'green'} as={Check} boxSize={STATUS_ICON_SIZE} />;
          } else {
            icon = <Icon color={'orange'} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
          }
          break; 
        case DockerJobFinishedReason.TimedOut:
          icon = <Icon color={'orange'} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
          text = "Job Timed Out";
          break; 
        case DockerJobFinishedReason.WorkerLost:
          icon = <Icon color={'orange'} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
          text = "Connection with worker lost, waiting to requeue";
          break; 
      }
      break;
    case DockerJobState.Queued:
      icon = <Icon as={HourglassMedium} boxSize={STATUS_ICON_SIZE} />;
      text = "Job Queued"
      break; 
    case DockerJobState.ReQueued:
      icon = <Icon color={'orange'} as={WarningCircle} boxSize={STATUS_ICON_SIZE} />;
      text = "Job Requeued";
      break; 
    case DockerJobState.Running:
      text = "Job Running";
      icon = <Spinner color={'orange'} boxSize={STATUS_ICON_SIZE} />;
      desc = `${workerCount} Worker${workerCount > 1 && 's'}`;
      break; 
    }
  return {text, icon, desc, exitCode, jobId, showExitCodeRed};
};