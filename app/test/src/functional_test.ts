import { assert, assertEquals } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  type BroadcastJobStates,
  createNewContainerJobMessage,
  DockerJobFinishedReason,
  DockerJobState,
  type StateChangeValueFinished,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "@metapages/compute-queues-shared";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

Deno.test(
  "pretend to be a client: submit job and get expected results",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    // https://github.com/metapages/compute-queues/issues/124
    await createNewContainerJobMessage({
      definition: {
        image: "alpine:3.18.5",
        command: "sleep 3",
      },
    });

    const definition = {
      image: "alpine:3.18.5",
      command: "ls -a",
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

    // Workaround for https://github.com/metapages/compute-queues/issues/124
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

Deno.test(
  "submit multiple jobs from the same client source: older jobs are killed",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );
    const count = 3;
    const definitions = Array.from(Array(count).keys()).map((i: number) => ({
      image: "alpine:3.18.5",
      // The earlier jobs can run for ages since they will actually be killed,
      // while the last job will replace them so can finished quickly.
      command: `sh -c "echo ${Math.random()}; sleep ${
        i + 1 < count ? "20" : "5"
      }"`,
    }));

    const namespace = `test-${Math.random()}`;
    const jobIdsSubmissionOrder: string[] = [];
    const jobIdsToBeKilled: Set<string> = new Set();
    let jobIdToSupercedeAllPrior: string = "";
    const jobIdsFinishReason = new Map<string, string>();

    const messages = await Promise.all(
      definitions.map(async (definition, i) => {
        const message = await createNewContainerJobMessage({
          definition,
          // https://github.com/metapages/compute-queues/issues/144
          namespace,
          control: {
            // https://github.com/metapages/compute-queues/issues/144
            userspace: namespace,
          },
        });
        jobIdsSubmissionOrder.push(message.jobId);
        if (i + 1 < count) {
          jobIdsToBeKilled.add(message.jobId);
        } else {
          jobIdToSupercedeAllPrior = message.jobId;
        }
        return message;
      }),
    );

    assertEquals(jobIdsToBeKilled.size, count - 1);
    assert(!!jobIdToSupercedeAllPrior);

    const promiseEnd = Promise.withResolvers<string>();

    const getJobStateString = (jobsBroadcast: BroadcastJobStates): string => {
      const jobStates = [...jobIdsToBeKilled].map((jobId) => {
        const jobState = jobsBroadcast.state.jobs[jobId];
        return `[${jobId.substring(0, 4)}: ${jobState?.state} ${
          jobState?.state === DockerJobState.Finished
            ? (jobState.value as StateChangeValueFinished).reason
            : ""
        }]`;
      }).join("\n");
      return `supreme: [${jobIdToSupercedeAllPrior.substring(0, 4)}: ${
        jobsBroadcast.state.jobs[jobIdToSupercedeAllPrior]?.state
      }], to die: ${jobStates}`;
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

          // const jobStates = [...jobIdsToBeKilled].map((jobId) => {
          //   const jobState = someJobsPayload.state.jobs[jobId];
          //   return `[${jobId.substring(0, 4)}: ${jobState?.state} ${
          //     jobState?.state === DockerJobState.Finished
          //       ? (jobState.value as StateChangeValueFinished).reason
          //       : ""
          //   }]`;
          // }).join("\n");
          // console.log(
          //   `supreme: [${jobIdToSupercedeAllPrior.substring(0, 4)}: ${
          //     someJobsPayload.state.jobs[jobIdToSupercedeAllPrior]?.state
          //   }], to die: ${jobStates}`,
          // );

          // All jobs except the last one should be killed/Finished
          // TBH we don't care about the state of the last job, as long as
          // it's queued/running
          const jobsToBeKilledAreActually = new Set<string>();
          const jobsToBeKilledFinishedForOtherReasons = new Set<string>();
          jobIdsToBeKilled.forEach((jobId) => {
            const jobState = someJobsPayload.state.jobs[jobId];
            if (jobState?.state === DockerJobState.Finished) {
              jobIdsFinishReason.set(
                jobId,
                (jobState.value as StateChangeValueFinished).reason,
              );
              const finishedState = jobState.value as StateChangeValueFinished;
              if (
                finishedState.reason ===
                  DockerJobFinishedReason.JobReplacedByClient
              ) {
                jobsToBeKilledAreActually.add(jobId);
              } else {
                jobsToBeKilledFinishedForOtherReasons.add(jobId);
              }
            }
          });

          const finalJobIsQueuedOrRunning =
            someJobsPayload.state.jobs[jobIdToSupercedeAllPrior]?.state ===
              DockerJobState.Queued ||
            someJobsPayload.state.jobs[jobIdToSupercedeAllPrior]?.state ===
              DockerJobState.Running;
          if (
            jobsToBeKilledAreActually.size === jobIdsToBeKilled.size &&
            finalJobIsQueuedOrRunning
          ) {
            promiseEnd.resolve("done");
          }

          if (jobIdsFinishReason.size === count) {
            promiseEnd.reject(
              new Error(
                "Jobs finished not the correct reasons: " +
                  [...jobIdsFinishReason.entries()].map(([key, value]) =>
                    `${key.substring(0, 6)}=${value}`
                  ).join(", "),
              ),
            );
            promiseEnd.resolve("done");
          }

          if (jobsToBeKilledFinishedForOtherReasons.size > 0) {
            promiseEnd.reject(
              new Error(
                "jobsToBeKilledFinishedForOtherReasons.size > 0: " +
                  getJobStateString(someJobsPayload),
              ),
            );
          }

          break;
        }
        default:
          //ignored
      }
    };

    await open(socket);
    for (const { message } of messages) {
      // create a delay to simulate a slow client
      await new Promise((resolve) => setTimeout(resolve, 1500));
      socket.send(JSON.stringify(message));
    }

    await promiseEnd.promise;

    assertEquals(true, true);

    socket.close();
    await closed(socket);
  },
);
