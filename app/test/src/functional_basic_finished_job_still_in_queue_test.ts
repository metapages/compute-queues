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

    await (async () => {
      const jobs = await queueJobs(QUEUE_ID);
      if (jobs) {
        for (const [jobId, job] of Object.entries(jobs)) {
          if (job.state !== DockerJobState.Finished) {
            await cancelJobOnQueue({
              queue: QUEUE_ID,
              jobId,
              namespace: "*",
              message: "from-functional-basic-finished-job-still-in-queue-test",
            });
          }
        }
      }
    })();

    const definition = {
      image: "alpine:3.18.5",
      // ensure job is new
      command: `sleep 1.${Math.floor(Math.random() * 100000)}`,
    };

    const { message, jobId /* , stageChange */ } = await createNewContainerJobMessage({
      definition,
    });

    const timeoutInterval = setTimeout(async () => {
      const jobs = await queueJobs(QUEUE_ID);
      console.log(`${getJobColorizedString(jobId)} 👺 test timed out: `, jobs[jobId]);
      throw "Test timed out";
    }, 10000);

    await open(socket);

    // submit all the jobs
    await open(socket);
    socket.send(JSON.stringify(message));

    // now wait for it to finish properly
    while (true) {
      const jobs = await queueJobs(QUEUE_ID);

      const job = jobs[jobId];

      // if (job) {
      //   console.log(
      //     `${getJobColorizedString(jobId)} waiting for job results: ${
      //       job.state === DockerJobState.Finished ? job.finishedReason : job.state
      //     }`,
      //   );
      // } else {
      //   console.log(`${getJobColorizedString(jobId)} waiting for job results: no job found`);
      // }

      // check the job is finished
      if (job?.state && job.state === DockerJobState.Finished) {
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
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);
    closeKv();
  },
);
