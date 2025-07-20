import { assertEquals, equal } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  createNewContainerJobMessage,
  DockerJobFinishedReason,
  DockerJobState,
  fetchRobust,
  type JobMessagePayload,
  type StateChange,
  type StateChangeValueFinished,
  type WebsocketMessageClientToServer,
  WebsocketMessageTypeClientToServer,
} from "@metapages/compute-queues-shared";

import { API_URL, cancelJobOnQueue, QUEUE_ID, queueJobs } from "./util.ts";

const fetch = fetchRobust;

Deno.test(
  "submit the same job with different namespaces: then cancel one job+namespace, remaining namespaces are still on the queue",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/q/${QUEUE_ID}/client`,
    );

    const namespaces = [...new Array(3)].map(() => `namespace-${Math.floor(Math.random() * 1000000)}`);

    // none of these jobs will finished, we are only testing replacement on the queue
    const command = `sleep 6.${Math.floor(Math.random() * 1000000)}`;

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
            message: "from-namespace-remove-one-timeout-timeout",
          })
        ),
      );
      throw "Test timed out";
    }, 10000);

    const namespacesAllSet = new Set(namespaces);
    const namespaceToRemove = namespaces.pop();
    const namespacesRemainingSet = new Set(namespaces);

    const jobId = messages[0].jobId;
    assertEquals(jobId, messages[1].jobId);
    assertEquals(jobId, messages[2].jobId);

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
        // console.log(`${getJobColorizedString(jobId)} namespacesAllSet`, namespacesAllSet);
        // console.log(`${getJobColorizedString(jobId)} namespaceToRemove`, namespaceToRemove);
        // console.log(`${getJobColorizedString(jobId)} namespacesOnQueue`, namespacesOnQueue);
        if (equal(new Set(namespacesOnQueue), namespacesAllSet)) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // now cancel with one namespace, job should have the remaining namespaces
    socket.send(JSON.stringify({
      type: WebsocketMessageTypeClientToServer.StateChange,
      payload: {
        job: messages[0].jobId,
        tag: "api",
        state: DockerJobState.Finished,
        value: {
          type: DockerJobState.Finished,
          reason: DockerJobFinishedReason.Cancelled,
          time: Date.now(),
          namespace: namespaceToRemove,
          message: "Job cancelled test operation",
        },
      } as StateChange,
    } as WebsocketMessageClientToServer));

    while (true) {
      const jobs = await queueJobs(QUEUE_ID);
      if (jobs) {
        namespacesOnQueue = jobs[jobId]?.namespaces;
        // check the job is running or queued, not cancelled
        // console.log(`${getJobColorizedString(jobId)} namespacesAllSet`, namespacesAllSet);
        // console.log(`${getJobColorizedString(jobId)} namespaceToRemove`, namespaceToRemove);
        // console.log(`${getJobColorizedString(jobId)} namespacesOnQueue`, namespacesOnQueue);
        if (!(jobs[jobId].state === DockerJobState.Running || jobs[jobId].state === DockerJobState.Queued)) {
          assertEquals(jobs[jobId].state, DockerJobState.Running);
          assertEquals(jobs[jobId].state, DockerJobState.Queued);
        }

        if (equal(new Set(namespacesOnQueue), namespacesRemainingSet)) {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assertEquals(new Set(namespacesOnQueue), namespacesRemainingSet);

    // now wait for it to finish properly
    namespacesOnQueue = undefined;
    while (true) {
      const jobs = await queueJobs(QUEUE_ID);
      // check the job is finished
      if (jobs[jobId]?.state && jobs[jobId].state === DockerJobState.Finished) {
        // console.log(`${getJobColorizedString(jobId)}:  finished`, jobs[jobId].state);
        namespacesOnQueue = jobs[jobId]?.namespaces;
        if (equal(new Set(namespacesOnQueue), namespacesRemainingSet)) {
          assertEquals(jobs[jobId].finishedReason, DockerJobFinishedReason.Success);
          const { data: finishedState }: { data: StateChangeValueFinished } =
            await (await fetch(`${API_URL}/q/${QUEUE_ID}/j/${jobId}/result.json`, { redirect: "follow" }))
              .json();
          assertEquals(finishedState?.result?.StatusCode, 0);
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assertEquals(new Set(namespacesOnQueue), namespacesRemainingSet);

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);

    await Promise.all(
      Array.from(messages).map((message) =>
        cancelJobOnQueue({
          queue: QUEUE_ID,
          jobId: message.jobId,
          namespace: message?.queuedJob?.enqueued?.control?.namespace,
          message: "from-namespace-remove-one",
        })
      ),
    );
  },
);
