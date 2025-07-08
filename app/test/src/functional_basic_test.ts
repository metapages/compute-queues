import { assertEquals } from "std/assert";

import { closed, open } from "@korkje/wsi";
import {
  type BroadcastJobStates,
  createNewContainerJobMessage,
  type DockerJobDefinitionRow,
  DockerJobState,
  getJobColorizedString,
  type StateChangeValueFinished,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "@metapages/compute-queues-shared";

import { killAllJobs } from "./util.ts";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

Deno.test(
  "pretend to be a client: submit job and get expected results",
  async () => {
    await killAllJobs(QUEUE_ID);
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );

    const definition = {
      image: "alpine:3.18.5",
      // command: `sh -c 'sleep 1.${Math.floor(Math.random() * 10000)} && ls -a'`,
      command: "ls -a ..",
    };

    const { message, jobId /* , stageChange */ } =
      await createNewContainerJobMessage({
        definition,
      });

    const {
      promise: jobCompleteDeferred,
      resolve,
      /* reject, */
    } = Promise.withResolvers<string>();

    let jobSuccessfullySubmitted = false;
    let finalJobState: DockerJobDefinitionRow | undefined;
    socket.onmessage = (message: MessageEvent) => {
      const messageString = message.data.toString();
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
        messageString,
      );
      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates: {
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            break;
          }
          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            break;
          }
          jobSuccessfullySubmitted = true;
          if (jobState.state === DockerJobState.Finished) {
            const finishedState = jobState.value as StateChangeValueFinished;
            // console.log("🐸 [test] 📡 job finished", finishedState);
            const lines: string = finishedState.result?.logs?.map(
              (l) => l[0],
            ).join("")!;
            finalJobState = jobState;
            resolve(lines);
          }
          break;
        }
        default:
          //ignored
      }
    };

    // console.log(`opening the socket to the API server...`);
    await open(socket);
    // console.log(`...socket opened. Sending message...`, message);

    // Job submisison should confirm the job is submitted.
    // Browser clients kinda do this already by resubmitting if the job is
    // not on the results.
    while (!jobSuccessfullySubmitted) {
      // console.log(`...submitting job...`);
      socket.send(JSON.stringify(message));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // console.log(`...awaiting job to finish`);
    const result = await jobCompleteDeferred;
    const expectedResult =
      ".\n..\n.dockerenv\nbin\ndev\netc\nhome\ninputs\njob-cache\nlib\nmedia\nmnt\nopt\noutputs\nproc\nroot\nrun\nsbin\nsrv\nsys\ntmp\nusr\nvar\n";
    if (result !== expectedResult) {
      console.log(
        `${getJobColorizedString(jobId)} unexpected result 💥`,
        finalJobState,
      );
    }
    assertEquals(
      result,
      expectedResult,
    );

    socket.close();
    await closed(socket);
  },
);
