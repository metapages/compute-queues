import { config, getConfig } from "/@/config.ts";
import { type Context, Hono } from "hono";
import { serveStatic } from "hono/middleware";
import { createHandler } from "metapages/worker/routing/handlerDeno";
import { join } from "std/path";
import mime from "mime";
import { nanoid } from "nanoid";

import {
  BaseDockerJobQueue,
  DefaultNamespace,
  DockerJobFinishedReason,
  DockerJobState,
  type EnqueueJob,
  getJobColorizedString,
  type InMemoryDockerJob,
  shaDockerJob,
  type StateChange,
  userJobQueues,
} from "@metapages/compute-queues-shared";

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

const app = new Hono();

const downloadHandler = async (c: Context) => {
  const key: string | undefined = c.req.param("key");

  if (!key) {
    c.status(400);
    return c.text("Missing key");
  }

  const config = getConfig();
  const filePath = join(config.dataDirectory, "f", key);

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
    c.header("Content-Type", key.endsWith(".json") ? "application/json" : "application/octet-stream");
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
  const filePath = join(config.dataDirectory, "f", key);

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
  const filePath = join(config.dataDirectory, "f");
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

const copyJobToQueueHandler = (c: Context) => {
  c.status(400);
  return c.json({ message: "The local handler for copyJob is not implemented because there is only one queue: local" });
};

const getQueueJobHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");
    if (!jobId) {
      c.status(404);
      return c.json({ error: "No job provided" });
    }
    const queue: string | undefined = c.req.param("queue") || "local";

    const jobQueue = await ensureQueue(queue);

    const [definition, results] = await Promise.all([
      jobQueue.db.getJobDefinition(jobId),
      jobQueue.db.getJobFinishedResults(jobId),
    ]);

    if (!definition) {
      c.status(404);
      return c.json({ error: "Job not found" });
    }

    return c.json({ data: definition ? { definition, results } : null });
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

    const jobToQueue = await c.req.json<EnqueueJob>();
    jobToQueue.control = jobToQueue.control || {};
    jobToQueue.id = jobToQueue.id || (await shaDockerJob(jobToQueue.definition));

    const jobQueue = await ensureQueue(queue);

    // This needs to assume that a job submitted with a stateChange
    // like this will have an expectation of persistance
    await jobQueue.stateChangeJobEnqueue(jobToQueue);

    c.status(200);
    return c.json({ success: true, jobId: jobToQueue.id });
  } catch (err) {
    console.error("Error submitting job:", err);
    return c.text((err as Error).message, 500);
  }
};

export const getJobsHandler = async (c: Context) => {
  try {
    const queue: string | undefined = c.req.param("queue");
    if (!queue) {
      c.status(404);
      return c.json({ error: "No queue specified" });
    }

    const jobQueue = await ensureQueue(queue);

    const data: Record<string, InMemoryDockerJob> = await jobQueue.db.queueGetJobs(queue);

    return c.json({ data });
  } catch (err) {
    console.error("Error getting job ids:", err);
    return c.text((err as Error).message, 500);
  }
};

export const getDefinitionHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");
    const queue: string = c.req.param("queue") || "local";
    if (!jobId) {
      c.status(404);
      return c.json({ error: "No jobId specified" });
    }

    const jobQueue = await ensureQueue(queue);
    const definition = await jobQueue.db.getJobDefinition(jobId);

    return c.json({ data: definition || null });
  } catch (err) {
    console.error("Error getting job definition:", err);
    return c.text((err as Error).message, 500);
  }
};

export const getJobResultsHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");
    const queue: string = c.req.param("queue") || "local";
    if (!jobId) {
      c.status(404);
      return c.json({ error: "No jobId specified" });
    }

    const jobQueue = await ensureQueue(queue);

    const jobWithoutMaybeLargeResults = await jobQueue.db.getFinishedJob(jobId);
    if (!jobWithoutMaybeLargeResults) {
      return c.json({ data: null });
    }

    const result = await jobQueue.db.getJobFinishedResults(jobId);
    return c.json({ data: result || null });
  } catch (err) {
    console.error("Error getting job results:", err);
    return c.text((err as Error).message, 500);
  }
};

export const getJobHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");

    if (!jobId) {
      c.status(404);
      return c.json({ error: "No jobId specified" });
    }

    const jobQueue = await ensureQueue("local");

    const [definition, results] = await Promise.all([
      jobQueue.db.getJobDefinition(jobId),
      jobQueue.db.getJobFinishedResults(jobId),
    ]);

    if (!definition) {
      c.status(404);
      return c.json({ error: "Job not found" });
    }

    return c.json({ data: definition ? { definition, results } : null });
  } catch (err) {
    console.error("Error getting job results:", err);
    return c.text((err as Error).message, 500);
  }
};

export const getJobInputsHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");

    if (!jobId) {
      c.status(400);
      return c.text("Missing jobId");
    }

    const filename = c.req.path.split("/inputs/").splice(1).join("/inputs/");

    if (!filename) {
      c.status(400);
      return c.text("Missing filename");
    }

    const queue: string = c.req.param("queue") || "local";
    const jobQueue = await ensureQueue(queue);

    // Get the job definition to find the input file SHA
    const jobDefinition = await jobQueue.db.getJobDefinition(jobId);
    if (!jobDefinition) {
      c.status(404);
      return c.text("Job not found");
    }

    // Look for the file in inputs
    const inputs = jobDefinition.inputs;
    console.log("getJobInputsHandler inputs", inputs);
    if (!inputs || !inputs[filename]) {
      c.status(404);
      return c.text(`Input file '${filename}' not found`);
    }

    const inputRef = inputs[filename];

    // Get the file SHA (hash) which is the storage key
    // const fileSha = inputRef.hash || inputRef.value;
    const fileSha = new URL(inputRef.value).pathname.split("/")[2];
    if (!fileSha) {
      c.status(404);
      return c.text(`No file SHA found for input '${filename}'`);
    }

    // Serve the file directly from local storage
    const config = getConfig();
    const filePath = join(config.dataDirectory, "f", fileSha);

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
      c.header("Content-Disposition", `attachment; filename="${filename}"`);
      c.header("Content-Type", mime.getType(filename) || "application/octet-stream");
      c.header("Content-Length", fileInfo.size.toString());

      // Create a response with the file's readable stream
      return c.newResponse(file.readable);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        c.status(404);
        return c.text("File not found");
      }
      console.error("Error serving input file:", err);
      return c.text((err as Error).message, 500);
    }
  } catch (err) {
    console.error("Error getting job input file:", err);
    return c.text((err as Error).message, 500);
  }
};

export const getJobOutputsHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");

    if (!jobId) {
      c.status(400);
      return c.text("Missing jobId");
    }

    const filename = c.req.path.split("/outputs/").splice(1).join("/inputs/");
    if (!filename) {
      c.status(400);
      return c.text("Missing filename");
    }

    const queue: string = c.req.param("queue") || "local";
    const jobQueue = await ensureQueue(queue);

    // Get the job results to find the output file SHA
    const jobWithoutMaybeLargeResults = await jobQueue.db.getFinishedJob(jobId);
    if (!jobWithoutMaybeLargeResults) {
      c.status(404);
      return c.text("Job not found");
    }

    // Get the full results
    const finishedJobFull = await jobQueue.db.getJobFinishedResults(jobId);
    if (!finishedJobFull || !finishedJobFull.finished || !finishedJobFull.finished.result) {
      c.status(404);
      return c.text("Job results not found");
    }

    // Look for the file in outputs
    const outputs = finishedJobFull.finished.result.outputs;
    if (!outputs || !outputs[filename]) {
      c.status(404);
      return c.text(`Output file '${filename}' not found`);
    }

    const outputRef = outputs[filename];

    // Get the file SHA (hash) which is the storage key
    const fileSha = outputRef.hash || outputRef.value;
    if (!fileSha) {
      c.status(404);
      return c.text(`No file SHA found for output '${filename}'`);
    }

    // Serve the file directly from local storage
    const config = getConfig();
    const filePath = join(config.dataDirectory, "f", fileSha);

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
      c.header("Content-Disposition", `attachment; filename="${filename}"`);
      c.header("Content-Type", mime.getType(filename) || "application/octet-stream");
      c.header("Content-Length", fileInfo.size.toString());

      // Create a response with the file's readable stream
      return c.newResponse(file.readable);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        c.status(404);
        return c.text("File not found");
      }
      console.error("Error serving output file:", err);
      return c.text((err as Error).message, 500);
    }
  } catch (err) {
    console.error("Error getting job output file:", err);
    return c.text((err as Error).message, 500);
  }
};

export const cancelJobHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");
    const queue: string | undefined = c.req.param("queue");
    let { namespace, message } = c.req.query();
    if (!namespace) {
      namespace = DefaultNamespace;
    } else {
      namespace = decodeURIComponent(namespace);
    }

    if (!jobId) {
      c.status(404);
      return c.json({ error: "No job provided" });
    }
    if (!queue) {
      c.status(404);
      return c.json({ error: "No queue provided" });
    }

    const jobQueue = await ensureQueue(queue);

    // while (true) {
    const job = await jobQueue.db.queueJobGet({ queue, jobId });
    console.log(`🐸💀 ${getJobColorizedString(jobId)} [cancelJobHandler]`, job);
    if (!job) {
      c.status(200);
      return c.json({ message: "Job not found" });
    }
    if (job.state === DockerJobState.Finished || job.state === DockerJobState.Removed) {
      c.status(200);
      return c.json({ success: true });
    }
    const stateChange: StateChange = {
      job: jobId,
      tag: "api",
      state: DockerJobState.Finished,
      value: {
        type: DockerJobState.Finished,
        reason: DockerJobFinishedReason.Cancelled,
        message: message || "Job cancelled by API",
        time: Date.now(),
        namespace: namespace,
      },
    };
    await jobQueue.stateChange(stateChange);
    // await new Promise((resolve) => setTimeout(resolve, 1000));
    // }

    // const jobQueue = await ensureQueue(queue);

    // const stateChange: StateChange = {
    //   job: jobId,
    //   tag: "api",
    //   state: DockerJobState.Finished,
    //   value: {
    //     type: DockerJobState.Finished,
    //     reason: DockerJobFinishedReason.Cancelled,
    //     time: Date.now(),
    //     message: "Job cancelled by API",
    //     namespace,
    //   },
    // };

    // await jobQueue.stateChange(stateChange);

    c.status(200);
    return c.json({ success: true, jobId, namespace });
  } catch (err) {
    console.error("Error getting job", err);
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

// app.get("/f/:key", downloadHandler);
// app.get("/f/:key/exists", existsHandler);
// app.put("/f/:key", uploadHandler);
// app.post("/api/v1/copy", copyJobToQueueHandler);
// app.get("/api/v1/job/:jobId", getJobHandler);
// app.get("/j/:jobId", getJobHandler);
// app.post("/q/:queue/job", submitJobToQueueHandler);
// app.get("/q/:queue/jobs", getJobIdsHandler);

app.get("/f/:key", downloadHandler);
app.get("/f/:key/exists", existsHandler);
app.put("/f/:key", uploadHandler);
app.get("/j/:jobId", getJobHandler);
app.get("/j/:jobId/definition.json", getDefinitionHandler);
app.get("/j/:jobId/result.json", getJobResultsHandler);
app.get("/j/:jobId/results.json", getJobResultsHandler);
app.get("/j/:jobId/outputs/*", getJobOutputsHandler);
app.get("/j/:jobId/inputs/*", getJobInputsHandler);
app.post("/j/:jobId/copy", copyJobToQueueHandler);
app.post("/q/:queue", submitJobToQueueHandler);
app.post("/q/:queue/j", submitJobToQueueHandler);
app.get("/q/:queue/j", getJobsHandler);
app.get("/q/:queue", getJobsHandler);
app.get("/q/:queue/j/:jobId", getQueueJobHandler);
app.get("/q/:queue/j/:jobId/inputs/*", getJobInputsHandler);
app.get("/q/:queue/j/:jobId/outputs/*", getJobOutputsHandler);
// app.get("/q/:queue/j/:jobId/namespaces.json", getJobNamespacesHandler);
app.get("/q/:queue/j/:jobId/definition.json", getDefinitionHandler);
app.get("/q/:queue/j/:jobId/result.json", getJobResultsHandler);
app.get("/q/:queue/j/:jobId/results.json", getJobResultsHandler);
// app.get("/q/:queue/j/:jobId/history.json", toImplementPlaceholder);
app.post("/q/:queue/j/:jobId/cancel", cancelJobHandler);
app.post("/q/:queue/j/:jobId/:namespace/cancel", cancelJobHandler);
// app.get("/q/:queue/namespaces", getJobHandler);

const metricsHandler = async (c: Context) => {
  const queue = c.req.param("queue") || "local";
  if (!queue) {
    c.status(400);
    return c.text("Missing queue");
  }
  const jobQueue = await ensureQueue(queue);
  const jobs = await jobQueue.db.queueGetJobs("local");
  const unfinishedQueueLength = Object.keys(jobs).length;

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

app.get("/metrics", metricsHandler);
app.get("/q/:queue/metrics", metricsHandler);

app.get("/q/:queue/status", async (c) => {
  const queue = c.req.param("queue");
  if (!queue) {
    c.status(400);
    return c.text("Missing queue");
  }

  try {
    const jobQueue = await ensureQueue(queue);
    const status = await jobQueue.status();
    return c.json(status as unknown);
  } catch (err) {
    console.error("Error getting queue status:", err);
    return c.text((err as Error).message, 500);
  }
});

app.get("/:queue/metrics", metricsHandler);

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

// MCP Types and Handlers
type MCPRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

type MCPResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type MCPTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
};

const mcpTools: MCPTool[] = [
  {
    name: "submit_job",
    description: "Submit a Docker job to a queue for execution. Returns the job ID for tracking.",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "The queue name to submit the job to (e.g., 'local1', 'my-queue')"
        },
        image: {
          type: "string", 
          description: "Docker image to run (e.g., 'python:3.11', 'alpine:latest')"
        },
        command: {
          type: "string",
          description: "Command to execute in the container",
          default: "echo 'Hello World'"
        },
        inputs: {
          type: "object",
          description: "Input files as key-value pairs where key is filename and value is file content",
          additionalProperties: { type: "string" },
          default: {}
        },
        env: {
          type: "object", 
          description: "Environment variables as key-value pairs",
          additionalProperties: { type: "string" },
          default: {}
        },
        maxDuration: {
          type: "string",
          description: "Maximum job duration (e.g., '10m', '1h', '30s')",
          default: "10m"
        }
      },
      required: ["queue", "image"]
    }
  },
  {
    name: "get_job_status", 
    description: "Get the status and details of a job by its ID. Returns job state, progress, and results if completed.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The unique job ID to check status for"
        },
        includeResult: {
          type: "boolean", 
          description: "Whether to include job results if the job is finished",
          default: true
        }
      },
      required: ["jobId"]
    }
  },
  {
    name: "list_jobs",
    description: "List all jobs in a queue with their current status and basic information.", 
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "The queue name to list jobs from"
        },
        limit: {
          type: "number",
          description: "Maximum number of jobs to return",
          default: 50,
          minimum: 1,
          maximum: 200
        }
      },
      required: ["queue"]
    }
  },
  {
    name: "cancel_job",
    description: "Cancel a running or queued job in a specific queue.",
    inputSchema: {
      type: "object", 
      properties: {
        queue: {
          type: "string",
          description: "The queue name where the job is located"
        },
        jobId: {
          type: "string", 
          description: "The unique job ID to cancel"
        }
      },
      required: ["queue", "jobId"]
    }
  }
];

const handleMCPSubmitJob = async (args: any): Promise<any> => {
  try {
    const { queue, image, command = "echo 'Hello World'", inputs = {}, env = {}, maxDuration = "10m" } = args;
    
    const jobId = nanoid();
    const jobToQueue: EnqueueJob = {
      id: jobId,
      definition: {
        image,
        command,
        inputs: inputs as DockerJobDefinitionInputRefs,
        env,
        maxDuration 
      },
      control: {}
    };

    const jobQueue = await ensureQueue(queue);
    await jobQueue.stateChangeJobEnqueue(jobToQueue);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue,
          message: `Job submitted successfully to queue '${queue}' with ID: ${jobId}`
        }, null, 2)
      }]
    };
  } catch (error: unknown) {
    return {
      content: [{
        type: "text", 
        text: JSON.stringify({
          success: false,
          error: (error as Error).message,
          tool: "submit_job"
        }, null, 2)
      }],
      isError: true
    };
  }
};

const handleMCPGetJobStatus = async (args: any): Promise<any> => {
  try {
    const { jobId, includeResult = true } = args;
    
    // Try to find the job in any queue (since we don't know which queue)
    let foundJob = null;
    let foundQueue = "";
    
    for (const queueName of Object.keys(userJobQueues)) {
      const queue = userJobQueues[queueName];
      const job = await queue.db.queueJobGet({ queue: queueName, jobId });
      if (job) {
        foundJob = job;
        foundQueue = queueName;
        break;
      }
    }
    
    if (!foundJob) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Job not found",
            jobId
          }, null, 2)
        }],
        isError: true
      };
    }

    let result = null;
    if (includeResult && foundJob.state === DockerJobState.Finished) {
      const jobQueue = userJobQueues[foundQueue];
      result = await jobQueue.db.getJobFinishedResults(jobId);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue: foundQueue,
          job: foundJob,
          result
        }, null, 2)
      }]
    };
  } catch (error: unknown) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          error: (error as Error).message,
          tool: "get_job_status"
        }, null, 2)
      }],
      isError: true
    };
  }
};

const handleMCPListJobs = async (args: any): Promise<any> => {
  try {
    const { queue, limit = 50 } = args;
    
    const jobQueue = await ensureQueue(queue);
    const jobs = await jobQueue.db.queueGetJobs(queue);
    
    const jobList = Object.entries(jobs)
      .slice(0, limit)
      .map(([jobId, job]) => ({
        jobId,
        state: job.state,
        queuedTime: job.queuedTime,
        image: job.definition?.image,
        command: job.definition?.command
      }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          queue,
          totalJobs: Object.keys(jobs).length,
          jobs: jobList
        }, null, 2)
      }]
    };
  } catch (error: unknown) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          error: (error as Error).message,
          queue: args.queue
        }, null, 2)
      }],
      isError: true
    };
  }
};

const handleMCPCancelJob = async (args: any): Promise<any> => {
  try {
    const { queue, jobId } = args;
    
    const jobQueue = await ensureQueue(queue);
    const job = await jobQueue.db.queueJobGet({ queue, jobId });
    
    if (!job) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Job not found",
            jobId,
            queue
          }, null, 2)
        }],
        isError: true
      };
    }
    
    if (job.state === DockerJobState.Finished) {
      return {
        content: [{
          type: "text", 
          text: JSON.stringify({
            success: true,
            message: "Job already finished",
            jobId,
            queue
          }, null, 2)
        }]
      };
    }

    const stateChange = {
      job: jobId,
      tag: "mcp",
      state: DockerJobState.Finished,
      value: {
        type: DockerJobState.Finished,
        reason: DockerJobFinishedReason.Cancelled,
        message: "Job cancelled via MCP",
        time: Date.now(),
        namespace: DefaultNamespace
      }
    };
    
    await jobQueue.stateChange(stateChange);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue,
          message: "Job cancelled successfully"
        }, null, 2)
      }]
    };
  } catch (error: unknown) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          error: (error as Error).message,
          tool: "cancel_job"
        }, null, 2)
      }],
      isError: true
    };
  }
};

const handleMCPToolCall = async (toolName: string, args: any): Promise<any> => {
  switch (toolName) {
    case "submit_job":
      return await handleMCPSubmitJob(args);
    case "get_job_status":
      return await handleMCPGetJobStatus(args);
    case "list_jobs":
      return await handleMCPListJobs(args);
    case "cancel_job":
      return await handleMCPCancelJob(args);
    default:
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Unknown tool: ${toolName}`
          }, null, 2)
        }],
        isError: true
      };
  }
};

const handleMCPRequest = async (c: Context): Promise<Response> => {
  try {
    const request: MCPRequest = await c.req.json();
    
    let response: MCPResponse = {
      jsonrpc: "2.0",
      id: request.id
    };

    switch (request.method) {
      case "tools/list":
        response.result = { tools: mcpTools };
        break;
        
      case "tools/call":
        const { name, arguments: args } = request.params as { name: string; arguments: any };
        response.result = await handleMCPToolCall(name, args);
        break;
        
      default:
        response.error = {
          code: -32601,
          message: `Method not found: ${request.method}`
        };
    }

    return c.json(response);
  } catch (error: unknown) {
    const response: MCPResponse = {
      jsonrpc: "2.0", 
      id: "unknown",
      error: {
        code: -32700,
        message: "Parse error",
        data: (error as Error).message
      }
    };
    return c.json(response, 400);
  }
};

const handleMCPHealth = (c: Context): Response => {
  return c.json({
    status: "healthy",
    server: "worker-metapage-local",
    version: "1.0.0",
    capabilities: ["tools"],
    timestamp: new Date().toISOString()
  });
};

const handleMCPInfo = (c: Context): Response => {
  return c.json({
    server: {
      name: "worker-metapage-local",
      version: "1.0.0", 
      description: "Local MCP server for worker.metapage.io job queue system"
    },
    capabilities: {
      tools: {
        count: mcpTools.length,
        names: mcpTools.map(t => t.name)
      }
    },
    endpoints: {
      http: "/mcp",
      health: "/mcp/health", 
      info: "/mcp/info"
    },
    documentation: {
      tools: mcpTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        required: tool.inputSchema.required,
        properties: Object.keys(tool.inputSchema.properties)
      }))
    }
  });
};

// MCP (Model Context Protocol) endpoints
app.post("/mcp", handleMCPRequest);
app.get("/mcp/health", handleMCPHealth);
app.get("/mcp/info", handleMCPInfo);

const handleWebsocket = async (socket: WebSocket, request: Request) => {
  const url = new URL(request.url);
  const pathTokens = url.pathname.split("/").filter((x) => x !== "");

  // previous deprecated routes, now queues always start with /q/<:queueId>
  let queueKey = pathTokens[0];
  let isClient = pathTokens[1] === "browser" || pathTokens[1] === "client";
  let isWorker = pathTokens[1] === "worker";

  if (pathTokens[0] === "q") {
    queueKey = pathTokens[1];
    isClient = pathTokens[2] === "browser" || pathTokens[2] === "client";
    isWorker = pathTokens[2] === "worker";
  }

  // const queueKey = pathTokens[0];
  // const type = pathTokens[1];

  if (!queueKey) {
    console.log("No queue key, closing socket");
    socket.close();
    return;
  }

  if (config.debug) {
    console.log(`➕ websocket connection type=${pathTokens[1]} queue=${queueKey}`);
  }

  // Initialize queue if it doesn't exist
  const queue = await ensureQueue(queueKey);

  // Handle client or worker connections
  if (isClient) {
    queue.connectClient({ socket });
  } else if (isWorker) {
    queue.connectWorker({ socket });
  } else {
    console.log(`💥 Unknown type=[${pathTokens[1]}], closing websocket`);
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
