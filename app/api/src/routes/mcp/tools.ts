import type { CallToolRequest, CallToolResult, Tool } from "./types.ts";
import { userJobQueues } from "@metapages/compute-queues-shared";
import {
  DockerJobDefinitionInputRefs,
  DockerJobState,
  EnqueueJob,
  DockerRunResultWithOutputs,
  InMemoryDockerJob,
} from "@metapages/compute-queues-shared";
import { nanoid } from "nanoid";

/**
 * MCP Tools for job queue operations
 */

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
    name: "create_job",
    description: "Create a containerized job with simplified inputs for iterative development. Supports both Docker images and inline Dockerfiles.",
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
        namespace: {
          type: "string",
          description: "Optional namespace to group related development jobs",
          default: "dev",
        },
      },
      required: [],
    },
  },
  {
    name: "execute_job",
    description: "Execute a job and monitor its progress. Returns comprehensive execution results including logs, outputs, and exit code.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The unique job ID to execute (from create_job)",
        },
        timeout: {
          type: "number",
          description: "Maximum time to wait for completion in seconds",
          default: 300,
        },
        streamLogs: {
          type: "boolean",
          description: "Whether to include streaming logs in the response",
          default: true,
        },
      },
      required: ["jobId"],
    },
  },
  {
    name: "inspect_outputs",
    description: "Inspect job outputs and compare against expected results. Useful for iterative development to understand what went wrong.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The job ID to inspect outputs for",
        },
        expectedFiles: {
          type: "array",
          description: "List of expected output file names",
          items: {
            type: "string",
          },
          default: [],
        },
        expectedPatterns: {
          type: "object",
          description: "Expected patterns in files - key is filename, value is regex pattern or string to match",
          additionalProperties: {
            type: "string",
          },
          default: {},
        },
        includeStdout: {
          type: "boolean",
          description: "Whether to include stdout logs in analysis",
          default: true,
        },
        includeStderr: {
          type: "boolean",
          description: "Whether to include stderr logs in analysis",
          default: true,
        },
      },
      required: ["jobId"],
    },
  },
  {
    name: "modify_job",
    description: "Modify an existing job definition for iterative development. Creates a new job with updated configuration.",
    inputSchema: {
      type: "object",
      properties: {
        baseJobId: {
          type: "string",
          description: "The base job ID to copy configuration from",
        },
        changes: {
          type: "object",
          description: "Changes to apply to the job",
          properties: {
            image: {
              type: "string",
              description: "New Docker image to use",
            },
            dockerfile: {
              type: "string",
              description: "New Dockerfile content",
            },
            command: {
              type: "string",
              description: "New command to execute",
            },
            files: {
              type: "object",
              description: "Files to add/update (merges with existing)",
              additionalProperties: {
                type: "string",
              },
            },
            env: {
              type: "object",
              description: "Environment variables to add/update (merges with existing)",
              additionalProperties: {
                type: "string",
              },
            },
            removeFiles: {
              type: "array",
              description: "List of file names to remove from the job",
              items: {
                type: "string",
              },
            },
          },
        },
        description: {
          type: "string",
          description: "Description of changes made for tracking iterations",
          default: "Modified job",
        },
      },
      required: ["baseJobId", "changes"],
    },
  },
  {
    name: "list_iterations",
    description: "List all job iterations in the development namespace, showing the progression of job modifications.",
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: "Development namespace to list iterations from",
          default: "dev",
        },
        limit: {
          type: "number",
          description: "Maximum number of iterations to return",
          default: 20,
          minimum: 1,
          maximum: 100,
        },
        includeResults: {
          type: "boolean",
          description: "Whether to include brief result summaries",
          default: false,
        },
      },
      required: [],
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

/**
 * Handle tool calls
 */
export async function handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
  try {
    switch (request.name) {
      case "create_job":
        return await handleCreateJob(request);
      case "execute_job":
        return await handleExecuteJob(request);
      case "inspect_outputs":
        return await handleInspectOutputs(request);
      case "modify_job":
        return await handleModifyJob(request);
      case "list_iterations":
        return await handleListIterations(request);
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
            stack: (error as Error).stack,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

async function handleCreateJob(request: CallToolRequest): Promise<CallToolResult> {
  const args = request.arguments || {};
  const { image, dockerfile, command, files, env, maxDuration, namespace } = args;

  // Validate mutually exclusive options
  if (image && dockerfile) {
    throw new Error("Cannot specify both 'image' and 'dockerfile' - choose one");
  }
  if (!image && !dockerfile) {
    throw new Error("Must specify either 'image' or 'dockerfile'");
  }

  // Create job definition with simplified inputs (no base64 or refs)
  const definition: DockerJobDefinitionInputRefs = {
    image: image || undefined,
    build: dockerfile ? { dockerfile } : undefined,
    command: command || "echo 'Hello World'",
    inputs: files || {},
    env: env || {},
    maxDuration: maxDuration || "30m",
  };

  // Create job
  const jobId = nanoid();
  const enqueuedJob: EnqueueJob = {
    id: jobId,
    definition,
    control: {
      namespace: namespace || "dev",
    },
  };

  // Get or create queue
  const queue = defaultQueue;
  if (!userJobQueues[queue]) {
    const { ApiDockerJobQueue } = await import("/@/docker-jobs/ApiDockerJobQueue.ts");
    userJobQueues[queue] = new ApiDockerJobQueue({
      serverId: "mcp-server",
      address: queue,
    });
    await userJobQueues[queue].setup();
  }

  // Submit job (but don't start execution yet)
  await userJobQueues[queue].stateChangeJobEnqueue(enqueuedJob);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue,
          definition: {
            image: definition.image,
            dockerfile: definition.build?.dockerfile ? "[Dockerfile content]" : undefined,
            command: definition.command,
            filesCount: Object.keys(definition.inputs || {}).length,
            envCount: Object.keys(definition.env || {}).length,
            maxDuration: definition.maxDuration,
          },
          namespace: namespace || "dev",
          message: `Job created successfully with ID: ${jobId}. Use execute_job to run it.`,
          nextStep: "Call execute_job with this jobId to run and monitor the job",
        }, null, 2),
      },
    ],
  };
}

async function handleExecuteJob(request: CallToolRequest): Promise<CallToolResult> {
  const { jobId, timeout = 300, streamLogs = true } = request.arguments;

  // Find the job across all queues
  let foundJob = null;
  let foundQueue = null;
  let queueInstance = null;

  for (const [queueName, queue] of Object.entries(userJobQueues)) {
    try {
      const job = await queue.db.queueJobGet({ queue: queueName, jobId });
      if (job) {
        foundJob = job;
        foundQueue = queueName;
        queueInstance = queue;
        break;
      }
    } catch (error) {
      // Job not found in this queue, continue
    }
  }

  if (!foundJob) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const startTime = Date.now();
  let result = null;
  let executionLogs: string[] = [];

  // Wait for job completion with timeout
  const checkInterval = 1000; // Check every second
  const maxWaitTime = timeout * 1000;

  while (Date.now() - startTime < maxWaitTime) {
    // Refresh job status
    try {
      const currentJob = await queueInstance!.db.queueJobGet({ queue: foundQueue!, jobId });
      if (!currentJob) {
        throw new Error(`Job disappeared during execution: ${jobId}`);
      }

      if (currentJob.state === DockerJobState.Finished) {
        // Job completed, fetch results
        try {
          // First check if job is finished
          const finishedJob = await queueInstance!.db.getFinishedJob(jobId);
          if (finishedJob) {
            result = await queueInstance!.db.getJobFinishedResults(jobId) as DockerRunResultWithOutputs;
            if (streamLogs && result.logs) {
              executionLogs = Array.isArray(result.logs) ? result.logs.map(log => String(log)) : [String(result.logs)];
            }
          }
        } catch (error) {
          console.warn(`Could not fetch result for job ${jobId}:`, (error as Error).message);
        }
        break;
      }
      foundJob = currentJob; // Update foundJob for final response
    } catch (error) {
      throw new Error(`Failed to refresh job status: ${(error as Error).message}`);
    }

    // Still running, wait a bit
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  const duration = Date.now() - startTime;
  const isTimedOut = duration >= maxWaitTime;

  if (isTimedOut && foundJob.state !== DockerJobState.Finished) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            jobId,
            error: "Job execution timed out",
            timeoutSeconds: timeout,
            currentState: foundJob.state,
            executionTimeMs: duration,
            suggestion: "Job may still be running. Use execute_job with a longer timeout or check job status later.",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          jobId,
          queue: foundQueue,
          execution: {
            state: foundJob.state,
            executionTimeMs: duration,
            startedAt: new Date(startTime).toISOString(),
            completedAt: new Date().toISOString(),
          },
          result: result ? {
            exitCode: result.StatusCode,
            outputs: result.outputs || {},
            logs: streamLogs ? executionLogs : "[Use streamLogs: true to include logs]",
            duration: result.duration,
            isTimedOut: result.isTimedOut,
          } : null,
          analysis: result ? {
            success: (result.StatusCode === 0),
            outputFiles: Object.keys(result.outputs || {}),
            logLineCount: Array.isArray(result.logs) ? result.logs.length : (result.logs ? 1 : 0),
          } : null,
        }, null, 2),
      },
    ],
  };
}

async function handleInspectOutputs(request: CallToolRequest): Promise<CallToolResult> {
  const { jobId, expectedFiles = [], expectedPatterns = {}, includeStdout = true, includeStderr = true } = request.arguments;

  // Find the job and get its results
  let foundJob = null;
  let foundQueue = null;
  let result = null;

  for (const [queueName, queue] of Object.entries(userJobQueues)) {
    try {
      const job = await queue.db.queueJobGet({ queue: queueName, jobId });
      if (job) {
        foundJob = job;
        foundQueue = queueName;
        if (job.state === DockerJobState.Finished) {
          try {
            const finishedJob = await queue.db.getFinishedJob(jobId);
            if (finishedJob) {
              result = await queue.db.getJobFinishedResults(jobId) as DockerRunResultWithOutputs;
            }
          } catch (error) {
            console.warn(`Could not fetch result for job ${jobId}:`, (error as Error).message);
          }
        }
        break;
      }
    } catch (error) {
      // Job not found in this queue, continue
    }
  }

  if (!foundJob) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (foundJob.state !== DockerJobState.Finished) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            jobId,
            error: "Job is not finished yet",
            currentState: foundJob.state,
            suggestion: "Use execute_job to wait for completion, then inspect outputs",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  if (!result) {
    throw new Error(`Could not retrieve results for job ${jobId}`);
  }

  // Analyze outputs
  const outputs = result.outputs || {};
  const logs = result.logs || [];
  const exitCode = result.StatusCode;

  // Check expected files
  const fileAnalysis = expectedFiles.map(filename => ({
    filename,
    exists: filename in outputs,
    content: outputs[filename] || null,
    size: outputs[filename] ? outputs[filename].length : 0,
  }));

  // Check expected patterns
  const patternAnalysis = Object.entries(expectedPatterns).map(([filename, pattern]) => {
    const content = outputs[filename] || "";
    const regex = new RegExp(pattern);
    const matches = content.match(regex);
    return {
      filename,
      pattern,
      exists: filename in outputs,
      matches: !!matches,
      matchCount: matches ? matches.length : 0,
      matchedText: matches ? matches[0] : null,
    };
  });

  // Log analysis
  const logLines = Array.isArray(logs) ? logs : [logs].filter(Boolean);
  const errorLines = logLines.filter(line => 
    line.toLowerCase().includes('error') || 
    line.toLowerCase().includes('exception') ||
    line.toLowerCase().includes('failed')
  );

  const inspection = {
    success: true,
    jobId,
    queue: foundQueue,
    execution: {
      exitCode,
      success: exitCode === 0,
      duration: result.duration,
      isTimedOut: result.isTimedOut,
    },
    outputs: {
      fileCount: Object.keys(outputs).length,
      files: Object.keys(outputs),
      totalSize: Object.values(outputs).reduce((sum: number, content: any) => sum + String(content).length, 0),
    },
    expectations: {
      files: fileAnalysis,
      patterns: patternAnalysis,
      allExpectedFilesFound: expectedFiles.length === 0 || fileAnalysis.every(f => f.exists),
      allPatternsMatched: Object.keys(expectedPatterns).length === 0 || patternAnalysis.every(p => p.matches),
    },
    logs: {
      totalLines: logLines.length,
      errorLines: errorLines.length,
      stdout: includeStdout ? logLines.filter(line => !line.startsWith('[STDERR]')) : "[Set includeStdout: true to include]",
      stderr: includeStderr ? logLines.filter(line => line.startsWith('[STDERR]')) : "[Set includeStderr: true to include]",
      errors: errorLines.slice(0, 5), // First 5 error lines
    },
    recommendations: [],
  };

  // Add recommendations
  if (exitCode !== 0) {
    inspection.recommendations.push(`Job failed with exit code ${exitCode}. Check error logs.`);
  }
  if (expectedFiles.length > 0 && !inspection.expectations.allExpectedFilesFound) {
    const missingFiles = fileAnalysis.filter(f => !f.exists).map(f => f.filename);
    inspection.recommendations.push(`Missing expected files: ${missingFiles.join(', ')}`);
  }
  if (Object.keys(expectedPatterns).length > 0 && !inspection.expectations.allPatternsMatched) {
    const failedPatterns = patternAnalysis.filter(p => !p.matches).map(p => `${p.filename}: ${p.pattern}`);
    inspection.recommendations.push(`Pattern mismatches: ${failedPatterns.join('; ')}`);
  }
  if (errorLines.length > 0) {
    inspection.recommendations.push(`Found ${errorLines.length} error/warning lines in logs. Review for issues.`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(inspection, null, 2),
      },
    ],
  };
}

async function handleModifyJob(request: CallToolRequest): Promise<CallToolResult> {
  const { baseJobId, changes, description = "Modified job" } = request.arguments;

  // Find the base job
  let baseJob = null;
  let baseJobResult = null;
  let foundQueue = null;

  for (const [queueName, queue] of Object.entries(userJobQueues)) {
    try {
      const job = await queue.db.queueJobGet({ queue: queueName, jobId: baseJobId });
      if (job) {
        baseJob = job;
        foundQueue = queueName;
        // Try to get the job results from the database
        try {
          const finishedJob = await queue.db.getFinishedJob(baseJobId);
          if (finishedJob) {
            baseJobResult = await queue.db.getJobFinishedResults(baseJobId) as DockerRunResultWithOutputs;
          }
        } catch (error) {
          // Job might not be finished, that's ok
        }
        break;
      }
    } catch (error) {
      // Job not found in this queue, continue
    }
  }

  if (!baseJob) {
    throw new Error(`Base job not found: ${baseJobId}`);
  }

  // Get original definition from the job or reconstruct
  let originalDefinition: DockerJobDefinitionInputRefs;
  try {
    originalDefinition = await userJobQueues[foundQueue!].db.getJobDefinition(baseJobId);
  } catch (error) {
    // Fallback to basic definition if can't retrieve
    originalDefinition = {
      image: changes.image || "alpine:latest",
      command: changes.command || "echo 'Hello World'",
      inputs: {},
      env: {},
      maxDuration: "30m",
    };
  }

  // Apply changes to create new definition
  const newDefinition: DockerJobDefinitionInputRefs = {
    image: changes.image || originalDefinition.image,
    build: changes.dockerfile ? { dockerfile: changes.dockerfile } : originalDefinition.build,
    command: changes.command || originalDefinition.command,
    maxDuration: originalDefinition.maxDuration,
    inputs: { ...(originalDefinition.inputs || {}), ...(changes.files || {}) },
    env: { ...(originalDefinition.env || {}), ...(changes.env || {}) },
  };

  // Remove specified files
  if (changes.removeFiles) {
    for (const filename of changes.removeFiles) {
      delete newDefinition.inputs![filename];
    }
  }

  // Create new job
  const newJobId = nanoid();
  const newJob: EnqueueJob = {
    id: newJobId,
    definition: newDefinition,
    control: {
      namespace: baseJob.namespaces?.[0] || "dev",
    },
  };

  // Submit new job to queue
  const queue = foundQueue || defaultQueue;
  if (!userJobQueues[queue]) {
    const { ApiDockerJobQueue } = await import("/@/docker-jobs/ApiDockerJobQueue.ts");
    userJobQueues[queue] = new ApiDockerJobQueue({
      serverId: "mcp-server",
      address: queue,
    });
    await userJobQueues[queue].setup();
  }

  await userJobQueues[queue].stateChangeJobEnqueue(newJob);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          newJobId,
          baseJobId,
          queue,
          description,
          changes: {
            imageChanged: changes.image !== undefined,
            dockerfileChanged: changes.dockerfile !== undefined,
            commandChanged: changes.command !== undefined,
            filesAdded: Object.keys(changes.files || {}).length,
            envAdded: Object.keys(changes.env || {}).length,
            filesRemoved: (changes.removeFiles || []).length,
          },
          newDefinition: {
            image: newDefinition.image,
            dockerfile: newDefinition.build?.dockerfile ? "[Modified Dockerfile]" : undefined,
            command: newDefinition.command,
            filesCount: Object.keys(newDefinition.inputs || {}).length,
            envCount: Object.keys(newDefinition.env || {}).length,
          },
          message: `Modified job created with ID: ${newJobId}`,
          nextStep: "Use execute_job to run the modified job and compare results",
        }, null, 2),
      },
    ],
  };
}

async function handleListIterations(request: CallToolRequest): Promise<CallToolResult> {
  const { namespace = "dev", limit = 20, includeResults = false } = request.arguments;

  // Collect all development jobs from all queues
  const iterations: any[] = [];

  for (const [queueName, queue] of Object.entries(userJobQueues)) {
    try {
      const jobs = await queue.db.queueGetJobs(queueName);
      const jobArray = Object.values(jobs); // queueGetJobs returns Record<string, InMemoryDockerJob>
      
      for (const job of jobArray) {
        // Filter by namespace
        if (job.namespaces && job.namespaces.includes(namespace)) {
          const iteration = {
            jobId: job.id,
            queue: queueName,
            state: job.state,
            createdAt: new Date(job.queuedTime).toISOString(),
            worker: job.worker,
            finishedReason: job.finishedReason,
            isIteration: false, // We'll need to track this differently
            baseJobId: undefined, // We'll need to track this differently
            description: "Development job",
          };

          if (includeResults && job.state === DockerJobState.Finished) {
            try {
              const finishedJob = await queue.db.getFinishedJob(job.id);
              if (finishedJob) {
                const result = await queue.db.getJobFinishedResults(job.id) as DockerRunResultWithOutputs;
                iteration.result = {
                  exitCode: result.StatusCode,
                  success: result.StatusCode === 0,
                  duration: result.duration,
                  outputFiles: Object.keys(result.outputs || {}),
                  logLines: Array.isArray(result.logs) ? result.logs.length : (result.logs ? 1 : 0),
                };
              }
            } catch (error) {
              iteration.result = { error: "Could not fetch results" };
            }
          }

          iterations.push(iteration);
        }
      }
    } catch (error) {
      console.warn(`Could not get jobs for queue ${queueName}:`, (error as Error).message);
    }
  }

  // Sort by creation time (newest first) and apply limit
  iterations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const limitedIterations = iterations.slice(0, limit);

  // Group by base job for better visualization
  const iterationGroups: { [baseJobId: string]: any[] } = {};
  const standaloneJobs: any[] = [];

  for (const iteration of limitedIterations) {
    if (iteration.baseJobId) {
      if (!iterationGroups[iteration.baseJobId]) {
        iterationGroups[iteration.baseJobId] = [];
      }
      iterationGroups[iteration.baseJobId].push(iteration);
    } else {
      standaloneJobs.push(iteration);
    }
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          namespace,
          summary: {
            totalIterations: iterations.length,
            showing: limitedIterations.length,
            iterationChains: Object.keys(iterationGroups).length,
            standaloneJobs: standaloneJobs.length,
            completedJobs: limitedIterations.filter(j => j.state === DockerJobState.Finished).length,
            successfulJobs: includeResults ? 
              limitedIterations.filter(j => j.result?.success).length : "[Set includeResults: true]",
          },
          iterationChains: Object.entries(iterationGroups).map(([baseJobId, chain]) => ({
            baseJobId,
            iterations: chain.length,
            jobs: chain,
          })),
          standaloneJobs,
          filters: { namespace, limit, includeResults },
        }, null, 2),
      },
    ],
  };
}

async function handleGetJobUrl(request: CallToolRequest): Promise<CallToolResult> {
  const { jobId, includeInputs = true, includeResults = true } = request.arguments;

  // Find the job
  let foundJob = null;
  let foundQueue = null;
  let result = null;

  for (const [queueName, queue] of Object.entries(userJobQueues)) {
    try {
      const job = await queue.db.queueJobGet({ queue: queueName, jobId });
      if (job) {
        foundJob = job;
        foundQueue = queueName;
        if (includeResults && job.state === DockerJobState.Finished) {
          try {
            const finishedJob = await queue.db.getFinishedJob(jobId);
            if (finishedJob) {
              result = await queue.db.getJobFinishedResults(jobId) as DockerRunResultWithOutputs;
            }
          } catch (error) {
            console.warn(`Could not fetch result for job ${jobId}:`, (error as Error).message);
          }
        }
        break;
      }
    } catch (error) {
      // Job not found in this queue, continue
    }
  }

  if (!foundJob) {
    throw new Error(`Job not found: ${jobId}`);
  }

  // For now, generate a simple URL - in production this might encode the job data
  // or link to a web interface
  const baseUrl = "https://container.mtfm.io"; // or use current server URL
  const jobUrl = `${baseUrl}/j/${jobId}`;
  const queueUrl = `${baseUrl}/q/${foundQueue}/j/${jobId}`;
  
  const urlData = {
    success: true,
    jobId,
    queue: foundQueue,
    urls: {
      job: jobUrl,
      queueJob: queueUrl,
      definition: `${queueUrl}/definition.json`,
      result: `${queueUrl}/result.json`,
      inputs: includeInputs ? `${queueUrl}/inputs/` : null,
      outputs: includeResults ? `${queueUrl}/outputs/` : null,
    },
    metadata: {
      state: foundJob.state,
      namespace: foundJob.namespaces?.[0] || "default",
      createdAt: new Date(foundJob.queuedTime).toISOString(),
      isIteration: false, // We'll need to track this differently
      baseJobId: undefined, // We'll need to track this differently
    },
    sharing: {
      message: "Use these URLs to access job data and share with others",
      curlExample: `curl ${queueUrl}/result.json`,
      webAccess: `Open ${jobUrl} in a browser to view job details`,
    },
  };

  if (result && includeResults) {
    urlData.result = {
      exitCode: result.StatusCode,
      success: result.StatusCode === 0,
      outputFiles: Object.keys(result.outputs || {}),
      logLines: Array.isArray(result.logs) ? result.logs.length : (result.logs ? 1 : 0),
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(urlData, null, 2),
      },
    ],
  };
}