import { type Context, Hono } from "hono";
import { serveStatic } from "hono/middleware";
import {
  DockerJobState,
  type JobStates,
} from "@metapages/compute-queues-shared";
import { createHandler } from "metapages/worker/routing/handlerDeno";
import { ensureDir } from "std/fs";
import { join } from "std/path";

import {
  BaseDockerJobQueue,
  userJobQueues,
} from "@metapages/compute-queues-shared";

const TMPDIR = "/tmp/worker-metapage-io";
const cacheDir = join(TMPDIR, "cache");
await ensureDir(TMPDIR);
await ensureDir(cacheDir);
await Deno.chmod(TMPDIR, 0o777);
await Deno.chmod(cacheDir, 0o777);

export class LocalDockerJobQueue extends BaseDockerJobQueue {
  constructor(opts: { serverId: string; address: string }) {
    super(opts);
  }
}

const jobList: JobStates = { jobs: {} };
const app = new Hono();

const downloadHandler = async (c: Context) => {
  const key: string | undefined = c.req.param("key");

  if (!key) {
    c.status(400);
    return c.text("Missing key");
  }

  const filePath = `${TMPDIR}/cache/${key}`;

  try {
    // Check if the file exists
    const fileInfo = await Deno.stat(filePath);
    if (!fileInfo.isFile) {
      c.status(404);
      return c.text("File not found");
    }

    // Open the file
    const file = await Deno.open(filePath, { read: true });

    // Set headers
    c.header("Content-Disposition", `attachment; filename="${key}"`);
    c.header("Content-Type", "application/octet-stream");
    c.header("Content-Length", fileInfo.size.toString());

    // Create a response with the file's readable stream
    return c.newResponse(file.readable);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      c.status(404);
      return c.text("File not found");
    }
    console.error("Error downloading file:", err);
    return c.text((err as Error).message, 500);
  }
};

const uploadHandler = async (c: Context) => {
  const key: string | undefined = c.req.param("key");

  if (!key) {
    c.status(400);
    return c.text("Missing key");
  }

  const filePath = `${TMPDIR}/cache`;
  const fullFilePath = `${filePath}/${key}`;

  try {
    // Create directory if it doesn't exist
    await Deno.mkdir(filePath, { recursive: true, mode: 0o777 });

    // Get the request body as a ReadableStream
    const stream = c.req.raw.body;
    if (!stream) {
      c.status(400);
      return c.text("No file uploaded");
    }

    // Create a file write stream
    const file = await Deno.open(fullFilePath, {
      write: true,
      create: true,
      truncate: true,
    });

    // Stream the request body directly to the file
    await stream.pipeTo(file.writable);

    return c.text(`file saved to ${fullFilePath}`);
  } catch (err) {
    console.error("Error uploading file:", err);
    return c.text((err as Error).message, 500);
  }
};
app.use("*", async (c, next) => {
  const req = c.req;
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    const requestedHeaders = req.header("Access-Control-Request-Headers") ??
      "*";
    c.header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", requestedHeaders);
    c.header("Access-Control-Max-Age", "86400");
    return c.text("", 204);
  }
  await next();
});

app.get("/api/v1/download/:key", downloadHandler);
app.put("/api/v1/upload/:key", uploadHandler);

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
