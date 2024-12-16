import { ms } from "ms";
import ReconnectingWebSocket from "npm:reconnecting-websocket@4.4.0";

import mod from "../../mod.json" with { type: "json" };
import { clearCache } from "../queue/dockerImage.ts";
import { DockerJobQueue, DockerJobQueueArgs } from "../queue/DockerJobQueue.ts";
import {
  BroadcastJobStates,
  DockerJobState,
  JobStates,
  PayloadClearJobCache,
  WebsocketMessageSenderWorker,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
  WebsocketMessageTypeWorkerToServer,
  WebsocketMessageWorkerToServer,
} from "/@/shared";

const VERSION: string = mod.version;

let jobList: JobStates = { jobs: {} };

// Create a simple HTTP server
export const metricsHandler = (req: Request): Response => {
  const url = new URL(req.url);
  // Route the metrics endpoint
  if (url.pathname === "/metrics") {
    const unfinishedJobs = Object.values(jobList.jobs).filter((job) =>
      job.state !== DockerJobState.Finished
    );
    const unfinishedQueueLength = unfinishedJobs.length;
    // Simple Prometheus-compatible metric response
    const response = `
# HELP queue_length The number of outstanding jobs in the queue
# TYPE queue_length gauge
queue_length ${unfinishedQueueLength}
`;
    return new Response(response, {
      status: 200,
      headers: {
        "content-type": "text/plain",
      },
    });
  }

  // We don't serve anything else
  return new Response("Not Found", { status: 404 });
};

/**
 * Connect via websocket to the API server, and attach the DockerJobQueue object
 * TODO: listen to multiple job queues?
 */
export function connectToServer(
  args: {
    server: string;
    queueId: string;
    cpus: number;
    gpus: number;
    workerId: string;
  },
) {
  const { server, queueId, cpus, gpus, workerId } = args;

  console.log("CLI:", args);

  // @ts-ignore: frustrating cannot get compiler "default" import setup working
  const url = `${server.replace("http", "ws")}/${queueId}/worker`;
  console.log(`🪐 connecting... ${url}`);
  // @ts-ignore: frustrating cannot get compiler "default" import setup working
  const rws = new ReconnectingWebSocket(url, [], {
    maxReconnectionDelay: 10000,
    minReconnectionDelay: 1000 + Math.random() * 4000,
    reconnectionDelayGrowFactor: 1.3,
    minUptime: 5000,
    // connectionTimeout: 4000,
    connectionTimeout: 6000,
    maxRetries: Infinity,
    maxEnqueuedMessages: Infinity,
    // debug: true,
  });
  const sender: WebsocketMessageSenderWorker = (
    message: WebsocketMessageWorkerToServer,
  ) => {
    rws.send(JSON.stringify(message));
  };

  let timeLastPong = Date.now();
  let _timeLastPing = Date.now();

  const dockerJobQueueArgs: DockerJobQueueArgs = {
    sender,
    cpus,
    gpus,
    id: workerId,
    version: VERSION,
    time: Date.now(),
  };
  const dockerJobQueue = new DockerJobQueue(dockerJobQueueArgs);

  rws.addEventListener("error", (error: Error) => {
    console.log(`Websocket error=${error.message}`);
  });

  rws.addEventListener("open", () => {
    console.log(`🚀 connected! ${url} `);
    rws.send("PING");
    _timeLastPing = Date.now();
    dockerJobQueue.register();
  });

  rws.addEventListener("close", () => {
    console.log(`💥🚀💥 disconnected! ${url}`);
  });
  const intervalSinceNoTrafficToTriggerReconnect = ms("15s") as number;
  setInterval(() => {
    if (
      (Date.now() - timeLastPong) >= intervalSinceNoTrafficToTriggerReconnect &&
      rws.readyState === rws.OPEN
    ) {
      console.log(
        `Reconnecting because no PONG since ${
          (Date.now() - timeLastPong) / 1000
        }s `,
      );
      rws.reconnect();
    }
  }, ms("2s") as number);

  rws.addEventListener("message", (message: MessageEvent) => {
    try {
      const messageString = message.data.toString();

      if (messageString === "PONG") {
        timeLastPong = Date.now();

        // wait a bit then send a ping
        setTimeout(() => {
          rws.send("PING");
          _timeLastPing = Date.now();
        }, 5000);

        return;
      }

      if (!messageString.startsWith("{")) {
        console.log("message not JSON");
        return;
      }
      // console.log('message', messageString);
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
        messageString,
      );
      switch (possibleMessage.type) {
        // definitive list of jobs
        case WebsocketMessageTypeServerBroadcast.JobStates: {
          const allJobsStatesPayload = possibleMessage
            .payload as BroadcastJobStates;
          jobList = allJobsStatesPayload.state;
          if (!allJobsStatesPayload) {
            console.log({
              error: "Missing payload in message",
              possibleMessage,
            });
            break;
          }
          dockerJobQueue.onUpdateSetAllJobStates(allJobsStatesPayload);
          break;
        }
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates: {
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            console.log({
              error: "Missing payload in message",
              possibleMessage,
            });
            break;
          }
          dockerJobQueue.onUpdateUpdateASubsetOfJobs(someJobsPayload);
          break;
        }
        case WebsocketMessageTypeServerBroadcast.StatusRequest: {
          const status = dockerJobQueue.status();
          sender({
            type: WebsocketMessageTypeWorkerToServer.WorkerStatusResponse,
            payload: status,
          });
          break;
        }
        case WebsocketMessageTypeServerBroadcast.ClearJobCache: {
          const clearJobCacheConfirm = possibleMessage
            .payload as PayloadClearJobCache;
          console.log(
            `[${
              clearJobCacheConfirm.jobId?.substring(0, 6)
            }] 🗑️ deleting docker images`,
          );
          if (clearJobCacheConfirm?.definition?.build) {
            clearCache({ build: clearJobCacheConfirm.definition.build });
          }
          break;
        }
        default: {
          //ignored
          break;
        }
      }
    } catch (err) {
      console.log(err);
    }
  });
}
