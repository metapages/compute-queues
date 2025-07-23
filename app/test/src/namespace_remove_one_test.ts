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

Deno.test(
  "submit the same job with different namespaces: then cancel one job+namespace, remaining namespaces are still on the queue",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/q/${QUEUE_ID}/client`,
    );

    const namespaces = [...new Array(3)].map(() => `namespace-${Math.floor(Math.random() * 1000000)}`);

    // none of these jobs will finished, we are only testing replacement on the queue
    const command = `sleep 3.${Math.floor(Math.random() * 1000000)}`;

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

    let testPhase = "pre-submit";

    const namespacesAllSet = new Set(namespaces);
    const namespaceToRemove = namespaces.pop();
    const namespacesRemainingSet = new Set(namespaces);

    const jobId = messages[0].jobId;
    assertEquals(jobId, messages[1].jobId);
    assertEquals(jobId, messages[2].jobId);

    const timeoutInterval = setTimeout(async () => {
      const jobs = await queueJobs(QUEUE_ID);
      console.log(
        `Test timed out during phase: ${testPhase}: 👺 namespaceToRemove=${namespaceToRemove} namespacesAllSet: ${[
          ...namespacesAllSet,
        ]} job:`,
        jobs[jobId],
      );

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
      throw `Test timed out at phase: ${testPhase}`;
    }, 15000);

    // submit all the jobs
    await open(socket);
    for (const messagePayload of messages) {
      socket.send(JSON.stringify(messagePayload.message));
    }

    testPhase = "post-submit";

    let namespacesOnQueue: string[] | undefined;

    // first ensure that the namespaces are set
    while (true) {
      const jobs = await queueJobs(QUEUE_ID);
      if (jobs) {
        namespacesOnQueue = jobs[jobId]?.namespaces || [];
        // console.log(`${getJobColorizedString(jobId)} namespaceToRemove`, namespaceToRemove);
        // console.log(`${getJobColorizedString(jobId)} namespacesAllSet`, namespacesAllSet);
        // console.log(`${getJobColorizedString(jobId)} namespacesOnQueue`, namespacesOnQueue);
        if (equal([...new Set(namespacesOnQueue)].toSorted(), [...namespacesAllSet].toSorted())) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
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

    testPhase = "post-cancel";

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

        if (equal([...new Set(namespacesOnQueue)].toSorted(), [...namespacesRemainingSet].toSorted())) {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assertEquals(new Set(namespacesOnQueue), namespacesRemainingSet);

    // testPhase = "post-cancel-wait-for-finished";
    // // now wait for it to finish properly
    // namespacesOnQueue = undefined;
    // while (true) {
    //   const jobs = await queueJobs(QUEUE_ID);
    //   // check the job is finished
    //   if (jobs[jobId]?.state && jobs[jobId].state === DockerJobState.Finished) {
    //     // console.log(`${getJobColorizedString(jobId)}:  finished`, jobs[jobId].state);
    //     namespacesOnQueue = jobs[jobId]?.namespaces;
    //     if (equal([...new Set(namespacesOnQueue)].toSorted(), [...namespacesRemainingSet].toSorted())) {
    //       assertEquals(jobs[jobId].finishedReason, DockerJobFinishedReason.Success);
    //       const { data: finishedState }: { data: StateChangeValueFinished } =
    //         await (await fetch(`${API_URL}/q/${QUEUE_ID}/j/${jobId}/result.json`, { redirect: "follow" }))
    //           .json();
    //       assertEquals(finishedState?.result?.StatusCode, 0);
    //       break;
    //     }
    //   }

    //   await new Promise((resolve) => setTimeout(resolve, 100));
    // }
    // assertEquals([...new Set(namespacesOnQueue)].toSorted(), [...namespacesRemainingSet].toSorted());

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
