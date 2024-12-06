import { Context } from 'https://deno.land/x/hono@v4.1.0-rc.1/mod.ts';

import { statusHandler } from '../routes/status.ts';
import { DockerJobState } from '../shared/mod.ts';
import { userJobQueues } from '../docker-jobs/ApiDockerJobQueue.ts';

export const metricsHandler = async (c: Context) => {
  const statusResponse = await statusHandler(c);

  // If response isn't success code or 404 (which we treat as empty queue), return it as is
  if (c.res.status < 200 || c.res.status >= 300 && c.res.status !== 404) {
    console.error(`Failed to get status, got: ${statusResponse.status} instead`);
    return statusResponse;
  }

  let unfinishedJobs;
  let unfinishedQueueLength;

  try {
    const responseData = await statusResponse.json();

    if (!responseData.jobs) {
      console.debug("Treating a null queue as a queue with no jobs");
      unfinishedQueueLength = 0;
    } else {
      unfinishedJobs = Object.values(responseData.jobs as Record<string, { state: DockerJobState }>)
        .filter((job) => job.state !== DockerJobState.Finished);
      unfinishedQueueLength = unfinishedJobs.length;
    }

    // Simple Prometheus-compatible metric response
    const response = `
# HELP queue_length The number of outstanding jobs in the queue
# TYPE queue_length gauge
queue_length ${unfinishedQueueLength}
`;

    return new Response(response, {
      status: 200,
      headers: {
        "content-type": "text/plain",
      },
    });
  } catch (e) {
    console.error(`Error processing jobs data for metrics: ${e}`);
    return new Response("Error processing jobs data for metrics", { status: 500 });
  }
};
