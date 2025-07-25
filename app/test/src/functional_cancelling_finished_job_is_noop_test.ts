import { closed, open } from "@korkje/wsi";
import {
  type BroadcastJobStates,
  createNewContainerJobMessage,
  DockerJobFinishedReason,
  DockerJobState,
  type StateChange,
  type WebsocketMessageClientToServer,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeClientToServer,
  WebsocketMessageTypeServerBroadcast,
} from "@metapages/compute-queues-shared";
import { closeKv } from "../../shared/src/shared/kv.ts";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

Deno.test(
  "submit job, allow to finish with success, then cancel, cancel has no effect",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    const definition = {
      image: "alpine:3.18.5",
      command: `echo ${Math.floor(Math.random() * 10000)}`,
    };

    const { message, jobId /* , stageChange */ } = await createNewContainerJobMessage({
      definition,
    });

    const {
      promise: jobCompleteDeferred,
      resolve,
      /* reject, */
    } = Promise.withResolvers<void>();

    let jobSuccessfullySubmitted = false;
    let jobFinishedSuccessfully = false;
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
          if (jobState.state === DockerJobState.Finished) {
            if (jobState.finishedReason === DockerJobFinishedReason.Success) {
              jobFinishedSuccessfully = true;
              resolve();
            }

            if (jobState.finishedReason === DockerJobFinishedReason.Cancelled) {
              throw new Error(`Job should not be cancelled jobFinishedSuccessfully=${jobFinishedSuccessfully}`);
            }
          }
          break;
        }
        default:
          //ignored
      }
    };

    await open(socket);

    // Job submisison should confirm the job is submitted.
    // Browser clients kinda do this already by resubmitting if the job is
    // not on the results.
    while (!jobSuccessfullySubmitted) {
      socket.send(JSON.stringify(message));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // finished after this
    await jobCompleteDeferred;

    // now cancel
    socket.send(JSON.stringify({
      type: WebsocketMessageTypeClientToServer.StateChange,
      payload: {
        job: jobId,
        tag: "api",
        state: DockerJobState.Finished,
        value: {
          type: DockerJobState.Finished,
          reason: DockerJobFinishedReason.Cancelled,
          time: Date.now(),
          message: "Job cancelled test operation",
        },
      } as StateChange,
    } as WebsocketMessageClientToServer));

    // allow some time to possibly get a cancellation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // we should NOT see a cancellation

    socket.close();
    await closed(socket);
    closeKv();
  },
);
