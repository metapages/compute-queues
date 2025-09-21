import { assertEquals, assertExists } from "std/assert";

import { createNewContainerJobMessage, fetchRobust } from "@metapages/compute-queues-shared";
import { hasGpusAvailable } from "./gpu_utils.ts";

const fetch = fetchRobust;

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

const DISABLED = true;

Deno.test(
  "GPU verification test: simple job that checks CUDA_VISIBLE_DEVICES",
  async () => {
    const hasGpus = await hasGpusAvailable();
    if (DISABLED || !hasGpus) {
      // console.log("⏭️  Skipping GPU verification test - No GPUs detected on host system");
      console.log("⏭️  Skipping GPU allocation test - https://github.com/metapages/compute-queues/issues/283");
      return;
    }

    // Create a simple job that just checks environment variables
    // This works even without nvidia-smi or CUDA runtime
    const definition = {
      image: "alpine:3.18.5",
      command:
        `sh -c 'echo "=== GPU Environment Check ===" && echo "CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES" && echo "JOB_ID=$JOB_ID" && echo "=== End GPU Check ==="'`,
      requirements: {
        gpus: 1,
      },
    };

    const { queuedJob, jobId } = await createNewContainerJobMessage({
      definition,
    });

    assertExists(queuedJob?.enqueued, "Queued job should exist");

    // Submit the job using the EnqueueJob structure
    const submitResponse = await fetch(`${API_URL}/q/${QUEUE_ID}`, {
      method: "POST",
      body: JSON.stringify(queuedJob.enqueued),
      headers: {
        "Content-Type": "application/json",
      },
    });
    assertEquals(submitResponse.status, 200);
    const submitBody = await submitResponse.json();
    assertEquals(submitBody.success, true);
    assertExists(submitBody.jobId);

    // Wait for job to complete by polling the job status
    let jobCompleted = false;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout
    let allLogs: string[] = [];

    while (!jobCompleted && attempts < maxAttempts) {
      const jobResponse = await fetch(`${API_URL}/j/${jobId}`);
      assertEquals(jobResponse.status, 200);
      const jobData = await jobResponse.json();
      const state = jobData.data?.results?.state;
      if (state === "Finished") {
        jobCompleted = true;
        assertEquals(jobData.data.results.finishedReason, "Success");
        const finishedValue = jobData.data.results.finished;
        assertExists(finishedValue, "Finished value should exist");

        // Collect all logs
        if (finishedValue.result?.logs) {
          allLogs = finishedValue.result.logs.map((log: string[]) => log[0]);
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
      }
    }

    // Verify logs contain expected information
    assertExists(allLogs.length > 0, "Should have logs");

    // Check that CUDA_VISIBLE_DEVICES was set
    const cudaVisibleLog = allLogs.find((log) => log.includes("CUDA_VISIBLE_DEVICES"));
    assertExists(cudaVisibleLog, "Should have CUDA_VISIBLE_DEVICES log");

    // Verify CUDA_VISIBLE_DEVICES contains a valid GPU index
    const cudaMatch = cudaVisibleLog?.match(/CUDA_VISIBLE_DEVICES=(\d+)/);
    assertExists(cudaMatch, "CUDA_VISIBLE_DEVICES should contain a GPU index");

    const allocatedGpuIndex = parseInt(cudaMatch![1]);
    assertExists(allocatedGpuIndex >= 0, "GPU index should be non-negative");

    // Check that JOB_ID was also set correctly
    const jobIdLog = allLogs.find((log) => log.includes("JOB_ID="));
    assertExists(jobIdLog, "Should have JOB_ID log");
    assertExists(jobIdLog?.includes(jobId), "JOB_ID should match the job ID");

    console.log(`✅ GPU verification test passed: GPU ${allocatedGpuIndex} was allocated`);
    console.log(`📋 All logs:`, allLogs);
  },
);

// Deno.test(
//   "GPU allocation stress test: submit multiple GPU jobs and verify allocation",
//   async () => {
//     const hasGpus = await hasGpusAvailable();
//     if (!hasGpus) {
//       console.log("⏭️  Skipping GPU stress test - No GPUs detected on host system");
//       return;
//     }
//     const socket = new WebSocket(
//       `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
//     );

//     // Create multiple jobs that use GPU
//     const jobCount = 3;
//     const jobs: { jobId: string; message: unknown }[] = [];

//     for (let i = 0; i < jobCount; i++) {
//       const definition = {
//         image: "alpine:3.18.5",
//         command: `sh -c 'echo "Job${i + 1} CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES" && sleep 1'`,
//         requirements: {
//           gpus: 1,
//         },
//       };

//       const { message, jobId } = await createNewContainerJobMessage({
//         definition,
//       });

//       jobs.push({ jobId, message });
//     }

//     const {
//       promise: jobCompleteDeferred,
//       resolve,
//     } = Promise.withResolvers<string[]>();

//     let jobsSubmitted = 0;
//     let jobsFinished = 0;
//     const finalJobStates: { [key: string]: StateChangeValueFinished } = {};
//     const allLogs: { [key: string]: string[] } = {};

//     socket.onmessage = (message: MessageEvent) => {
//       const messageString = message.data.toString();
//       const parsedMessage: WebsocketMessageServerBroadcast = JSON.parse(messageString);

//       if (parsedMessage.type === WebsocketMessageTypeServerBroadcast.JobStates) {
//         const jobStates = parsedMessage.payload as BroadcastJobStates;

//         for (const { jobId } of jobs) {
//           const job = jobStates.state.jobs[jobId];
//           if (job) {
//             if (job.state === DockerJobState.Finished) {
//               const finishedValue = job.finished;
//               if (finishedValue) {
//                 finalJobStates[jobId] = finishedValue;
//                 jobsFinished++;

//                 // Collect all logs
//                 if (finishedValue.result?.logs) {
//                   allLogs[jobId] = finishedValue.result.logs.map((log) => log[0]);
//                 }
//               }
//             }
//           }
//         }

//         if (jobsFinished >= jobCount) {
//           resolve(jobs.map((j) => j.jobId));
//         }
//       }
//     };

//     await open(socket);

//     // Submit all jobs
//     for (const { message } of jobs) {
//       const response = await fetch(`${API_URL}/q/${QUEUE_ID}`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(message),
//       });

//       assertEquals(response.status, 200);
//       const submitResult = await response.json();
//       assertEquals(submitResult.success, true);
//       jobsSubmitted++;
//     }

//     // Wait for all jobs to complete
//     await jobCompleteDeferred;

//     await closed(socket);

//     // Verify all jobs finished successfully
//     assertEquals(jobsSubmitted, jobCount);
//     assertEquals(jobsFinished, jobCount);

//     const allocatedGpus: number[] = [];

//     for (const { jobId } of jobs) {
//       assertExists(finalJobStates[jobId], `Job ${jobId} should have finished`);
//       assertEquals(finalJobStates[jobId].reason, DockerJobFinishedReason.Success);

//       // Extract GPU index from logs
//       const cudaVisibleLog = allLogs[jobId]?.find((log) => log.includes("CUDA_VISIBLE_DEVICES"));
//       assertExists(cudaVisibleLog, `Job ${jobId} should have CUDA_VISIBLE_DEVICES log`);

//       const cudaMatch = cudaVisibleLog?.match(/CUDA_VISIBLE_DEVICES=(\d+)/);
//       assertExists(cudaMatch, `Job ${jobId} should have valid GPU index`);

//       const gpuIndex = parseInt(cudaMatch![1]);
//       allocatedGpus.push(gpuIndex);

//       console.log(`📋 Job ${jobId} logs:`, allLogs[jobId]);
//     }

//     console.log(`✅ GPU stress test passed: Allocated GPUs: [${allocatedGpus.join(", ")}]`);

//     // Verify that each job got a GPU (they might be the same if only one GPU is available)
//     assertEquals(allocatedGpus.length, jobCount);
//     allocatedGpus.forEach((gpuIndex) => {
//       assertExists(gpuIndex >= 0, "All GPU indices should be non-negative");
//     });
//   },
// );
