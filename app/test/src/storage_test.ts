import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { closed, open } from "@korkje/wsi";

import {
  BroadcastJobStates,
  dataRefToBuffer,
  DockerJobDefinitionInputRefs,
  DockerJobState,
  StateChangeValueFinished,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "../../shared/src/mod.ts";
import {
  createNewContainerJobMessage,
  fileToDataref,
} from "../../shared/src/shared/jobtools.ts";

const API_URL = Deno.env.get("API_URL") || "http://api1:8081";

Deno.test(
  "Run a job that uploads input files and validates the input",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/local1/client`,
    );

    const word = `hello${Math.floor(Math.random() * 10000)}`;
    const content = `${Array(50).fill(word).join("")}`;
    const rootName = `hello${Math.floor(Math.random() * 10000)}.txt`;
    const fileName = `/tmp/${rootName}`;

    await Deno.writeTextFile(fileName, content);

    // Install curl in case it's not available
    // Check if curl is installed first
    // Because curl is needed for uploading files (for now)
    // This could be put somewhere else but this is currently the
    // only test that needs curl (because of the upload/curl/dns/docker fiasco)
    const checkCurl = new Deno.Command("which", {
      args: ["curl"],
    });
    const checkResult = await checkCurl.output();

    if (!checkResult.success) {
      const command = new Deno.Command("apk", {
        args: ["add", "curl"],
      });
      const { success, stdout, stderr } = await command.output();
      if (!success) {
        throw new Error(
          `Failed to install curl: ${new TextDecoder().decode(stderr)}`,
        );
      }
    }

    const dataref = await fileToDataref(fileName, API_URL);

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

    let {
      promise: jobCompleteDeferred,
      resolve,
      reject,
    } = Promise.withResolvers<void>();

    socket.onmessage = async (message: MessageEvent) => {
      const messageString = message.data.toString();
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
        messageString,
      );
      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            break;
          }
          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            break;
          }
          if (jobState.state === DockerJobState.Finished) {
            const finishedState = jobState.value as StateChangeValueFinished;
            const outputs = finishedState.result?.outputs;
            const dataref = outputs?.[rootName];
            assert(!!dataref);
            assertEquals(finishedState?.reason, "Success");
            assertEquals(finishedState?.result?.error, undefined);
            const buffer = await dataRefToBuffer(dataref, API_URL);
            const contentFromJob = new TextDecoder().decode(buffer);
            assertEquals(content, contentFromJob.trim());
            resolve();
          }
          break;
        default:
          //ignored
      }
    };

    // console.log(`opening the socket to the API server...`);
    await open(socket);
    // console.log(`...socket opened. Sending message...`, message);
    socket.send(JSON.stringify(message));

    // console.log(`...awaiting job to finish`);
    const result = await jobCompleteDeferred;

    socket.close();
    await closed(socket);
  },
);

Deno.test(
  "Run a job that creates output files, downloads and checks the file",
  async () => {
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/local1/client`,
    );

    const word = `hello${Math.floor(Math.random() * 10000)}`;
    const content = `${Array(50).fill(word).join("")}`;
    const definition = {
      image: "alpine:3.18.5",
      command: `sh -c 'echo ${content} > /outputs/hello.txt'`,
    };
    const { message, jobId } = await createNewContainerJobMessage({
      definition,
    });

    let {
      promise: jobCompleteDeferred,
      resolve,
      reject,
    } = Promise.withResolvers<void>();

    socket.onmessage = async (message: MessageEvent) => {
      const messageString = message.data.toString();
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
        messageString,
      );
      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            break;
          }
          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            break;
          }
          if (jobState.state === DockerJobState.Finished) {
            const finishedState = jobState.value as StateChangeValueFinished;
            const outputs = finishedState.result?.outputs;
            const dataref = outputs?.["hello.txt"];
            assert(!!dataref);
            assertEquals(finishedState?.reason, "Success");
            assertEquals(finishedState?.result?.error, undefined);
            const buffer = await dataRefToBuffer(dataref, API_URL);
            const contentFromJob = new TextDecoder().decode(buffer);
            assertEquals(content, contentFromJob.trim());
            resolve();
          }
          break;
        default:
          //ignored
      }
    };

    // console.log(`opening the socket to the API server...`);
    await open(socket);
    // console.log(`...socket opened. Sending message...`, message);
    socket.send(JSON.stringify(message));

    // console.log(`...awaiting job to finish`);
    const result = await jobCompleteDeferred;

    socket.close();
    await closed(socket);
  },
);
