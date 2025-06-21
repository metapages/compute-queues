import { type Context, Hono } from "hono";
import { serveStatic } from "hono/middleware";
import {
  type DockerApiCopyJobToQueuePayload,
  type DockerJobDefinitionRow,
  DockerJobState,
  type JobStates,
  shaDockerJob,
  type StateChange,
  type StateChangeValueQueued,
} from "@metapages/compute-queues-shared";
import { createHandler } from "metapages/worker/routing/handlerDeno";

import {
  BaseDockerJobQueue,
  userJobQueues,
} from "@metapages/compute-queues-shared";

import { config, getConfig } from "/@/config.ts";
import { join } from "std/path";

export class LocalDockerJobQueue extends BaseDockerJobQueue {
  constructor(opts: {
    serverId: string;
    address: string;
    dataDirectory: string;
    debug?: boolean;
  }) {
    super(opts);
  }
}

// TODO: this does not store anything actually. It might
// be fixed in a pending PR
const jobList: JobStates = { jobs: {} };
const app = new Hono();

const downloadHandler = async (c: Context) => {
  const key: string | undefined = c.req.param("key");

  if (!key) {
    c.status(400);
    return c.text("Missing key");
  }

  const config = getConfig();
  const filePath = join(config.dataDirectory, "cache", key);

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

const existsHandler = async (c: Context) => {
  const key: string | undefined = c.req.param("key");

  if (!key) {
    c.status(400);
    return c.text("Missing key");
  }

  const config = getConfig();
  const filePath = join(config.dataDirectory, "cache", key);

  try {
    // Check if the file exists
    const fileInfo = await Deno.stat(filePath);
    if (fileInfo.isFile) {
      c.status(200);
      return c.json({ exists: true });
    } else {
      c.status(404);
      return c.json({ exists: false });
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      c.status(404);
      return c.json({ exists: false });
    }
    console.error("Error checking file exists:", err);
    return c.text((err as Error).message, 500);
  }
};

const uploadHandler = async (c: Context) => {
  const key: string | undefined = c.req.param("key");

  if (!key) {
    c.status(400);
    return c.text("Missing key");
  }

  const config = getConfig();
  const filePath = join(config.dataDirectory, "cache");
  const fullFilePath = join(filePath, key);

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
      mode: 0o777,
    });

    // Stream the request body directly to the file
    await stream.pipeTo(file.writable);
    try {
      // https://github.com/denoland/deno/issues/14210
      file.close();
    } catch (_) {
      // pass
    }

    return c.text(`file saved to ${fullFilePath}`);
  } catch (err) {
    console.error("Error uploading file:", err);
    return c.text((err as Error).message, 500);
  }
};

const copyJobToQueueHandler = async (c: Context) => {
  try {
    const post = await c.req.json<DockerApiCopyJobToQueuePayload>();
    const { jobId, queue, namespace, control } = post;

    const existingJob: DockerJobDefinitionRow | null = jobList.jobs[jobId];

    if (!existingJob) {
      c.status(404);
      return c.json({ error: "Job not found" });
    }

    // Initialize queue if it doesn't exist
    const jobQueue = await ensureQueue(queue);

    const stateChangeValue: StateChangeValueQueued = {
      definition:
        (existingJob.history[0].value as StateChangeValueQueued).definition,
      time: Date.now(),
      debug: false,
      namespace,
      control,
    };
    const stateChange: StateChange = {
      job: jobId,
      tag: "",
      state: DockerJobState.Queued,
      value: stateChangeValue,
    };

    await jobQueue.stateChange(stateChange);

    c.status(200);
    return c.json({ success: true });
  } catch (err) {
    console.error("Error downloading file:", err);
    return c.text((err as Error).message, 500);
  }
};

const getJobHandler = (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");
    if (!jobId) {
      c.status(404);
      return c.json({ error: "No job provided" });
    }

    const job: DockerJobDefinitionRow | null = jobList.jobs[jobId];
    if (!job) {
      c.status(404);
      return c.json({ error: "Job not found" });
    }

    return c.json(job);
  } catch (err) {
    console.error("Error getting job", err);
    return c.text((err as Error).message, 500);
  }
};

const submitJobToQueueHandler = async (c: Context) => {
  try {
    const queue: string | undefined = c.req.param("queue");
    if (!queue) {
      c.status(404);
      return c.json({ error: "No queue specified" });
    }
    const jobToQueue = await c.req.json<StateChangeValueQueued>();
    jobToQueue.control = jobToQueue.control || {};
    jobToQueue.control.queueHistory = jobToQueue.control.queueHistory || [];
    jobToQueue.control.queueHistory.push(queue);
    const jobId = await shaDockerJob(jobToQueue.definition);

    const jobQueue = await ensureQueue(queue);

    const stateChange: StateChange = {
      job: jobId,
      tag: "",
      state: DockerJobState.Queued,
      value: jobToQueue,
    };

    // This needs to assume that a job submitted with a stateChange
    // like this will have an expectation of persistance
    await jobQueue.stateChange(stateChange);

    c.status(200);
    return c.json({ success: true, jobId });
  } catch (err) {
    console.error("Error submitting job:", err);
    return c.text((err as Error).message, 500);
  }
};

export const getJobIdsHandler = async (c: Context) => {
  try {
    const queue: string | undefined = c.req.param("queue");
    if (!queue) {
      c.status(404);
      return c.json({ error: "No queue specified" });
    }
    const jobQueue = await ensureQueue(queue);
    const jobIds = await jobQueue.db.queueGetJobIds(queue);
    return c.json({ success: true, jobIds });
  } catch (err) {
    console.error("Error getting job ids:", err);
    return c.text((err as Error).message, 500);
  }
};

app.use("*", async (c, next) => {
  const req = c.req;
  const origin = req.header("Origin");

  if (origin) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
    const requestedHeaders = req.header("Access-Control-Request-Headers") ??
      "*";
    c.header("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, OPTIONS");
    c.header("Access-Control-Allow-Headers", requestedHeaders);
    c.header("Access-Control-Max-Age", "86400");
    return c.body(null, 204);
  }

  await next();
});

app.get("/health", (c: Context) => c.text("OK"));
app.get("/healthz", (c: Context) => c.text("OK"));

app.get("/api/v1/download/:key", downloadHandler);
app.get("/api/v1/exists/:key", existsHandler);
app.put("/api/v1/upload/:key", uploadHandler);
app.post("/api/v1/copy", copyJobToQueueHandler);
// app.get("/api/v1/job/:jobId", getJobHandler);
app.get("/job/:jobId", getJobHandler);
app.post("/:queue/job", submitJobToQueueHandler);
app.get("/:queue/jobs", getJobIdsHandler);

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

const ensureQueue = async (queue: string): Promise<BaseDockerJobQueue> => {
  // Initialize queue if it doesn't exist
  if (!userJobQueues[queue]) {
    userJobQueues[queue] = new LocalDockerJobQueue({
      serverId: "local",
      address: queue,
      dataDirectory: getConfig().dataDirectory,
      debug: config.debug,
    });
    await userJobQueues[queue].setup();
  }
  return userJobQueues[queue];
};

const handleWebsocket = async (socket: WebSocket, request: Request) => {
  const url = new URL(request.url);
  const pathTokens = url.pathname.split("/").filter((x) => x !== "");
  const queueKey = pathTokens[0];
  const type = pathTokens[1];

  if (!queueKey) {
    console.log("No queue key, closing socket");
    socket.close();
    return;
  }

  if (config.debug) {
    console.log(`➕ websocket connection type=${type} queue=${queueKey}`);
  }

  // Initialize queue if it doesn't exist
  const queue = await ensureQueue(queueKey);

  // Handle client or worker connections
  if (type === "browser" || type === "client") {
    queue.connectClient({ socket });
  } else if (type === "worker") {
    queue.connectWorker({ socket }, queueKey);
  } else {
    console.log(`💥 Unknown type=[${type}], closing websocket`);
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
