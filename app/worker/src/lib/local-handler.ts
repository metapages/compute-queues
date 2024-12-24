import { type Context, Hono } from "hono";
import { serveStatic } from "hono/middleware";
import {
  DockerJobState,
  type JobStates,
} from "@metapages/compute-queues-shared";
import { createHandler } from "metapages/worker/routing/handlerDeno";

import {
  BaseDockerJobQueue,
  userJobQueues,
} from "@metapages/compute-queues-shared";

export class LocalDockerJobQueue extends BaseDockerJobQueue {
  constructor(opts: { serverId: string; address: string }) {
    super(opts);
  }
}

const jobList: JobStates = { jobs: {} };
const app = new Hono();

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

app.get("/health", (c: Context) => c.text("OK"));

app.get("/metrics", () => {
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

app.get("/:queue/status", (c) => {
  const queue = c.req.param("queue");
  if (!queue) {
    c.status(400);
    return c.text("Missing queue");
  }
  return c.json({ queue: jobList });
});

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

app.get("/*", serveStatic({ root: "../browser/dist" }));
app.get("/", serveStatic({ path: "../browser/dist/index.html" }));
app.get("*", serveStatic({ path: "../browser/dist/index.html" }));

const handleWebsocket = async (socket: WebSocket, request: Request) => {
  const url = new URL(request.url);
  const pathTokens = url.pathname.split("/").filter((x) => x !== "");
  const queue = pathTokens[0];
  const type = pathTokens[1];

  if (!queue) {
    console.log("No queue key, closing socket");
    socket.close();
    return;
  }

  // Initialize queue if it doesn't exist
  if (!userJobQueues[queue]) {
    userJobQueues[queue] = new LocalDockerJobQueue({
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
    console.log("Unknown type, closing socket");
    socket.close();
    return;
  }
};

export const localHandler = createHandler(
  app.fetch as () => Promise<
    | Response
    | undefined
  >,
  handleWebsocket,
);
