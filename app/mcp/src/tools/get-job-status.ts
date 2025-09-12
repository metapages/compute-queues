import { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { WorkerMetapageClient } from "../client.ts";

export const getJobStatusTool: Tool = {
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
};

export async function handleGetJobStatus(
  request: CallToolRequest,
  client: WorkerMetapageClient,
): Promise<CallToolResult> {
  try {
    const args = request.params.arguments as any;
    const { jobId, includeResult = true } = args;

    const status = await client.getJobStatus(jobId);

    let result = null;
    if (includeResult && status.state === "Finished") {
      try {
        result = await client.getJobResult(jobId);
      } catch (resultError: unknown) {
        // Result might not be available yet, continue without it
        console.warn(`Could not fetch result for job ${jobId}:`, (resultError as Error).message);
      }
    }

    const response = {
      success: true,
      jobId,
      status: {
        state: status.state,
        worker: status.worker,
        finishedReason: status.finishedReason,
        time: status.time,
        queuedTime: status.queuedTime,
      },
      result: result
        ? {
          outputs: result.outputs,
          logs: result.logs,
          statusCode: result.StatusCode,
          duration: result.duration,
          isTimedOut: result.isTimedOut,
        }
        : null,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
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
              message: `Failed to get status for job: ${request.params.arguments?.jobId}`,
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
