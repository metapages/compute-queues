import { assertEquals } from 'std/assert';

import {
  closed,
  open,
} from '@korkje/wsi';
import {
  type BroadcastJobStates,
  createNewContainerJobMessage,
  DockerJobState,
  type StateChangeValueFinished,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from '@metapages/compute-queues-shared';

import { killAllJobs } from './util.ts';

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

Deno.test(
  "pretend to be a client: submit job and get expected results",
  async () => {
    await killAllJobs(QUEUE_ID);
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    const definition = {
      image: "alpine:3.18.5",
      // command: `sh -c 'sleep 1.${Math.floor(Math.random() * 10000)} && ls -a'`,
      command: "ls -a ..",
    };

    const { message, jobId /* , stageChange */ } =
      await createNewContainerJobMessage({
        definition,
      });

    const {
      promise: jobCompleteDeferred,
      resolve,
      /* reject, */
    } = Promise.withResolvers<string>();

    let jobSuccessfullySubmitted = false;
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
            const finishedState = jobState.value as StateChangeValueFinished;
            // console.log("🐸 [test] 📡 job finished", finishedState);
            const lines: string = finishedState.result?.logs?.map(
              (l) => l[0],
            )[0]!;
            resolve(lines);
          }
          break;
        }
        default:
          //ignored
      }
    };

    // console.log(`opening the socket to the API server...`);
    await open(socket);
    // console.log(`...socket opened. Sending message...`, message);

    // Job submisison should confirm the job is submitted.
    // Browser clients kinda do this already by resubmitting if the job is
    // not on the results.
    while (!jobSuccessfullySubmitted) {
      // console.log(`...submitting job...`);
      socket.send(JSON.stringify(message));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // console.log(`...awaiting job to finish`);
    const result = await jobCompleteDeferred;
    assertEquals(
      result,
      ".\n..\n.dockerenv\nbin\ndev\netc\nhome\ninputs\njob-cache\nlib\nmedia\nmnt\nopt\noutputs\nproc\nroot\nrun\nsbin\nsrv\nsys\ntmp\nusr\nvar\n",
    );

    socket.close();
    await closed(socket);
  },
);

Deno.test("submit multiple jobs and get expected results", async () => {
  await killAllJobs(QUEUE_ID);
  const socket = new WebSocket(
    `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
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
        jobIds.forEach((jobId) => {
          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            return;
          }
          if (jobState.state === DockerJobState.Finished) {
            const finishedState = jobState.value as StateChangeValueFinished;
            const lines: string = finishedState.result?.logs?.map(
              (l) => l[0],
            )[0]!;
            const i = messages.findIndex((m) => m.jobId === jobId);
            if (i >= 0 && lines && !jobIdsFinished.has(jobId)) {
              promises[i]?.resolve(lines.trim());
              // console.log(
              //   `🐸 [test] 📡 job ${jobId} finished ${jobIdsFinished.size} / ${count}`,
              // );
              jobIdsFinished.add(jobId);
            }
          }
        });
        break;
      }
      default:
        //ignored
    }
  };
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
        jobIds.forEach((jobId) => {
          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            return;
          }
          if (jobState.state === DockerJobState.Finished) {
            const finishedState = jobState.value as StateChangeValueFinished;
            const lines: string = finishedState.result?.logs?.map(
              (l) => l[0],
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
      }
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
});
