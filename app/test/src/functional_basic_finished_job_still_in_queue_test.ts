import humanizeDuration from "humanize-duration";
import { assertEquals } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  createNewContainerJobMessage,
  DockerJobFinishedReason,
  DockerJobState,
  fetchRobust,
  getJobColorizedString,
  MAX_TIME_FINISHED_JOB_IN_QUEUE,
  type StateChangeValueFinished,
} from "@metapages/compute-queues-shared";

import { queueJobs } from "./util.ts";

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
      console.log(`${getJobColorizedString(jobId)} Test timed out: 👺 job: `, jobs[jobId]);
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
      if (job) {
        console.log(
          `${getJobColorizedString(jobId)} waiting for job results: ${
            job.state === DockerJobState.Finished ? job.finishedReason : job.state
          }`,
        );
      } else {
        console.log(`${getJobColorizedString(jobId)} waiting for job results: no job found`);
      }

      // if (jobs[jobId]) {
      //   console.log(`👺 jobs[jobId]: `, jobs[jobId]);
      // }
      // check the job is finished
      if (jobs[jobId]?.state && jobs[jobId].state === DockerJobState.Finished) {
        const { data: finishedState }: { data: StateChangeValueFinished } =
          await (await fetch(`${API_URL}/q/${QUEUE_ID}/j/${jobId}/result.json`, { redirect: "follow" }))
            .json();

        assertEquals(
          jobs[jobId].finishedReason,
          DockerJobFinishedReason.Success,
          `Job finishedState not a success? ${JSON.stringify(finishedState)}`,
        );
        assertEquals(finishedState?.result?.StatusCode, 0);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    clearTimeout(timeoutInterval);

    socket.close();
    await closed(socket);
  },
);
