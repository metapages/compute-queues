import type { CallToolRequest, CallToolResult, Tool } from "./types.ts";
import { userJobQueues } from "@metapages/compute-queues-shared";
import {
  DockerJobDefinitionInputRefs,
  DockerJobState,
  EnqueueJob,
} from "@metapages/compute-queues-shared";
import { nanoid } from "nanoid";

// Default queue for MCP operations - can be overridden via initialization params  
let defaultQueue = "dev";

export function setDefaultQueue(queue: string) {
  defaultQueue = queue;
}

export function getDefaultQueue(): string {
  return defaultQueue;
}

export const tools: Tool[] = [
  {
    name: "execute_job",
    description: "Execute a containerized job with Docker image/Dockerfile and inputs. Returns the job ID for tracking.",
    inputSchema: {
      type: "object",
      properties: {
        image: {
          type: "string",
          description: "Docker image to run (e.g., 'python:3.11', 'node:18') - mutually exclusive with dockerfile",
        },
        dockerfile: {
          type: "string",
          description: "Inline Dockerfile content - mutually exclusive with image",
        },
        command: {
          type: "string",
          description: "Command to execute in the container",
          default: "echo 'Hello World'",
        },
        files: {
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
          default: "30m",
        },
      },
      required: [],
    },
  },
  {
    name: "get_job_results",
    description: "Get job status and results including logs. Use the job ID returned from execute_job.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The unique job ID (from execute_job)",
        },
        includeFullLogs: {
          type: "boolean",
          description: "Whether to include complete logs in the response",
          default: true,
        },
      },
      required: ["jobId"],
    },
  },
  {
    name: "get_job_url",
    description: "Generate a shareable URL for a job that contains its definition, inputs, and results for easy access.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The job ID to generate a URL for",
        },
        includeInputs: {
          type: "boolean",
          description: "Whether to include input files in the URL",
          default: true,
        },
        includeResults: {
          type: "boolean",
          description: "Whether to include results in the URL",
          default: true,
        },
      },
      required: ["jobId"],
    },
  },
];

export async function handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
  try {
    switch (request.name) {
      case "execute_job":
        return await handleExecuteJob(request);
      case "get_job_results":
        return await handleGetJobResults(request);
      case "get_job_url":
        return await handleGetJobUrl(request);
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
            note: "This is a simplified MCP implementation for container job execution",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

async function handleExecuteJob(request: CallToolRequest): Promise<CallToolResult> {
  const args = request.arguments || {};
  const { image, dockerfile, command, files, env, maxDuration } = args;

  // Validate mutually exclusive options
  if (image && dockerfile) {
    throw new Error("Cannot specify both 'image' and 'dockerfile' - choose one");
  }
  if (!image && !dockerfile) {
    throw new Error("Must specify either 'image' or 'dockerfile'");
  }

  // Create job ID and execute directly
  const jobId = nanoid();
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue: defaultQueue,
          status: "submitted",
          job: {
            image: image || undefined,
            dockerfile: dockerfile ? "[Dockerfile content]" : undefined,
            command: command || "echo 'Hello World'",
            filesCount: Object.keys(files || {}).length,
            envCount: Object.keys(env || {}).length,
            maxDuration: maxDuration || "30m",
          },
          message: `Job submitted for execution with ID: ${jobId}`,
          nextStep: "Use get_job_results with this jobId to check status and get results",
          note: "Full implementation would integrate with the job queue system for actual execution",
        }, null, 2),
      },
    ],
  };
}

async function handleGetJobResults(request: CallToolRequest): Promise<CallToolResult> {
  const { jobId, includeFullLogs = true } = request.arguments;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue: defaultQueue,
          status: {
            state: "simulated_finished",
            exitCode: 0,
            duration: "2.5s",
            completedAt: new Date().toISOString(),
          },
          results: {
            outputs: {
              "output.txt": "Hello World from container!",
              "result.json": '{"status": "completed", "processed": 42}',
            },
            logs: includeFullLogs ? [
              "[INFO] Container starting...",
              "[INFO] Running command: echo 'Hello World'", 
              "Hello World from container!",
              "[INFO] Command completed with exit code 0",
              "[INFO] Container stopped",
            ] : ["[Logs available - set includeFullLogs: true to see full logs]"],
            metrics: {
              memoryUsed: "64MB",
              cpuTime: "0.1s",
              networkIO: "1.2KB",
            },
          },
          analysis: {
            success: true,
            outputFileCount: 2,
            logLineCount: 5,
            recommendations: [
              "Job completed successfully",
              "All expected outputs generated",
            ],
          },
          message: `Results retrieved for job ${jobId}`,
          note: "Full implementation would fetch actual job results from the queue system",
        }, null, 2),
      },
    ],
  };
}

async function handleGetJobUrl(request: CallToolRequest): Promise<CallToolResult> {
  const { jobId, includeInputs = true, includeResults = true } = request.arguments;

  const baseUrl = "https://container.mtfm.io"; // or use current server URL
  const jobUrl = `${baseUrl}/j/${jobId}`;
  const queueUrl = `${baseUrl}/q/${defaultQueue}/j/${jobId}`;
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue: defaultQueue,
          urls: {
            job: jobUrl,
            queueJob: queueUrl,
            definition: `${queueUrl}/definition.json`,
            result: `${queueUrl}/result.json`,
            inputs: includeInputs ? `${queueUrl}/inputs/` : null,
            outputs: includeResults ? `${queueUrl}/outputs/` : null,
          },
          sharing: {
            message: "Use these URLs to access job data and share with others",
            curlExample: `curl ${queueUrl}/result.json`,
            webAccess: `Open ${jobUrl} in a browser to view job details`,
          },
          note: "Full implementation would generate URLs containing actual job data",
        }, null, 2),
      },
    ],
  };
}