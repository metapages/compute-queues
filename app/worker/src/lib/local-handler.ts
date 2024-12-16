import { Context, Hono } from "https://deno.land/x/hono@v4.1.0-rc.1/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.1.0-rc.1/middleware/cors/index.ts";
import { serveStatic } from "https://deno.land/x/hono@v4.1.0-rc.1/middleware.ts";
import { DockerJobState, JobStates } from "/@/shared";
import { ApiDockerJobQueue } from "../../../api/src/docker-jobs/ApiDockerJobQueue.ts";

const jobList: JobStates = { jobs: {} };
const app = new Hono();
const userJobQueues: Record<string, ApiDockerJobQueue> = {};

app.use("*", async (c, next) => {
  const req = c.req;
  if (req.method === "OPTIONS") {
    const requestedHeaders = req.header("Access-Control-Request-Headers") ??
      "*";
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", requestedHeaders);
    c.header("Access-Control-Max-Age", "86400");
    c.header("Access-Control-Allow-Credentials", "true");
    return c.text("", 204);
  }
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Credentials", "true");
  await next();
});

app.get("/", (c: Context) => {
  return c.text("HELLO WORLD");
});

// Health check endpoint
app.get("/healthz", (c: Context) => c.text("OK"));

// WebSocket handler
app.get("/:queue/:type", async (c) => {
  const upgrade = c.req.header("upgrade");
  if (!upgrade || upgrade.toLowerCase() !== "websocket") {
    return c.text("Not a websocket request", 400);
  }

  const { response, socket } = Deno.upgradeWebSocket(c.req.raw);
  const queue = c.req.param("queue");
  const type = c.req.param("type");

  if (!queue) {
    socket.close();
    return response;
  }

  // Initialize queue if it doesn't exist
  if (!userJobQueues[queue]) {
    userJobQueues[queue] = new ApiDockerJobQueue({
      serverId: "local",
      address: queue,
    });
    await userJobQueues[queue].setup();
  }

  // Handle client or worker connections
  if (type === "browser" || type === "client") {
    userJobQueues[queue].connectClient({ socket });
  } else if (type === "worker") {
    userJobQueues[queue].connectWorker({ socket }, queue);
  } else {
    socket.close();
  }

  return response;
});

// Metrics endpoint
app.get("/metrics", (c) => {
  const unfinishedJobs = Object.values(jobList.jobs).filter(
    (job) => job.state !== DockerJobState.Finished,
  );
  const unfinishedQueueLength = unfinishedJobs.length;

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
});

// Queue status endpoint
app.get("/:queue/status", (c) => {
  const queue = c.req.param("queue");
  if (!queue) {
    c.status(400);
    return c.text("Missing queue");
  }
  return c.json({ queue: jobList });
});

// Queue metrics endpoint
app.get("/:queue/metrics", (c) => {
  const queue = c.req.param("queue");
  if (!queue) {
    c.status(400);
    return c.text("Missing queue");
  }

  const unfinishedJobs = Object.values(jobList.jobs).filter(
    (job) => job.state !== DockerJobState.Finished,
  );
  const response = `
# HELP queue_length The number of outstanding jobs in the queue
# TYPE queue_length gauge
queue_length ${unfinishedJobs.length}
`;

  return new Response(response, {
    status: 200,
    headers: {
      "content-type": "text/plain",
    },
  });
});

// Serve static assets
app.get("/*", serveStatic({ root: "./assets" }));
app.get("/", serveStatic({ path: "./assets/index.html" }));
app.get("*", serveStatic({ path: "./assets/index.html" }));

// Export the handler
export const localHandler = app.fetch;
