import { DockerJobState, JobStates } from "/@/shared";

const jobList: JobStates = { jobs: {} };

// Create a simple HTTP server
export const localHandler = (req: Request): Response => {
  const url = new URL(req.url);
  // Route the metrics endpoint
  if (url.pathname === "/metrics") {
    const unfinishedJobs = Object.values(jobList.jobs).filter((job) =>
      job.state !== DockerJobState.Finished
    );
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
  }

  // We don't serve anything else
  return new Response("Not Found", { status: 404 });
};
