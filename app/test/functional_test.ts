import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { closed, open } from "@korkje/wsi";

import {
  BroadcastJobStates,
  DockerJobFinishedReason,
  DockerJobState,
  StateChangeValueFinished,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "../shared/src/mod.ts";
import { createNewContainerJobMessage } from "../shared/src/shared/jobtools.ts";

const API_URL = Deno.env.get("API_URL") || "http://api1:8081";
// console.log('API_URL', API_URL);

Deno.test(
  "pretend to be a client: submit job and get expected results",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/local1/client`,
    );

    const definition = {
      image: "alpine:3.18.5",
      command: "ls -a",
    };
    const { message, jobId, stageChange } = await createNewContainerJobMessage({
      definition,
    });

    let {
      promise: jobCompleteDeferred,
      resolve,
      reject,
    } = Promise.withResolvers<string>();

    socket.onmessage = (message: MessageEvent) => {
      const messageString = message.data.toString();
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
        messageString,
      );
      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            break;
          }
          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            break;
          }
          if (jobState.state === DockerJobState.Finished) {
            const finishedState = jobState.value as StateChangeValueFinished;
            const lines: string = finishedState.result?.logs?.map((l) =>
              l[0]
            )[0]!;
            resolve(lines);
          }
          break;
        default:
          //ignored
      }
    };

    console.log(`opening the socket to the API server...`);
    await open(socket);
    // console.log(`...socket opened. Sending message...`, message);
    socket.send(JSON.stringify(message));

    console.log(`...awaiting job to finish`);
    const result = await jobCompleteDeferred;
    assertEquals(
      result,
      ".\n..\n.dockerenv\nbin\ndev\netc\nhome\ninputs\njob-cache\nlib\nmedia\nmnt\nopt\noutputs\nproc\nroot\nrun\nsbin\nsrv\nsys\ntmp\nusr\nvar\n",
    );

    socket.close();
    await closed(socket);
  },
);

Deno.test(
  "submit multiple jobs and get expected results",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/local1/client`,
    );
    const count = 3;
    const definitions = Array.from(Array(count).keys()).map((i) => ({
      image: "alpine:3.18.5",
      command: `echo ${Math.random()}`,
    }));

    const jobIds = new Set<string>();
    const jobIdsFinished = new Set<string>();

    const messages = await Promise.all(definitions.map(async (definition) => {
      const message = await createNewContainerJobMessage({
        definition,
      });
      jobIds.add(message.jobId);
      return message;
    }));

    const promises = messages.map((_) => (Promise.withResolvers<string>()));

    socket.onmessage = (message: MessageEvent) => {
      const messageString = message.data.toString();
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
        messageString,
      );
      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            break;
          }
          jobIds.forEach((jobId) => {
            const jobState = someJobsPayload.state.jobs[jobId];
            if (!jobState) {
              return;
            }
            if (jobState.state === DockerJobState.Finished) {
              const finishedState = jobState.value as StateChangeValueFinished;
              const lines: string = finishedState.result?.logs?.map((l) =>
                l[0]
              )[0]!;
              const i = messages.findIndex((m) => m.jobId === jobId);
              if (i >= 0 && lines && !jobIdsFinished.has(jobId)) {
                promises[i]?.resolve(lines.trim());
                console.log(
                  `🐸 [test] 📡 job ${jobId} finished ${jobIdsFinished.size} / ${count}`,
                );
                jobIdsFinished.add(jobId);
              }
            }
          });
          break;
        default:
          //ignored
      }
    };

    // console.log(`opening the socket to the API server...`)
    await open(socket);
    // console.log(`...socket opened. Sending messages...`);
    for (const { message } of messages) {
      socket.send(JSON.stringify(message));
    }

    // console.log(`...awaiting jobs to finish`);
    const results = await Promise.all(promises.map((p) => p.promise));
    results.forEach((result, i: number) => {
      assertEquals(result, definitions[i].command.replace("echo ", ""));
    });

    socket.close();
    await closed(socket);
  },
);

Deno.test(
  "submit multiple jobs from the same client source: older jobs are killed",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/local1/client`,
    );
    const count = 3;
    const definitions = Array.from(Array(count).keys()).map((i) => ({
      image: "alpine:3.18.5",
      command: `sh -c "echo ${Math.random()}; sleep 3"`,
    }));

    const source = `test-${Math.random()}`;
    const jobIdsSubmissionOrder: string[] = [];
    const jobIdsFinishReason = new Map<string, string>();

    const messages = await Promise.all(definitions.map(async (definition) => {
      const message = await createNewContainerJobMessage({
        definition,
        source,
      });
      jobIdsSubmissionOrder.push(message.jobId);
      return message;
    }));

    const promiseEnd = Promise.withResolvers<string>();

    socket.onmessage = (message: MessageEvent) => {
      const messageString = message.data.toString();
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
        messageString,
      );
      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            break;
          }
          jobIdsSubmissionOrder.forEach((jobId) => {
            if (jobIdsFinishReason.has(jobId)) {
              return;
            }
            const jobState = someJobsPayload.state.jobs[jobId];
            if (!jobState) {
              return;
            }
            if (jobState.state === DockerJobState.Finished) {
              const finishedState = jobState.value as StateChangeValueFinished;
              jobIdsFinishReason.set(jobId, finishedState.reason);
              if (jobIdsFinishReason.size === count) {
                promiseEnd.resolve("done");
              }
            }
          });
          break;
        default:
          //ignored
      }
    };

    await open(socket);
    for (const { message } of messages) {
      // create a delay to simulate a slow client
      await new Promise((resolve) => setTimeout(resolve, 1000));
      socket.send(JSON.stringify(message));
    }

    await promiseEnd.promise;

    jobIdsSubmissionOrder.forEach((jobId, i) => {
      if (i === jobIdsSubmissionOrder.length - 1) {
        assertEquals(
          jobIdsFinishReason.get(jobId),
          DockerJobFinishedReason.Success,
        );
      } else {
        assertEquals(
          jobIdsFinishReason.get(jobId),
          DockerJobFinishedReason.JobReplacedByClient,
        );
      }
    });

    assertEquals(true, true);

    socket.close();
    await closed(socket);
  },
);
