import {
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import { useStore } from '/@/store';

import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  CircularProgress,
  Heading,
  HStack,
  ListItem,
  Text,
  UnorderedList,
  VStack,
} from '@chakra-ui/react';
import { useHashParam } from '@metapages/hash-query';

import { ButtonCancelOrRetry } from '../ButtonCancelOrRetry';
import { ButtonDeleteCache } from '../ButtonDeleteCache';
import { DisplayLogs } from '../DisplayLogs';
import { PanelImageAndContainer } from './PanelImageAndContainer';

type ErrorObject = { statusCode: number; json: { message: string } };

export const PanelJob: React.FC = () => {
  const job = useStore((state) => state.jobState);
  const [queue] = useHashParam("queue");

  return (
    <Box w="100%" maxW="100%" p={2}>
      <HStack w="100%" spacing="24px" alignItems="flex-start">
        <PanelImageAndContainer />

        <VStack w="50%" alignItems="flex-start">
          <Heading size="sm">Job status and control</Heading>

          <VStack
            borderWidth="1px"
            p={4}
            borderRadius="lg"
            w="100%"
            alignItems="flex-start"
          >
            <HStack w="100%" justifyContent="space-between">
              <ButtonCancelOrRetry job={job} />

              <Text maxW="200px" isTruncated>
                {job?.hash ? `id: ${job?.hash}` : null}
              </Text>
            </HStack>
            <ButtonDeleteCache job={job} />
            <HStack w="100%" h="100%">
              {!queue || queue === "" ? null : <JobStatusDisplay job={job} />}
            </HStack>

            <Heading size="sm">Build Logs</Heading>

            <DisplayLogs mode={"build"} />

            
          </VStack>
        </VStack>
      </HStack>
    </Box>
  );
};

// show e.g. running, or exit code, or error
const JobStatusDisplay: React.FC<{
  job: DockerJobDefinitionRow | undefined;
}> = ({ job }) => {
  const state = job?.state;
  const workers = useStore((state) => state.workers);

  if (!job) {
    return (
      <Alert status="info">
        <AlertIcon />
        Waiting on job status from the server...
      </Alert>
    );
  }

  if (!state) {
    return (
      <Alert status="error">
        <AlertIcon />
        No job state. This is a bug. Wait for a bit, otherwise click edit.
      </Alert>
    );
  }

  const workersTotal = workers?.workers?.length || 0;

  

  switch (state) {
    case DockerJobState.Finished:
      const resultFinished = job.value as StateChangeValueWorkerFinished;
      if (!resultFinished) {
        return (
          <Alert status="error">
            <AlertIcon />
            <AlertTitle mr={2}>
              Something went wrong and it's our fault
            </AlertTitle>
            <AlertDescription>
              The job says done but there's no other information. Try
              re-running. Sorry.
            </AlertDescription>
          </Alert>
        );
      }

      switch (resultFinished.reason) {
        case DockerJobFinishedReason.Cancelled:
          return (
            <Alert status="info">
              <AlertIcon />
              <AlertTitle>Cancelled</AlertTitle>
            </Alert>
          );
        case DockerJobFinishedReason.Error:
          const errorBlobOrString: ErrorObject | string | undefined =
            resultFinished?.result?.error;

          return (
            <VStack w="100%">
              <Alert status="error">
                <AlertIcon />
                <AlertTitle>Failed</AlertTitle>
              </Alert>

              <Alert status="error">
                <AlertDescription>
                  {(errorBlobOrString as ErrorObject)?.statusCode ? (
                    <UnorderedList>
                      <ListItem>{`Exit code: ${
                        (errorBlobOrString as ErrorObject)?.statusCode
                      }`}</ListItem>
                      {(errorBlobOrString as ErrorObject)?.json?.message ? (
                        <ListItem>
                          {(errorBlobOrString as ErrorObject)?.json?.message}
                        </ListItem>
                      ) : null}
                    </UnorderedList>
                  ) : (
                    <Text> {errorBlobOrString as string}</Text>
                  )}
                </AlertDescription>
              </Alert>
            </VStack>
          );
        case DockerJobFinishedReason.Success:
          return (
            <Alert
              status={
                resultFinished?.result?.StatusCode === 0 ? "success" : "warning"
              }
            >
              <AlertIcon />
              <AlertTitle>Exit code:</AlertTitle>
              {resultFinished?.result?.StatusCode}
            </Alert>
          );
        case DockerJobFinishedReason.TimedOut:
          return (
            <Alert status="warning">
              <AlertIcon />
              <AlertTitle>Timed out</AlertTitle>
              Are you allowing enough time for your job to finish?
            </Alert>
          );
        case DockerJobFinishedReason.WorkerLost:
          return (
            <Alert status="warning">
              <AlertIcon />
              Lost connection with the worker running your job, waiting to
              re-queue/@.
            </Alert>
          );
      }
    case DockerJobState.Queued:
    case DockerJobState.ReQueued:
      return (
        <Alert status="warning">
          <AlertTitle>
            &nbsp;&nbsp;&nbsp;{state} (total workers: {workersTotal})
          </AlertTitle>
        </Alert>
      );
    case DockerJobState.Running:
      return (
        <Alert status="warning">
          <CircularProgress size="20px" isIndeterminate color="grey" />
          <AlertTitle>
            &nbsp;&nbsp;&nbsp;{state} (total workers: {workersTotal})
          </AlertTitle>
        </Alert>
      );
  }
};
