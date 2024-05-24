import { useServerState } from '/@/hooks/serverStateHook';
import {
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  StateChangeValueWorkerFinished,
} from '/@/shared';

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
  Spacer,
  UnorderedList,
  VStack,
} from '@chakra-ui/react';
import { useHashParam } from '@metapages/hash-query';

import { ButtonCancelOrRetry } from '../ButtonCancelOrRetry';
import { PanelJobInputFromUrlParams } from './PanelJobInputFromUrlParams';

export const PanelJob: React.FC<{
  job: DockerJobDefinitionRow | undefined;
}> = ({ job }) => {
  const [queue] = useHashParam("queue");
  return (
    <Box maxW="100%" p={2}>
      <HStack spacing="24px" alignItems="flex-start">
        <PanelJobInputFromUrlParams />

        <VStack width="100%" alignItems="flex-start">
          <Heading size="sm">Job status and control</Heading>
          <br />
          <br />
          <VStack
            borderWidth="1px"
            p={4}
            borderRadius="lg"
            width="100%"
            alignItems="flex-start"
          >
            <HStack width="100%">
              <ButtonCancelOrRetry job={job} />
              <Spacer />

              <Box>{job?.hash ? `id: ${job?.hash}` : null}</Box>
            </HStack>
            <HStack width="100%" height="100%">
            {!queue || queue === "" ? null : (

              <JobStatusDisplay job={job} />

          )}
            </HStack>


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
  const serverState = useServerState();
  console.log('serverState', serverState);

  if (!job) {
    return (
      <Alert status="error">
        <AlertIcon />
        No job definition. Click edit
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
          const errorBlob:
            | { statusCode: number; json: { message: string } }
            | undefined = resultFinished?.result?.error;

          console.error(errorBlob)
          return (
            <>
              <Alert status="error">
                <AlertIcon />
                <AlertTitle>Failed</AlertTitle>
              </Alert>

              <Alert status="error">
                <AlertDescription>
                  <UnorderedList>
                    {errorBlob?.statusCode ? (
                      <ListItem>{`Exit code: ${errorBlob?.statusCode}`}</ListItem>
                    ) : null}

                    {errorBlob?.json?.message ? (
                      <ListItem>{errorBlob?.json?.message}</ListItem>
                    ) : null}
                  </UnorderedList>
                </AlertDescription>
              </Alert>
            </>
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
            &nbsp;&nbsp;&nbsp;{state} (total workers:{" "}
            {serverState?.state?.workers
              ? serverState?.state?.workers.length
              : 0}
            )
          </AlertTitle>
        </Alert>
      );
    case DockerJobState.Running:
      return (
        <Alert status="warning">
          <CircularProgress size="20px" isIndeterminate color="grey" />
          <AlertTitle>
            &nbsp;&nbsp;&nbsp;{state} (total workers:{" "}
            {serverState?.state?.workers
              ? serverState?.state?.workers.length
              : 0}
            )
          </AlertTitle>
        </Alert>
      );
  }
};
