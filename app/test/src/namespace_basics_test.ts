import { assertEquals, equal } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  createNewContainerJobMessage,
  DockerJobFinishedReason,
  DockerJobState,
  type JobMessagePayload,
  type StateChange,
  type WebsocketMessageClientToServer,
  WebsocketMessageTypeClientToServer,
} from "@metapages/compute-queues-shared";

import { API_URL, cancelJobOnQueue, QUEUE_ID, queueJobs } from "./util.ts";

// Deno.test(
//   "submit the same job from multiple namespaces: the job from the db shows the namespaces",
//   async () => {
//     await killAllJobs(QUEUE_ID);
//     const socket = new WebSocket(
//       `${API_URL.replace("http", "ws")}/q/${QUEUE_ID}/client`,
//     );

//     const timeoutInterval = setTimeout(() => {
//       throw "Test timed out";
//     }, 10000);

//     const namespaces = [...new Array(3)].map(() => `namespace-${Math.floor(Math.random() * 1000000)}`);
//     const namespacesSet = new Set(namespaces);
//     // none of these jobs will finished, we are only testing replacement on the queue
//     const command = `sleep 30.${Math.floor(Math.random() * 1000000)}`;

//     const messages: JobMessagePayload[] = await Promise.all(
//       namespaces.map(async (namespace) => {
//         const message = await createNewContainerJobMessage({
//           definition: {
//             image: "alpine:3.18.5",

//             command,
//           },
//           control: {
//             namespace,
//           },
//         });
//         return message;
//       }),
//     );

//     const jobId = messages[0].jobId;
//     assertEquals(jobId, messages[1].jobId);
//     assertEquals(jobId, messages[2].jobId);

//     await open(socket);
//     for (const messagePayload of messages) {
//       socket.send(JSON.stringify(messagePayload.message));
//     }

//     let namespacesOnQueue: Set<string> = new Set();
//     while (true) {
//       const jobs = await queueJobs(QUEUE_ID);
//       if (jobs) {
//         namespacesOnQueue = new Set(jobs[jobId]?.namespaces || []);
//         if (equal(namespacesOnQueue, namespacesSet)) {
//           break;
//         }
//       }
//       await new Promise((resolve) => setTimeout(resolve, 1000));
//     }

//     assertEquals(namespacesOnQueue, namespacesSet);

//     clearTimeout(timeoutInterval);

//     socket.close();
//     await closed(socket);
//   },
// );

Deno.test(
  "submit the same job from multiple namespaces: then set one cancelled, the namespace should be removed",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/q/${QUEUE_ID}/client`,
    );

    const namespaces = [...new Array(3)].map(() => `namespace-${Math.floor(Math.random() * 1000000)}`);
    const namespaceToKeep = [...namespaces];
    const namespaceToCancel = namespaceToKeep.pop();

    const namespaceToKeepSet = new Set(namespaceToKeep);
    // none of these jobs will finished, we are only testing replacement on the queue
    const command = `sleep 30.${Math.floor(Math.random() * 1000000)}`;

    const messages: JobMessagePayload[] = await Promise.all(
      namespaces.map(async (namespace) => {
        const message = await createNewContainerJobMessage({
          definition: {
            image: "alpine:3.18.5",
            command,
          },
          control: {
            namespace,
          },
        });
        return message;
      }),
    );

    const timeoutInterval = setTimeout(async () => {
      await Promise.all(
        Array.from(messages).map((message) =>
          cancelJobOnQueue({
            queue: QUEUE_ID,
            jobId: message.jobId,
            namespace: message?.queuedJob?.enqueued?.control?.namespace,
            message: "from-namespace-basics-timeout",
          })
        ),
      );
      throw "Test timed out";
    }, 10000);

    assertEquals(messages[0].jobId, messages[1].jobId);
    assertEquals(messages[1].jobId, messages[2].jobId);
    const jobId = messages[messages.length - 1].jobId;

    await open(socket);
    for (const messagePayload of messages) {
      socket.send(JSON.stringify(messagePayload.message));
    }

    // then cancel the last job
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
          namespace: namespaceToCancel,
          message: "Job cancelled test operation",
        },
      } as StateChange,
    } as WebsocketMessageClientToServer));

    let namespacesOnQueue: Set<string> = new Set();
    while (true) {
      const jobs = await queueJobs(QUEUE_ID);
      if (jobs) {
        namespacesOnQueue = new Set(jobs[jobId]?.namespaces || []);
        if (equal(namespacesOnQueue, namespaceToKeepSet)) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    assertEquals(namespacesOnQueue, namespaceToKeepSet);

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);

    await Promise.all(
      Array.from(messages).map((message) =>
        cancelJobOnQueue({
          queue: QUEUE_ID,
          jobId: message.jobId,
          namespace: message?.queuedJob?.enqueued?.control?.namespace,
          message: "from-namespace-basics",
        })
      ),
    );
  },
);
