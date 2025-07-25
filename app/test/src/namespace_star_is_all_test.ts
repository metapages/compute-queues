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
import { closeKv } from "../../shared/src/shared/kv.ts";

Deno.test(
  "submit the same job with different namespaces: then cancel the job with * namespace, all namespaces+job are cancelled",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/q/${QUEUE_ID}/client`,
    );

    const namespaces = [...new Array(3)].map(() => `namespace-${Math.floor(Math.random() * 1000000)}`);
    const namespacesSet = new Set(namespaces);
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

    const jobId = messages[0].jobId;
    assertEquals(jobId, messages[1].jobId);
    assertEquals(jobId, messages[2].jobId);

    let testPhase = "pre-submit-check";
    const timeoutInterval = setTimeout(async () => {
      await Promise.all(
        Array.from(namespaces).map((namespace) =>
          cancelJobOnQueue({
            queue: QUEUE_ID,
            jobId,
            namespace,
            message: "from-namespace-star-is-all-timeout",
          })
        ),
      );

      throw `Test timed out at phase: ${testPhase}`;
    }, 6000);

    // submit all the jobs
    await open(socket);
    for (const messagePayload of messages) {
      socket.send(JSON.stringify(messagePayload.message));
    }

    let namespacesOnQueue: string[] | undefined;

    // first ensure that the namespaces are set
    while (true) {
      const jobs = await queueJobs(QUEUE_ID);
      if (jobs) {
        namespacesOnQueue = jobs[jobId]?.namespaces || [];
        if (equal(new Set(namespacesOnQueue), namespacesSet)) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // now cancel with * namespace, all jobs (on this queue)should be cancelled
    // then cancel the last job
    const stateChange: StateChange = {
      job: messages[0].jobId,
      tag: "api",
      state: DockerJobState.Finished,
      value: {
        type: DockerJobState.Finished,
        reason: DockerJobFinishedReason.Cancelled,
        time: Date.now(),
        namespace: "*",
        message: "Job cancelled test operation with * namespace",
      },
    };

    const msg: WebsocketMessageClientToServer = {
      type: WebsocketMessageTypeClientToServer.StateChange,
      payload: stateChange,
    };
    socket.send(JSON.stringify(msg));

    testPhase = "pre-namespace-check";
    while (true) {
      const jobs = await queueJobs(QUEUE_ID);
      if (jobs) {
        namespacesOnQueue = jobs[jobId]?.namespaces || [];
        if (equal(namespacesOnQueue, [])) {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    assertEquals(namespacesOnQueue, []);

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);
    closeKv();

    await Promise.all(
      Array.from(namespaces).map((namespace) =>
        cancelJobOnQueue({
          queue: QUEUE_ID,
          jobId,
          namespace,
          message: "from-namespace-star-is-all",
        })
      ),
    );
  },
);
