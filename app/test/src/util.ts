import { delay } from "std/async/delay";

import { fetchRobust, getJobColorizedString, type InMemoryDockerJob } from "@metapages/compute-queues-shared";

import { DefaultNamespace, DockerJobState } from "../../shared/src/shared/types.ts";

const fetch = fetchRobust;

export const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
export const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

// check against the --cpus=2 flag for the workers
export const TotalWorkerCpus = QUEUE_ID === "local" ? 2 : 4;

export const jobExists = async (jobId: string): Promise<boolean> => {
  const url = `${API_URL}/j/${jobId}/exists`;
  const response = await fetch(url, { redirect: "follow" });
  if (response.status === 404 || !response.ok) {
    response?.body?.cancel();
    return true;
  }
  response?.body?.cancel();
  return true;
};

export const killJobOnQueue = async (
  queue: string,
  jobId: string,
  message?: string,
): Promise<void> => {
  // console.log(
  //   `${getQueueColorizedString(queue)} ${
  //     getJobColorizedString(jobId)
  //   } ☠️☠️☠️☠️☠️ [test] killJobOnQueue : message: ${message}`,
  // );
  const url = `${API_URL}/q/${queue}/j/${jobId}/cancel?namespace=*&message=${message}`;
  const response = await fetch(url, { method: "POST" });
  // console.log(`${getQueueColorizedString(queue)} ${getJobColorizedString(jobId)} response.status=${response.status}`);
  if (response.status === 404 || !response.ok) {
    // console.log(`🐸 [test] 🔥 killJobOnQueue ${queue} ${jobId} failed: ${response.statusText}`);
    await response?.body?.cancel();
    return;
  }

  await response?.body?.cancel();
};

export const cancelJobOnQueue = async (args: {
  queue: string;
  jobId: string;
  namespace?: string;
  message?: string;
}): Promise<void> => {
  const { queue, jobId, namespace, message } = args;
  // console.log(
  //   `${getQueueColorizedString(queue)} ${
  //     getJobColorizedString(jobId)
  //   } ☠️☠️☠️☠️☠️ [test] cancelJobOnQueue : message: ${message}`,
  // );
  const urlBlob = new URL(`${API_URL}/q/${queue}/j/${jobId}/cancel`);
  if (namespace && namespace !== DefaultNamespace) {
    urlBlob.searchParams.set("namespace", namespace);
  }
  if (message) {
    urlBlob.searchParams.set("message", message);
  }
  const response = await fetch(urlBlob.href, { method: "POST" });
  // console.log(`${getQueueColorizedString(queue)} ${getJobColorizedString(jobId)} response.status=${response.status}`);
  // if (response.status === 404 || !response.ok) {
  //   console.log(`🐸 [test] 🔥 cancelJobOnQueue ${queue} ${jobId} failed: ${response.statusText}`);
  // }

  await response?.body?.cancel();
};

export const killAllJobs = async (queue: string, message?: string) => {
  // remove any existing jobs from the queue
  while (true) {
    const jobs = await queueJobs(queue);
    // console.log(
    //   "🐸💀  [test] 🔥 killing jobs, existingJobIds" +
    //     Object.keys(jobs).filter((jobId) =>
    //       jobs[jobId].state === DockerJobState.Queued || jobs[jobId].state === DockerJobState.Running
    //     ).map((j) => getJobColorizedString(j)).join(", "),
    // );
    let runningJobs = false;
    for (const [jobId, job] of Object.entries(jobs)) {
      if (
        job.state === DockerJobState.Queued || job.state === DockerJobState.Running
      ) {
        runningJobs = true;
        console.log(`🐸💀 ${getJobColorizedString(jobId)} [test] 🔥 killJobOnQueue`);
        await killJobOnQueue(queue, jobId, message);
      }
    }
    if (!runningJobs) {
      break;
    }
    await delay(500);
  }
  // console.log("🐸💀 [test] 🔥 killing jobs, done ✅✅✅✅✅✅");
  // await delay(1000);
};

export const queuedOrRunningJobIds = async (
  queue: string,
): Promise<Set<string>> => {
  const data: Record<string, InMemoryDockerJob> = await queueJobs(
    queue,
    new Set([DockerJobState.Queued, DockerJobState.Running]),
  );

  return new Set(
    Object.entries(data)
      .filter((v) => v[1].state === DockerJobState.Queued || v[1].state === DockerJobState.Running)
      .map((v) => v[0]),
  );
};

export const queueJobs = async (
  queue: string,
  filter?: Set<DockerJobState>,
): Promise<Record<string, InMemoryDockerJob>> => {
  const url = `${API_URL}/q/${queue}`;
  const response = await fetch(url);
  if (!response.ok) {
    response?.body?.cancel();
    throw new Error(
      `Error fetching queued or running job ids: ${response.statusText}`,
    );
  }
  const { data }: { data: Record<string, InMemoryDockerJob> } = await response.json();
  if (filter) {
    return Object.fromEntries(
      Object.entries(data || {}).filter((v) => filter.has(v[1].state)),
    );
  }
  return data || {};
};
