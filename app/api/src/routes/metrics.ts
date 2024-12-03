import { Context } from 'https://deno.land/x/hono@v4.1.0-rc.1/mod.ts';

import { statusHandler } from '../status.ts';
import { DockerJobState } from '../shared/mod.ts';

export const metricsHandler = async (c: Context) => {
  const statusResponse = await statusHandler(c);

  // If response isn't success code, return it as is
  if (c.status() < 200 || c.status() >= 300) {
    return statusResponse;
  }

  const { jobs: jobs } = await statusResponse.json();

  const unfinishedJobs = Object.values(jobs).filter((job) => job.state !== DockerJobState.Finished);
  const unfinishedQueueLength = unfinishedJobs.length;
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
};
