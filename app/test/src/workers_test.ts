import { assert, assertEquals } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  type BroadcastJobStates,
  createNewContainerJobMessage,
  DockerJobState,
  type StateChangeValueFinished,
  type StateChangeValueRunning,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "@metapages/compute-queues-shared";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

Deno.test(
  "submit a job: verify worker state transitions and completion",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    const outputText = `Job completed by worker ${
      Math.floor(Math.random() * 1000000)
    }`;
    // Create a simple job that should work reliably
    const definition = {
      image: "alpine:3.18.5",
      command: `echo '${outputText}'`,
    };
    const { message, jobId } = await createNewContainerJobMessage({
      definition,
    });

    const {
      promise: jobCompleteDeferred,
      resolve,
      // reject,
    } = Promise.withResolvers<{
      result: string;
      finalWorker: string;
      stateTransitions: Array<{ state: DockerJobState; worker?: string }>;
    }>();

    let jobSuccessfullySubmitted = false;
    let stateTransitions: Array<{ state: DockerJobState; worker?: string }> =
      [];
    let finalWorker = "";

    socket.onmessage = (message: MessageEvent) => {
      const messageString = message.data.toString();
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
        messageString,
      );
      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates: {
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            break;
          }

          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            break;
          }

          jobSuccessfullySubmitted = true;

          // Track state transitions
          const worker = jobState.state === DockerJobState.Running
            ? (jobState.value as StateChangeValueRunning)?.worker
            : jobState.state === DockerJobState.Finished
            ? (jobState.value as StateChangeValueFinished)?.worker
            : undefined;

          // remove previous state transitions that are the same
          // state, this is likely from a different worker
          stateTransitions = stateTransitions.filter((s) => {
            return s.state !== jobState.state;
          });

          stateTransitions.push({
            state: jobState.state,
            worker,
          });

          if (jobState.state === DockerJobState.Finished) {
            const finishedState = jobState.value as StateChangeValueFinished;
            const lines: string = finishedState.result?.logs?.map(
              (l) => l[0],
            )[0]!;
            finalWorker = finishedState.worker || "";
            resolve({
              result: lines,
              finalWorker,
              stateTransitions,
            });
          }
          break;
        }
        default:
          //ignored
      }
    };

    await open(socket);

    // Submit the job
    while (!jobSuccessfullySubmitted) {
      socket.send(JSON.stringify(message));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Wait for job to complete
    const result = await jobCompleteDeferred;

    // Verify the job completed successfully
    assertEquals(
      result.result.trim(),
      outputText.trim(),
    );

    // Verify that the job went through the expected state transitions
    assert(
      stateTransitions.length >= 2,
      "Should have at least Queued and Finished states",
    );

    // Should start with Queued state
    assertEquals(stateTransitions[0].state, DockerJobState.Queued);

    // Should have a Running state with a worker
    const runningState = stateTransitions.find((s) =>
      s.state === DockerJobState.Running
    );
    assert(runningState, "Should have a Running state");
    assert(runningState.worker, "Running state should have a worker");

    // Should end with Finished state
    assertEquals(
      stateTransitions[stateTransitions.length - 1].state,
      DockerJobState.Finished,
    );

    // Verify that the job state shows the correct worker information
    // The job should have been claimed by one worker and finished by that same worker
    const finishedState = stateTransitions.find((s) =>
      s.state === DockerJobState.Finished
    );
    assert(finishedState?.worker, "Finished state should have a worker");
    assertEquals(
      finishedState.worker,
      result.finalWorker,
      "Final worker should match the worker in finished state",
    );

    // Verify that the same worker that started the job also finished it
    // (in a single-worker environment, this should always be true)
    assertEquals(
      runningState.worker,
      result.finalWorker,
      "The worker that started the job should be the same one that finished it",
    );

    socket.close();
    await closed(socket);
  },
);
