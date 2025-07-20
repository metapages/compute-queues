import { assert, assertEquals, assertGreaterOrEqual } from "std/assert";

import { closed, open } from "@korkje/wsi";
import { createNewContainerJobMessage, DockerJobState, type JobMessagePayload } from "@metapages/compute-queues-shared";

import { API_URL, cancelJobOnQueue, QUEUE_ID, queuedOrRunningJobIds, queueJobs, TotalWorkerCpus } from "./util.ts";

Deno.test(
  "submit multiple jobs from the same namespace: previous RUNNING jobs are removed and replaced",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/q/${QUEUE_ID}/client`,
    );

    const jobTime = 30;

    const timeoutInterval = setTimeout(async () => {
      await Promise.all(
        Array.from(messages).map((message) =>
          cancelJobOnQueue({
            queue: QUEUE_ID,
            jobId: message.jobId,
            namespace: message?.queuedJob?.enqueued?.control?.namespace,
            message: "from-namespace-replacements-timeout",
          })
        ),
      );
      throw "Test timed out";
    }, (jobTime - 1) * 1000);
    const count = Math.max(TotalWorkerCpus - 1, 2); // the worker has 2 cpu slots, so both jobs can be running at the same time
    assertGreaterOrEqual(count, 2);
    const definitions = Array.from(Array(count).keys()).map((_: number) => ({
      image: "alpine:3.18.5",
      // none of these jobs will finished, we are only testing replacement on the queue
      command: `sleep ${jobTime}.${Math.floor(Math.random() * 1000000)}`,
    }));

    const namespace = `namespace-${Math.floor(Math.random() * 1000000)}`;
    const jobIdsSubmissionOrder: string[] = [];
    const jobIdsToBeKilled: Set<string> = new Set();
    const jobIdsAll: Set<string> = new Set();
    let jobIdToSupercedeAllPrior: string = "";

    const now = Date.now();

    const messages: JobMessagePayload[] = await Promise.all(
      definitions.map(async (definition, i) => {
        const message = await createNewContainerJobMessage({
          definition,
          control: {
            // https://github.com/metapages/compute-queues/issues/144
            namespace,
          },
        });
        jobIdsAll.add(message.jobId);
        message.stageChange.value.time = now + i * 1000;
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

    let onlyAllowedJobRunning = false;

    await open(socket);
    for (const messagePayload of messages) {
      socket.send(JSON.stringify(messagePayload.message));
      // delay to ensure the jobs are queued in order
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    while (!onlyAllowedJobRunning) {
      let jobs = await queueJobs(QUEUE_ID);
      jobs = Object.fromEntries(Object.entries(jobs).filter(([jobId, _]) => jobIdsAll.has(jobId)));

      if (
        jobs[jobIdToSupercedeAllPrior]?.state === DockerJobState.Running ||
        jobs[jobIdToSupercedeAllPrior]?.state === DockerJobState.Queued
      ) {
        // allowed job is running or queued, but the other jobs should be cancelled or equivalent
        // onlyAllowedJobRunning = true;
        let allOtherJobsFinished = true;
        for (const jobId of jobIdsToBeKilled) {
          if (jobs[jobId]?.state !== DockerJobState.Finished) {
            allOtherJobsFinished = false;
            break;
          }
        }
        onlyAllowedJobRunning = allOtherJobsFinished;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);

    await Promise.all(
      Array.from(messages).map((message) =>
        cancelJobOnQueue({
          queue: QUEUE_ID,
          jobId: message.jobId,
          namespace: message?.queuedJob?.enqueued?.control?.namespace,
          message: "from-namespace-replacements",
        })
      ),
    );
  },
);

Deno.test(
  "submit multiple jobs from the same namespace: previous QUEUED jobs are removed and replaced",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    const jobTime = 30;

    const count = TotalWorkerCpus + 2; // the worker has 2 cpu slots, so both jobs can be running at the same time
    assertGreaterOrEqual(count, 2);
    const definitions = Array.from(Array(count).keys()).map((_: number) => ({
      image: "alpine:3.18.5",
      // none of these jobs will finished, we are only testing replacement on the queue
      command: `sleep ${jobTime}.${Math.floor(Math.random() * 1000000)}`,
    }));

    const namespace = `namespace-${Math.floor(Math.random() * 1000000)}`;
    const jobIdsSubmissionOrder: string[] = [];
    const jobIdsToBeKilled: Set<string> = new Set();
    let jobIdToSupercedeAllPrior: string = "";

    const messages: JobMessagePayload[] = await Promise.all(
      definitions.map(async (definition, i) => {
        const message = await createNewContainerJobMessage({
          definition,
          control: {
            // https://github.com/metapages/compute-queues/issues/144
            namespace,
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

    const timeoutInterval = setTimeout(async () => {
      await Promise.all(
        Array.from(messages).map((message) =>
          cancelJobOnQueue({
            queue: QUEUE_ID,
            jobId: message.jobId,
            namespace: message?.queuedJob?.enqueued?.control?.namespace,
            message: "from-namespace-replacements-timeout",
          })
        ),
      );
      throw "Test timed out";
    }, (jobTime - 1) * 1000);

    assertEquals(jobIdsToBeKilled.size, count - 1);
    assert(!!jobIdToSupercedeAllPrior);

    let onlyAllowedJobRunning = false;

    await open(socket);
    for (const messagePayload of messages) {
      socket.send(JSON.stringify(messagePayload.message));
      // assert that all jobs are in the db
      // const exists = await jobExists(messagePayload.jobId);
      // if (!exists) {
      //   throw `job ${messagePayload.jobId} not found in db`;
      // }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    while (!onlyAllowedJobRunning) {
      const activeJobIds = await queuedOrRunningJobIds(QUEUE_ID);
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
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);

    await Promise.all(
      Array.from(messages).map((message) =>
        cancelJobOnQueue({
          queue: QUEUE_ID,
          jobId: message.jobId,
          namespace: message?.queuedJob?.enqueued?.control?.namespace,
          message: "from-namespace-replacements",
        })
      ),
    );
  },
);
