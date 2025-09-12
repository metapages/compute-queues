import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { WorkerMetapageClient } from "../client.ts";

export const submitJobTool: Tool = {
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
};

export async function handleSubmitJob(
  request: CallToolRequest,
  client: WorkerMetapageClient,
): Promise<CallToolResult> {
  try {
    const args = request.params.arguments as any;
    const { queue, image, command, inputs, env, maxDuration, namespace } = args;

    // Build job definition
    const jobDefinition = {
      image,
      command: command || "echo 'Hello World'",
      inputs: inputs || {},
      env: env || {},
      maxDuration: maxDuration || "10m",
    };

    // Add control config if namespace is provided
    const control = namespace && namespace !== "_" ? { namespace } : undefined;

    const payload = {
      definition: jobDefinition,
      control,
    };

    const result = await client.submitJob(queue, payload);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              jobId: result.jobId,
              queue,
              message: `Job submitted successfully to queue '${queue}' with ID: ${result.jobId}`,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error: unknown) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: (error as Error).message,
              message: "Failed to submit job",
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}
