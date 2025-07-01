import { assert, assertEquals, assertGreaterOrEqual } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  createNewContainerJobMessage,
  FakeJobImageSleepPrefix,
  type JobMessagePayload,
} from "@metapages/compute-queues-shared";
import {
  API_URL,
  jobExists,
  killAllJobs,
  QUEUE_ID,
  queuedOrRunningJobIds,
  TotalWorkerCpus,
} from "./util.ts";

Deno.test(
  "submit multiple jobs from the same namespace: previous RUNNING jobs are removed and replaced",
  async () => {
    await killAllJobs(QUEUE_ID);
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    const jobTime = 30;
    const timeoutInterval = setTimeout(() => {
      throw "Test timed out";
    }, (jobTime - 1) * 1000);
    const count = Math.max(TotalWorkerCpus - 1, 2); // the worker has 2 cpu slots, so both jobs can be running at the same time
    assertGreaterOrEqual(count, 2);
    const definitions = Array.from(Array(count).keys()).map((_: number) => ({
      image: "alpine:3.18.5",
      // image: FakeJobImageSleepPrefix + jobTime,
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

    assertEquals(jobIdsToBeKilled.size, count - 1);
    assert(!!jobIdToSupercedeAllPrior);

    let onlyAllowedJobRunning = false;

    await open(socket);
    for (const messagePayload of messages) {
      socket.send(JSON.stringify(messagePayload.message));
      // assert that all jobs are in the db
      const exists = await jobExists(messagePayload.jobId);
      if (!exists) {
        throw `job ${messagePayload.jobId} not found in db`;
      }
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);
  },
);

Deno.test(
  "submit multiple jobs from the same namespace: previous QUEUED jobs are removed and replaced",
  async () => {
    await killAllJobs(QUEUE_ID);
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    const jobTime = 30;
    const timeoutInterval = setTimeout(() => {
      throw "Test timed out";
    }, (jobTime - 1) * 1000);
    const count = TotalWorkerCpus + 2; // the worker has 2 cpu slots, so both jobs can be running at the same time
    assertGreaterOrEqual(count, 2);
    const definitions = Array.from(Array(count).keys()).map((_: number) => ({
      image: "alpine:3.18.5",
      // image: FakeJobImageSleepPrefix + jobTime,
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

    assertEquals(jobIdsToBeKilled.size, count - 1);
    assert(!!jobIdToSupercedeAllPrior);

    let onlyAllowedJobRunning = false;

    await open(socket);
    for (const messagePayload of messages) {
      socket.send(JSON.stringify(messagePayload.message));
      // assert that all jobs are in the db
      const exists = await jobExists(messagePayload.jobId);
      if (!exists) {
        throw `job ${messagePayload.jobId} not found in db`;
      }
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);
  },
);
