import type { CallToolRequest, CallToolResult, Tool } from "./types.ts";
import { userJobQueues } from "/@/shared/jobqueue.ts";
import type {
  DockerJobDefinitionInputRefs,
  DockerJobState,
  EnqueueJob,
} from "/@/shared/types.ts";
import { nanoid } from "nanoid";

/**
 * MCP Tools for job queue operations
 */

export const tools: Tool[] = [
  {
    name: "submit_job",
    description: "Submit a Docker job to a queue for execution. Returns the job ID for tracking.",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "The queue name to submit the job to (e.g., 'my-queue', 'public1')",
        },
        image: {
          type: "string",
          description: "Docker image to run (e.g., 'python:3.11', 'alpine:latest')",
        },
        command: {
          type: "string",
          description: "Command to execute in the container",
          default: "echo 'Hello World'",
        },
        inputs: {
          type: "object",
          description: "Input files as key-value pairs where key is filename and value is file content",
          additionalProperties: {
            type: "string",
          },
          default: {},
        },
        env: {
          type: "object",
          description: "Environment variables as key-value pairs",
          additionalProperties: {
            type: "string",
          },
          default: {},
        },
        maxDuration: {
          type: "string",
          description: "Maximum job duration (e.g., '10m', '1h', '30s')",
          default: "10m",
        },
        namespace: {
          type: "string",
          description: "Optional namespace to group related jobs",
          default: "_",
        },
      },
      required: ["queue", "image"],
    },
  },
  {
    name: "get_job_status",
    description: "Get the status and details of a job by its ID. Returns job state, progress, and results if completed.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The unique job ID to check status for",
        },
        includeResult: {
          type: "boolean",
          description: "Whether to include job results if the job is finished",
          default: true,
        },
      },
      required: ["jobId"],
    },
  },
  {
    name: "list_jobs",
    description: "List all jobs in a queue with their current status and basic information.",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "The queue name to list jobs from",
        },
        limit: {
          type: "number",
          description: "Maximum number of jobs to return",
          default: 50,
          minimum: 1,
          maximum: 200,
        },
        state: {
          type: "string",
          description: "Filter by job state: 'Queued', 'Running', 'Finished'",
          enum: ["Queued", "Running", "Finished"],
        },
      },
      required: ["queue"],
    },
  },
  {
    name: "cancel_job",
    description: "Cancel a running or queued job in a specific queue.",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "The queue name where the job is located",
        },
        jobId: {
          type: "string",
          description: "The unique job ID to cancel",
        },
      },
      required: ["queue", "jobId"],
    },
  },
  {
    name: "stream_job_logs",
    description: "Stream real-time logs from a running job. Use WebSocket connection for continuous updates.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The unique job ID to stream logs from",
        },
        follow: {
          type: "boolean",
          description: "Whether to follow logs in real-time",
          default: true,
        },
      },
      required: ["jobId"],
    },
  },
  {
    name: "subscribe_to_job",
    description: "Subscribe to real-time updates for a job via WebSocket. Returns subscription ID.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The unique job ID to subscribe to",
        },
        events: {
          type: "array",
          description: "Types of events to subscribe to",
          items: {
            type: "string",
            enum: ["logs", "status", "completion"],
          },
          default: ["logs", "status", "completion"],
        },
      },
      required: ["jobId"],
    },
  },
];

/**
 * Handle tool calls
 */
export async function handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
  try {
    switch (request.name) {
      case "submit_job":
        return await handleSubmitJob(request);
      case "get_job_status":
        return await handleGetJobStatus(request);
      case "list_jobs":
        return await handleListJobs(request);
      case "cancel_job":
        return await handleCancelJob(request);
      case "stream_job_logs":
        return await handleStreamJobLogs(request);
      case "subscribe_to_job":
        return await handleSubscribeToJob(request);
      default:
        throw new Error(`Unknown tool: ${request.name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: (error as Error).message,
            tool: request.name,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

async function handleSubmitJob(request: CallToolRequest): Promise<CallToolResult> {
  const args = request.arguments;
  const { queue, image, command, inputs, env, maxDuration, namespace } = args;

  // Create job definition
  const definition: DockerJobDefinitionInputRefs = {
    image,
    command: command || "echo 'Hello World'",
    inputs: inputs || {},
    env: env || {},
    maxDuration: maxDuration || "10m",
  };

  // Create job
  const jobId = nanoid();
  const enqueuedJob: EnqueueJob = {
    id: jobId,
    definition,
    control: namespace && namespace !== "_" ? { namespace } : undefined,
  };

  // Get or create queue
  if (!userJobQueues[queue]) {
    const { ApiDockerJobQueue } = await import("/@/docker-jobs/ApiDockerJobQueue.ts");
    userJobQueues[queue] = new ApiDockerJobQueue({
      serverId: "mcp-server",
      address: queue,
    });
    await userJobQueues[queue].setup();
  }

  // Submit job
  await userJobQueues[queue].stateChangeJobEnqueue(enqueuedJob);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue,
          message: `Job submitted successfully to queue '${queue}' with ID: ${jobId}`,
        }, null, 2),
      },
    ],
  };
}

async function handleGetJobStatus(request: CallToolRequest): Promise<CallToolResult> {
  const { jobId, includeResult = true } = request.arguments;

  // Find the job across all queues
  let foundJob = null;
  let foundQueue = null;

  for (const [queueName, queue] of Object.entries(userJobQueues)) {
    const job = queue.state.jobs[jobId];
    if (job) {
      foundJob = job;
      foundQueue = queueName;
      break;
    }
  }

  if (!foundJob) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Job not found",
            jobId,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  let result = null;
  if (includeResult && foundJob.state === DockerJobState.Finished) {
    try {
      result = await userJobQueues[foundQueue!].db.getJobResult(jobId);
    } catch (error) {
      console.warn(`Could not fetch result for job ${jobId}:`, (error as Error).message);
    }
  }

  const response = {
    success: true,
    jobId,
    queue: foundQueue,
    status: {
      state: foundJob.state,
      worker: foundJob.worker,
      finishedReason: foundJob.finishedReason,
      time: foundJob.time,
      queuedTime: foundJob.queuedTime,
      namespaces: foundJob.namespaces,
    },
    result: result ? {
      outputs: result.outputs,
      logs: result.logs,
      statusCode: result.StatusCode,
      duration: result.duration,
      isTimedOut: result.isTimedOut,
    } : null,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

async function handleListJobs(request: CallToolRequest): Promise<CallToolResult> {
  const { queue, limit = 50, state } = request.arguments;

  if (!userJobQueues[queue]) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Queue not found",
            queue,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  const queueInstance = userJobQueues[queue];
  let jobs = Object.entries(queueInstance.state.jobs).map(([jobId, job]) => ({
    jobId,
    state: job.state,
    worker: job.worker,
    finishedReason: job.finishedReason,
    time: job.time,
    queuedTime: job.queuedTime,
    namespaces: job.namespaces,
  }));

  // Filter by state if specified
  if (state) {
    jobs = jobs.filter((job) => job.state === state);
  }

  // Apply limit
  jobs = jobs.slice(0, limit);

  const response = {
    success: true,
    queue,
    totalJobs: jobs.length,
    filters: { state, limit },
    jobs,
    workers: queueInstance.workers.myWorkers.map((w) => w.registration),
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

async function handleCancelJob(request: CallToolRequest): Promise<CallToolResult> {
  const { queue, jobId } = request.arguments;

  if (!userJobQueues[queue]) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Queue not found",
            queue,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  const queueInstance = userJobQueues[queue];
  const job = queueInstance.state.jobs[jobId];

  if (!job) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Job not found",
            jobId,
            queue,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  // Cancel the job
  await queueInstance.stateChangeJobFinished(jobId, {
    type: DockerJobState.Finished,
    reason: "Cancelled" as any,
    time: Date.now(),
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue,
          message: `Job ${jobId} has been cancelled in queue '${queue}'`,
        }, null, 2),
      },
    ],
  };
}

async function handleStreamJobLogs(request: CallToolRequest): Promise<CallToolResult> {
  const { jobId } = request.arguments;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          message: "To stream logs in real-time, use the WebSocket connection at /mcp/ws and subscribe to job events",
          instructions: {
            step1: "Connect to WebSocket at /mcp/ws",
            step2: "Send subscribe_to_job tool call with events: ['logs']",
            step3: "Receive real-time log notifications",
          },
        }, null, 2),
      },
    ],
  };
}

async function handleSubscribeToJob(request: CallToolRequest): Promise<CallToolResult> {
  const { jobId, events = ["logs", "status", "completion"] } = request.arguments;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          events,
          message: "Job subscription created. Connect to WebSocket at /mcp/ws to receive real-time updates",
          subscriptionId: `sub_${jobId}_${Date.now()}`,
        }, null, 2),
      },
    ],
  };
}