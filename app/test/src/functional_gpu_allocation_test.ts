import { assertEquals, assertExists } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  type BroadcastJobStates,
  createNewContainerJobMessage,
  DockerJobFinishedReason,
  DockerJobState,
  fetchRobust,
  type StateChangeValueFinished,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "@metapages/compute-queues-shared";
import { hasGpusAvailable } from "./gpu_utils.ts";

const fetch = fetchRobust;

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

const DISABLED = true;

Deno.test(
  "GPU allocation test: verify correct GPU is allocated and visible to job",
  async () => {
    const hasGpus = await hasGpusAvailable();
    if (DISABLED || !hasGpus) {
      // console.log("⏭️  Skipping GPU allocation test - No GPUs detected on host system");
      console.log("⏭️  Skipping GPU allocation test - https://github.com/metapages/compute-queues/issues/283");
      return;
    }

    // Create a job that uses GPU and checks which GPU it can see
    const definition = {
      image: "nvidia/cuda:11.8-runtime-ubuntu20.04",
      command:
        `sh -c 'echo "CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES" && nvidia-smi --query-gpu=index,name --format=csv,noheader,nounits'`,
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
    let gpuLogs: string[] = [];

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

        // Extract GPU-related logs
        if (finishedValue.result?.logs) {
          gpuLogs = finishedValue.result.logs
            .filter((log: string[]) =>
              log[0].includes("CUDA_VISIBLE_DEVICES") ||
              log[0].includes("nvidia-smi") ||
              log[0].includes("GPU")
            )
            .map((log: string[]) => log[0]);
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
      }
    }
    // Verify GPU logs contain expected information
    assertExists(gpuLogs.length > 0, "Should have GPU-related logs");

    // Check that CUDA_VISIBLE_DEVICES was set
    const cudaVisibleLog = gpuLogs.find((log) => log.includes("CUDA_VISIBLE_DEVICES"));
    assertExists(cudaVisibleLog, "Should have CUDA_VISIBLE_DEVICES log");

    // Verify CUDA_VISIBLE_DEVICES contains a valid GPU index
    const cudaMatch = cudaVisibleLog?.match(/CUDA_VISIBLE_DEVICES=(\d+)/);
    assertExists(cudaMatch, "CUDA_VISIBLE_DEVICES should contain a GPU index");

    const allocatedGpuIndex = parseInt(cudaMatch![1]);
    assertExists(allocatedGpuIndex >= 0, "GPU index should be non-negative");

    console.log(`✅ GPU allocation test passed: GPU ${allocatedGpuIndex} was allocated and visible to job`);
    console.log(`📋 GPU logs:`, gpuLogs);
  },
);

Deno.test(
  "GPU allocation test: verify multiple jobs get different GPUs when available",
  async () => {
    const hasGpus = await hasGpusAvailable();
    if (DISABLED || !hasGpus) {
      console.log("⏭️  Skipping multi-GPU allocation test - No GPUs detected on host system");
      return;
    }
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    // Create two jobs that use GPU and check which GPU each can see
    const job1Definition = {
      image: "nvidia/cuda:11.8-runtime-ubuntu20.04",
      command: `sh -c 'echo "Job1 CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES" && sleep 2'`,
      requirements: {
        gpus: 1,
      },
    };

    const job2Definition = {
      image: "nvidia/cuda:11.8-runtime-ubuntu20.04",
      command: `sh -c 'echo "Job2 CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES" && sleep 2'`,
      requirements: {
        gpus: 1,
      },
    };

    const { message: message1, jobId: jobId1 } = await createNewContainerJobMessage({
      definition: job1Definition,
    });

    const { message: message2, jobId: jobId2 } = await createNewContainerJobMessage({
      definition: job2Definition,
    });

    const {
      promise: jobCompleteDeferred,
      resolve,
    } = Promise.withResolvers<{ jobId1: string; jobId2: string }>();

    let jobsSubmitted = 0;
    let jobsFinished = 0;
    const finalJobStates: { [key: string]: StateChangeValueFinished } = {};
    const gpuLogs: { [key: string]: string[] } = {};

    socket.onmessage = (message: MessageEvent) => {
      const messageString = message.data.toString();
      const parsedMessage: WebsocketMessageServerBroadcast = JSON.parse(messageString);

      if (parsedMessage.type === WebsocketMessageTypeServerBroadcast.JobStates) {
        const jobStates = parsedMessage.payload as BroadcastJobStates;

        for (const [jobId, job] of Object.entries(jobStates.state.jobs)) {
          if (jobId === jobId1 || jobId === jobId2) {
            if (job.state === DockerJobState.Finished) {
              const finishedValue = job.finished;
              if (finishedValue) {
                finalJobStates[jobId] = finishedValue;
                jobsFinished++;

                // Extract GPU-related logs
                if (finishedValue.result?.logs) {
                  gpuLogs[jobId] = finishedValue.result.logs
                    .filter((log) =>
                      log[0].includes("CUDA_VISIBLE_DEVICES") ||
                      log[0].includes("Job1") ||
                      log[0].includes("Job2")
                    )
                    .map((log) => log[0]);
                }
              }
            }
          }
        }

        if (jobsFinished >= 2) {
          resolve({ jobId1, jobId2 });
        }
      }
    };

    await open(socket);

    // Submit both jobs
    const response1 = await fetch(`${API_URL}/q/${QUEUE_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message1),
    });

    const response2 = await fetch(`${API_URL}/q/${QUEUE_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message2),
    });

    assertEquals(response1.status, 200);
    assertEquals(response2.status, 200);

    const submitResult1 = await response1.json();
    const submitResult2 = await response2.json();

    assertEquals(submitResult1.success, true);
    assertEquals(submitResult2.success, true);

    jobsSubmitted = 2;

    // Wait for both jobs to complete
    await jobCompleteDeferred;

    await closed(socket);

    // Verify both jobs finished successfully
    assertEquals(jobsSubmitted, 2);
    assertEquals(jobsFinished, 2);
    assertExists(finalJobStates[jobId1], "Job 1 should have finished");
    assertExists(finalJobStates[jobId2], "Job 2 should have finished");

    assertEquals(finalJobStates[jobId1].reason, DockerJobFinishedReason.Success);
    assertEquals(finalJobStates[jobId2].reason, DockerJobFinishedReason.Success);

    // Extract GPU indices from logs
    const gpu1Log = gpuLogs[jobId1]?.find((log) => log.includes("CUDA_VISIBLE_DEVICES"));
    const gpu2Log = gpuLogs[jobId2]?.find((log) => log.includes("CUDA_VISIBLE_DEVICES"));

    assertExists(gpu1Log, "Job 1 should have CUDA_VISIBLE_DEVICES log");
    assertExists(gpu2Log, "Job 2 should have CUDA_VISIBLE_DEVICES log");

    const gpu1Match = gpu1Log?.match(/CUDA_VISIBLE_DEVICES=(\d+)/);
    const gpu2Match = gpu2Log?.match(/CUDA_VISIBLE_DEVICES=(\d+)/);

    assertExists(gpu1Match, "Job 1 should have valid GPU index");
    assertExists(gpu2Match, "Job 2 should have valid GPU index");

    const gpu1Index = parseInt(gpu1Match![1]);
    const gpu2Index = parseInt(gpu2Match![1]);

    console.log(`✅ Multi-GPU test: Job 1 got GPU ${gpu1Index}, Job 2 got GPU ${gpu2Index}`);
    console.log(`📋 Job 1 logs:`, gpuLogs[jobId1]);
    console.log(`📋 Job 2 logs:`, gpuLogs[jobId2]);

    // If we have multiple GPUs available, they should get different GPUs
    // If only one GPU is available, they might get the same GPU (sequential execution)
    console.log(`ℹ️  GPU allocation: Job 1=${gpu1Index}, Job 2=${gpu2Index}`);
  },
);
