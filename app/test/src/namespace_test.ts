import {
  assert,
  assertEquals,
  assertGreater,
  assertGreaterOrEqual,
} from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  type BroadcastJobStates,
  createNewContainerJobMessage,
  DockerJobState,
  type JobMessagePayload,
  type StateChangeValueFinished,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeClientToServer,
  WebsocketMessageTypeServerBroadcast,
} from "@metapages/compute-queues-shared";
import {
  API_URL,
  jobExists,
  killAllJobs,
  killJobOnQueue,
  QUEUE_ID,
  queuedOrRunningJobIds,
  TotalWorkerCpus,
} from "./util.ts";

Deno.test(
  "submit multiple jobs from the same namespace: previous RUNNING jobs are removed and replaced",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    await killAllJobs(QUEUE_ID);

    const jobTime = 30;
    const timeoutInterval = setTimeout(() => {
      throw "Test timed out";
    }, (jobTime - 1) * 1000);
    const count = Math.max(TotalWorkerCpus - 1, 2); // the worker has 2 cpu slots, so both jobs can be running at the same time
    assertGreaterOrEqual(count, 2);
    const definitions = Array.from(Array(count).keys()).map((_: number) => ({
      image: "alpine:3.18.5",
      // none of these jobs will finished, we are only testing replacement on the queue
      command: `sh -c "echo ${Math.random()}; sleep ${jobTime}"`,
    }));

    const namespace = `namespace-${Math.floor(Math.random() * 1000000)}`;
    const jobIdsSubmissionOrder: string[] = [];
    const jobIdsToBeKilled: Set<string> = new Set();
    let jobIdToSupercedeAllPrior: string = "";

    const messages: JobMessagePayload[] = await Promise.all(
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

    console.log("jobIdsToBeKilled", JSON.stringify(jobIdsToBeKilled));

    assertEquals(jobIdsToBeKilled.size, count - 1);
    assert(!!jobIdToSupercedeAllPrior);

    // const promiseEnd = Promise.withResolvers<string>();

    let onlyAllowedJobRunning = false;

    // socket.onmessage = (message: MessageEvent) => {
    //   const messageString = message.data.toString();
    //   const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
    //     messageString,
    //   );
    //   switch (possibleMessage.type) {
    //     case WebsocketMessageTypeServerBroadcast.JobStates: {
    //       const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
    //       if (!someJobsPayload) {
    //         break;
    //       }

    //       // check that the desired job is on the queue and all other jobs are finished
    //       const desiredJobOnQueue = !!someJobsPayload.state
    //         .jobs[jobIdToSupercedeAllPrior];
    //       const otherJobsNotPresentOrFinished =
    //         [...jobIdsToBeKilled].filter((jobId) => {
    //           const jobState = someJobsPayload.state.jobs[jobId];
    //           return !jobState || jobState.state === DockerJobState.Finished;
    //         }).length === (count - 1);

    //       if (desiredJobOnQueue && otherJobsNotPresentOrFinished) {
    //         onlyAllowedJobRunning = true;
    //         promiseEnd.resolve("done");
    //       }

    //       break;
    //     }
    //     default:
    //       //ignored
    //   }
    // };

    // const pollInterval = setInterval(() => {
    //   if (onlyAllowedJobRunning) {
    //     clearInterval(pollInterval);
    //     return;
    //   }
    //   // query again
    //   socket.send(
    //     JSON.stringify({
    //       type: WebsocketMessageTypeClientToServer.QueryJobStates,
    //     }),
    //   );
    // }, 1000);

    await open(socket);
    for (const messagePayload of messages) {
      // create a delay to simulate a slow client
      // await new Promise((resolve) => setTimeout(resolve, 2000));
      socket.send(JSON.stringify(messagePayload.message));
      // await new Promise((resolve) => setTimeout(resolve, 200));
      // assert that all jobs are in the db
      const exists = await jobExists(messagePayload.jobId);
      if (!exists) {
        throw `job ${messagePayload.jobId} not found in db`;
      }
    }

    // begin the polling
    // socket.send(
    //   JSON.stringify({
    //     type: WebsocketMessageTypeClientToServer.QueryJobStates,
    //   }),
    // );

    // this promise tests that only the last job is in the set of
    // queued or running jobs send via the websocket
    // await promiseEnd.promise;
    // clearInterval(pollInterval);

    // this tests that only the last job is in the set of
    // queued or running jobs send via the a request (not websocket)

    while (!onlyAllowedJobRunning) {
      const activeJobIds = await queuedOrRunningJobIds(QUEUE_ID);
      // console.log("activeJobIds", activeJobIds);
      if (activeJobIds.has(jobIdToSupercedeAllPrior)) {
        let count = 0;
        jobIdsToBeKilled.forEach((jobIdToBeKilled) => {
          if (activeJobIds.has(jobIdToBeKilled)) {
            count++;
          }
        });
        if (count === 0) {
          onlyAllowedJobRunning = true;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // assertEquals(activeJobIds.has(jobIdToSupercedeAllPrior), true);

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);
  },
);

// Deno.test(
//   "submit multiple jobs from the same namespace: previous QUEUED jobs are removed and replaced",
//   async () => {
//     const socket = new WebSocket(
//       `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
//     );
//     const count = 3;
//     const definitions = Array.from(Array(count).keys()).map((i: number) => ({
//       image: "alpine:3.18.5",
//       // The earlier jobs can run for ages since they will actually be killed,
//       // while the last job will replace them so can finished quickly.
//       command: `sh -c "echo ${Math.random()}; sleep ${
//         i + 1 < count ? "20" : "5"
//       }"`,
//     }));

//     const namespace = `test-${Math.random()}`;
//     const jobIdsSubmissionOrder: string[] = [];
//     const jobIdsToBeKilled: Set<string> = new Set();
//     let jobIdToSupercedeAllPrior: string = "";

//     const messages: JobMessagePayload[] = await Promise.all(
//       definitions.map(async (definition, i) => {
//         const message = await createNewContainerJobMessage({
//           definition,
//           // https://github.com/metapages/compute-queues/issues/144
//           namespace,
//           control: {
//             // https://github.com/metapages/compute-queues/issues/144
//             userspace: namespace,
//           },
//         });
//         jobIdsSubmissionOrder.push(message.jobId);
//         if (i + 1 < count) {
//           jobIdsToBeKilled.add(message.jobId);
//         } else {
//           jobIdToSupercedeAllPrior = message.jobId;
//         }
//         return message;
//       }),
//     );

//     assertEquals(jobIdsToBeKilled.size, count - 1);
//     assert(!!jobIdToSupercedeAllPrior);

//     const promiseEnd = Promise.withResolvers<string>();

//     let onlyAllowedJobRunning = false;

//     socket.onmessage = (message: MessageEvent) => {
//       const messageString = message.data.toString();
//       const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
//         messageString,
//       );
//       switch (possibleMessage.type) {
//         case WebsocketMessageTypeServerBroadcast.JobStates: {
//           const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
//           if (!someJobsPayload) {
//             break;
//           }

//           // check that the desired job is on the queue and all other jobs are finished
//           const desiredJobOnQueue = !!someJobsPayload.state
//             .jobs[jobIdToSupercedeAllPrior];
//           const otherJobsNotPresentOrFinished =
//             [...jobIdsToBeKilled].filter((jobId) => {
//               const jobState = someJobsPayload.state.jobs[jobId];
//               return !jobState || jobState.state === DockerJobState.Finished;
//             }).length === (count - 1);

//           if (desiredJobOnQueue && otherJobsNotPresentOrFinished) {
//             onlyAllowedJobRunning = true;
//             promiseEnd.resolve("done");
//           }

//           break;
//         }
//         default:
//           //ignored
//       }
//     };

//     const pollInterval = setInterval(() => {
//       if (onlyAllowedJobRunning) {
//         clearInterval(pollInterval);
//         return;
//       }
//       // query again
//       socket.send(
//         JSON.stringify({
//           type: WebsocketMessageTypeClientToServer.QueryJobStates,
//         }),
//       );
//     }, 1000);

//     await open(socket);
//     for (const messagePayload of messages) {
//       // create a delay to simulate a slow client
//       await new Promise((resolve) => setTimeout(resolve, 2000));
//       socket.send(JSON.stringify(messagePayload.message));
//       await new Promise((resolve) => setTimeout(resolve, 200));
//       // assert that all jobs are in the db
//       const exists = await jobExists(messagePayload.jobId);
//       if (!exists) {
//         throw `job ${messagePayload.jobId} not found in db`;
//       }
//     }

//     // begin the polling
//     socket.send(
//       JSON.stringify({
//         type: WebsocketMessageTypeClientToServer.QueryJobStates,
//       }),
//     );

//     // this promise tests that only the last job is in the set of
//     // queued or running jobs send via the websocket
//     await promiseEnd.promise;
//     clearInterval(pollInterval);
//     // this tests that only the last job is in the set of
//     // queued or running jobs send via the a request (not websocket)
//     const activeJobIds = await queuedOrRunningJobIds(QUEUE_ID);
//     assertEquals(activeJobIds.has(jobIdToSupercedeAllPrior), true);

//     socket.close();
//     await closed(socket);
//   },
// );

// const setsEqual = (a: Set<string>, b: Set<string>) =>
//   a.size === b.size && [...a].every((x) => b.has(x));
