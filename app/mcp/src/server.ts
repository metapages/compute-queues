#!/usr/bin/env deno run --allow-net --allow-env --allow-read --allow-write

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { WorkerMetapageClient } from "./client.ts";
import {
  cancelJobTool,
  getJobStatusTool,
  handleCancelJob,
  handleGetJobStatus,
  handleListJobs,
  handleSubmitJob,
  handleUploadFile,
  listJobsTool,
  submitJobTool,
  uploadFileTool,
} from "./tools/index.ts";

/**
 * MCP Server for worker.metapage.io
 * Provides tools and resources for interacting with the Docker job queue system
 */
class WorkerMetapageMCPServer {
  private server: Server;
  private client: WorkerMetapageClient;

  constructor() {
    // Initialize the MCP server
    this.server = new Server(
      {
        name: "worker-metapage-io",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    // Initialize the API client
    const baseUrl = Deno.env.get("WORKER_METAPAGE_URL") || "https://container.mtfm.io";
    this.client = new WorkerMetapageClient(baseUrl);

    this.setupTools();
    this.setupResources();
    this.setupErrorHandling();
  }

  private setupTools() {
    // Register tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          submitJobTool,
          getJobStatusTool,
          listJobsTool,
          cancelJobTool,
          uploadFileTool,
        ],
      };
    });

    // Register tool call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "submit_job":
          return await handleSubmitJob(request, this.client);

        case "get_job_status":
          return await handleGetJobStatus(request, this.client);

        case "list_jobs":
          return await handleListJobs(request, this.client);

        case "cancel_job":
          return await handleCancelJob(request, this.client);

        case "upload_file":
          return await handleUploadFile(request, this.client);

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private setupResources() {
    // Register resource list handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "queue://public1/jobs",
            name: "Public Queue Jobs",
            description: "List of jobs in the public1 queue",
            mimeType: "application/json",
          },
          {
            uri: "job://status/template",
            name: "Job Status Template",
            description: "Template for checking job status",
            mimeType: "application/json",
          },
        ],
      };
    });

    // Register resource read handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri.startsWith("queue://")) {
        // Parse queue URI: queue://queueName/jobs
        const parts = uri.replace("queue://", "").split("/");
        const queueName = parts[0];

        if (parts[1] === "jobs") {
          try {
            const jobs = await this.client.listJobs(queueName);
            return {
              contents: [
                {
                  type: "text",
                  text: JSON.stringify(jobs, null, 2),
                },
              ],
            };
          } catch (error: unknown) {
            return {
              contents: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: "Failed to fetch jobs",
                      message: (error as Error).message,
                      queue: queueName,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        }
      }

      if (uri === "job://status/template") {
        return {
          contents: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  template: "job_status_check",
                  description: "Use get_job_status tool with a jobId to check status",
                  example: {
                    tool: "get_job_status",
                    arguments: {
                      jobId: "your-job-id-here",
                      includeResult: true,
                    },
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Server Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Worker Metapage MCP Server running on stdio");
  }
}

// Start the server if this file is run directly
if (import.meta.main) {
  const server = new WorkerMetapageMCPServer();
  await server.run();
}
