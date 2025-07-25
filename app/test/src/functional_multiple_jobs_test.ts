import { assertEquals, assertExists } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  type BroadcastJobStates,
  createNewContainerJobMessage,
  DockerJobFinishedReason,
  DockerJobState,
  fetchRobust,
  getJobColorizedString,
  type InMemoryDockerJob,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "@metapages/compute-queues-shared";

import { cancelJobOnQueue } from "./util.ts";
import { closeKv } from "../../shared/src/shared/kv.ts";

const fetch = fetchRobust;

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

Deno.test("submit multiple jobs and get expected results", async () => {
  const socket = new WebSocket(
    `${API_URL.replace("http", "ws")}/q/${QUEUE_ID}/client`,
  );

  const count = 3;
  const definitions = Array.from(Array(count).keys()).map((_i) => ({
    image: "alpine:3.18.5",
    command: `echo ${Math.random()}`,
  }));

  const jobIds = new Set<string>();
  const jobIdsFinished = new Set<string>();

  const messages = await Promise.all(
    definitions.map(async (definition) => {
      const message = await createNewContainerJobMessage({
        definition,
      });
      jobIds.add(message.jobId);
      return message;
    }),
  );

  const promises = messages.map((_) => Promise.withResolvers<string>());

  const jobsSuccessfullySubmitted = new Set<string>();

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

        // we only care about our jobs
        jobIds.forEach(async (jobId) => {
          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            return;
          }

          jobsSuccessfullySubmitted.add(jobId);

          if (jobIdsFinished.has(jobId)) {
            return;
          }

          if (jobState.state === DockerJobState.Finished) {
            // console.log(`${getJobColorizedString(jobId)}:  finished`, jobState);
            jobIdsFinished.add(jobId);
            assertEquals(
              jobState.finishedReason,
              DockerJobFinishedReason.Success,
              `${getJobColorizedString(jobId)} failed to be successfully finished: ${
                JSON.stringify(jobState, null, 2)
              }`,
            );
            const { data: finishedState }: { data: InMemoryDockerJob } =
              await (await fetch(`${API_URL}/q/${QUEUE_ID}/j/${jobId}/result.json`))
                .json();
            // console.log(`${getJobColorizedString(jobId)}:  finishedState`, finishedState);
            assertExists(finishedState);
            assertEquals(finishedState?.finished?.result?.StatusCode, 0);
            const lines: string = finishedState?.finished?.result?.logs?.map(
              (l) => l[0],
            ).join("").trim()!;
            const i = messages.findIndex((m) => m.jobId === jobId);
            if (i >= 0 && lines) {
              promises[i]?.resolve(lines);
            }
          }
        });
        break;
      }
      default:
        //ignored
    }
  };

  await open(socket);

  while (jobsSuccessfullySubmitted.size < count) {
    for (const { message } of messages) {
      socket.send(JSON.stringify(message));
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const results = await Promise.all(promises.map((p) => p.promise));
  results.forEach((result, i: number) => {
    assertEquals(result, definitions[i].command.replace("echo ", ""));
  });

  socket.close();
  await closed(socket);
  closeKv();

  await Promise.all(
    Array.from(jobIds).map((jobId) =>
      cancelJobOnQueue({
        queue: QUEUE_ID,
        jobId,
        message: "from-submit-multiple-jobs",
      })
    ),
  );
});
