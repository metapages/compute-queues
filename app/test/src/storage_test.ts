import { assert, assertEquals } from "std/assert";

import { closed, open } from "@korkje/wsi";

import {
  type BroadcastJobStates,
  dataRefToBuffer,
  type DockerJobDefinitionInputRefs,
  DockerJobState,
  type StateChangeValueFinished,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "../../shared/src/mod.ts";
import {
  createNewContainerJobMessage,
  fileToDataref,
} from "../../shared/src/shared/jobtools.ts";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

/**
 * Helper to install `curl` if missing.
 */
async function ensureCurlInstalled() {
  // console.log("Checking if 'curl' is installed...");
  const checkCurl = new Deno.Command("which", {
    args: ["curl"],
  });
  const checkResult = await checkCurl.output();

  if (!checkResult.success) {
    console.log("'curl' not found. Installing via 'apk add curl'...");
    const installCurl = new Deno.Command("apk", {
      args: ["add", "curl"],
    });
    const { success, stderr } = await installCurl.output();
    if (!success) {
      throw new Error(
        `Failed to install curl: ${new TextDecoder().decode(stderr)}`,
      );
    }
    console.log("'curl' installed successfully.");
  } else {
    console.log("'curl' is already installed.");
  }
}

// We'll ensure curl is installed first, because we need it for fileToDataref
await ensureCurlInstalled();

/**
 * Helper that awaits the job finishing and performs assertions on the output.
 */
function waitForJobToFinish(
  socket: WebSocket,
  jobId: string,
  referenceFileName: string,
  referenceContent: string,
  onComplete: () => void,
) {
  socket.onmessage = async (event: MessageEvent) => {
    try {
      // console.log("Received message from server", event.type);
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
        event.data.toString(),
      );

      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates: {
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            // console.log("No job states in payload. Ignoring...");
            break;
          }

          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            // The broadcast is for other jobs, so ignore.
            // console.log(`No jobState found for jobId: ${jobId}. Ignoring...`);
            break;
          }

          // console.log(`JobId: ${jobId} is in state: ${jobState.state}`);

          if (jobState.state === DockerJobState.Finished) {
            const finishedState = jobState.value as StateChangeValueFinished;

            // console.log(
            //   "=== Detailed job state ===",
            //   JSON.stringify(jobState, null, 2),
            // );

            // console.log("Finished reason: ", finishedState.reason);
            // console.log("Finished error: ", finishedState.result?.error);

            assertEquals(finishedState.reason, "Success");
            // console.log("Job is finished. Performing assertions...");
            assertEquals(finishedState?.reason, "Success");
            assertEquals(finishedState?.result?.error, undefined);

            const outputs = finishedState.result?.outputs;
            const dataref = outputs?.[referenceFileName];
            assert(
              !!dataref,
              `Output file dataref for '${referenceFileName}' is missing!`,
            );

            // Download file content
            dataref.value = dataref.value.replace(
              "http://localhost:",
              "http://worker:",
            );
            const buffer = await dataRefToBuffer(dataref, API_URL);
            const contentFromJob = new TextDecoder().decode(buffer);

            // Trim because shell commands may include a trailing newline
            assertEquals(referenceContent, contentFromJob.trim());
            // console.log("Assertions passed. Resolving test...");

            onComplete();
          }

          break;
        }
        default:
          // ignored
      }
    } catch (err) {
      console.error("Error handling message from server:", err);
      throw err;
    }
  };
}

Deno.test("Test upload and download", async () => {
  const word = `hello${Math.floor(Math.random() * 10000)}`;
  const content = `${Array(50).fill(word).join("")}`;
  const rootName = `hello${Math.floor(Math.random() * 10000)}.txt`;
  const fileName = `/tmp/${rootName}`;

  await Deno.writeTextFile(fileName, content);

  const dataref = await fileToDataref(fileName, API_URL);

  // Let's test the upload then:
  const downloadUrl = dataref.value.replace(
    "http://localhost:",
    "http://worker:",
  );
  const downloadResponse = await fetch(downloadUrl);
  const downloadResponseBody = await downloadResponse.text();
  assertEquals(downloadResponseBody, content);
});

Deno.test(
  "Run a job that uploads input files and validates the input",
  async () => {
    // console.log(
    //   "Starting test: 'Run a job that uploads input files and validates the input'",
    // );

    // Generate random filenames and content
    const randomId1 = Math.floor(Math.random() * 10000);
    const word = `hello${randomId1}`;
    const content = `${Array(50).fill(word).join("")}`;

    const randomId2 = Math.floor(Math.random() * 10000);
    const rootName = `hello${randomId2}.txt`;
    const fileName = `/tmp/${rootName}`;

    // console.log(`Creating local file: ${fileName}`);
    await Deno.writeTextFile(fileName, content);

    // Upload file and get dataref
    // console.log(`Uploading file '${fileName}' to dataref...`);
    const dataref = await fileToDataref(fileName, API_URL);
    // console.log("Upload complete. Dataref:", dataref);

    const definition: DockerJobDefinitionInputRefs = {
      image: "alpine:3.18.5",
      command: `sh -c 'cp /inputs/${rootName} /outputs/${rootName}'`,
      inputs: {
        [rootName]: dataref,
      },
    };

    const { message, jobId } = await createNewContainerJobMessage({
      definition,
    });
    // console.log("Created new container job message:");

    // Create a deferred so we can await the job finishing
    const { promise: jobCompleteDeferred, resolve } = Promise.withResolvers<
      void
    >();

    // Open the socket
    // console.log("Opening websocket to server...");
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );
    await open(socket);
    // console.log("Socket opened. Sending job creation message...");

    // Wait for job to finish
    waitForJobToFinish(socket, jobId, rootName, content, resolve);

    // Send the job creation message
    socket.send(JSON.stringify(message));
    // console.log("Job creation message sent. Waiting for job to finish...");

    // Wait for the job
    await jobCompleteDeferred;

    // console.log("Job completed. Closing socket...");
    socket.close();
    await closed(socket);

    // console.log(
    //   "Test 'Run a job that uploads input files and validates the input' completed.\n",
    // );
  },
);

Deno.test(
  "Run a job that creates output files, downloads and checks the file",
  async () => {
    // console.log(
    //   "Starting test: 'Run a job that creates output files, downloads and checks the file'",
    // );

    // Generate random content
    const randomId = Math.floor(Math.random() * 10000);
    const word = `hello${randomId}`;
    const content = `${Array(50).fill(word).join("")}`;

    const definition = {
      image: "alpine:3.18.5",
      command: `sh -c 'echo ${content} > /outputs/hello.txt'`,
    };

    const { message, jobId } = await createNewContainerJobMessage({
      definition,
    });
    // console.log("Created new container job message:");

    // Create a deferred so we can await the job finishing
    const { promise: jobCompleteDeferred, resolve } = Promise.withResolvers<
      void
    >();

    // Open the socket
    // console.log("Opening websocket to server...");
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );
    await open(socket);
    // console.log("Socket opened. Sending job creation message...");

    // Wait for job to finish
    waitForJobToFinish(socket, jobId, "hello.txt", content, resolve);

    // Send the job creation message
    socket.send(JSON.stringify(message));
    // console.log("Job creation message sent. Waiting for job to finish...");

    // Wait for the job
    await jobCompleteDeferred;

    // console.log("Job completed. Closing socket...");
    socket.close();
    await closed(socket);

    // console.log(
    //   "Test 'Run a job that creates output files, downloads and checks the file' completed.\n",
    // );
  },
);
