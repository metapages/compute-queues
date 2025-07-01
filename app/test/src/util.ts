export const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
export const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

export const FakeJobImageSleepPrefix = "fakejob:";

// check against the --cpus=2 flag for the workers
export const TotalWorkerCpus = QUEUE_ID === "local" ? 2 : 4;

export const jobExists = async (jobId: string): Promise<boolean> => {
  const url = `${API_URL}/job/${jobId}`;
  const response = await fetch(url);
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
): Promise<boolean> => {
  const url = `${API_URL}/${queue}/job/${jobId}/cancel`;
  const response = await fetch(url, { method: "POST" });
  if (response.status === 404 || !response.ok) {
    response?.body?.cancel();
    return true;
  }
  response?.body?.cancel();
  return true;
};

export const killAllJobs = async (queue: string) => {
  // remove any existing jobs from the queue
  let existingJobIds = await queuedOrRunningJobIds(queue);
  while (existingJobIds.size > 0) {
    for (const exitingJobId of existingJobIds) {
      await killJobOnQueue(queue, exitingJobId);
    }
    existingJobIds = await queuedOrRunningJobIds(queue);
  }
};

export const queuedOrRunningJobIds = async (
  queue: string,
): Promise<Set<string>> => {
  const result = new Set<string>();
  const url = `${API_URL}/${queue}/jobs`;
  const response = await fetch(url);
  if (!response.ok) {
    response?.body?.cancel();
    throw new Error(
      `Error fetching queued or running job ids: ${response.statusText}`,
    );
  }
  const { success, error, jobIds } = await response.json();
  if (!success) {
    throw new Error(`Error fetching queued or running job ids: ${error}`);
  }
  jobIds.forEach((jobId: string) => result.add(jobId));
  return result;
};
