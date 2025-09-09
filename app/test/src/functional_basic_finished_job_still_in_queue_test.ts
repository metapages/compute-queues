import humanizeDuration from "humanize-duration";
import { assertEquals } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  createNewContainerJobMessage,
  DockerJobFinishedReason,
  DockerJobState,
  fetchRobust,
  getJobColorizedString,
  type InMemoryDockerJob,
  MAX_TIME_FINISHED_JOB_IN_QUEUE,
} from "@metapages/compute-queues-shared";

import { cancelJobOnQueue, queueJobs } from "./util.ts";
import { closeKv } from "../../shared/src/shared/kv.ts";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

const fetch = fetchRobust;

Deno.test(
  `submit job, job finishes, but it is visible in the queue for ${humanizeDuration(MAX_TIME_FINISHED_JOB_IN_QUEUE)}`,
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    const jobs = await queueJobs(QUEUE_ID);
    if (jobs) {
      for (const [jobId, job] of Object.entries(jobs)) {
        console.log(`cancelling job ${getJobColorizedString(jobId)} 👺 job state: ${job.state}`);
        // Cancel all jobs, including finished ones, to ensure clean state
        await cancelJobOnQueue({
          queue: QUEUE_ID,
          jobId,
          namespace: "*",
          message: "from-functional-basic-finished-job-still-in-queue-test",
        });
      }
    }

    // Wait a moment for cleanup to process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const definition = {
      image: "alpine:3.18.5",
      // ensure job is new
      command: `sleep 1.${Math.floor(Math.random() * 100000)}`,
    };

    const { message, jobId /* , stageChange */ } = await createNewContainerJobMessage({
      definition,
    });

    let timeoutOccurred = false;
    const timeoutInterval = setTimeout(() => {
      timeoutOccurred = true;
      console.log(`⏰ ${getJobColorizedString(jobId)} 👺 test timed out: undefined`);
      throw new Error(`Test timed out after 15 seconds. Job ${jobId} not found or not finished.`);
    }, 15000);

    await open(socket);

    // submit all the jobs
    socket.send(JSON.stringify(message));

    let iterationCount = 0;
    // const startTime = Date.now();

    // now wait for it to finish properly
    while (true) {
      if (timeoutOccurred) {
        break;
      }

      iterationCount++;
      const jobs = await queueJobs(QUEUE_ID);
      const job = jobs[jobId];
      // const elapsed = Date.now() - startTime;

      // console.log(
      //   `🔄 Iteration ${iterationCount} (${elapsed}ms elapsed):`,
      //   `   🔍 Our job ${getJobColorizedString(jobId)}:`,
      //   job ? `${job.state} (${job.finishedReason || "N/A"})` : "NOT FOUND",
      // );

      // check the job is finished
      if (job?.state && job.state === DockerJobState.Finished) {
        try {
          const { data: finishedState }: { data: InMemoryDockerJob } =
            await (await fetch(`${API_URL}/q/${QUEUE_ID}/j/${jobId}/result.json`, { redirect: "follow" }))
              .json();

          assertEquals(
            jobs[jobId].finishedReason,
            DockerJobFinishedReason.Success,
            `Job finishedState not a success? ${JSON.stringify(finishedState)}`,
          );
          assertEquals(finishedState?.finished?.result?.StatusCode, 0);
          break;
        } catch (error) {
          throw error;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);

    closeKv();
  },
);
