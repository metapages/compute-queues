import { config } from "/@/config.ts";
import { ensureSharedVolume } from "/@/docker/volume.ts";
import { localHandler } from "/@/lib/local-handler.ts";
import { clearCache } from "/@/queue/dockerImage.ts";
import { DockerJobQueue, type DockerJobQueueArgs } from "/@/queue/index.ts";
import { Command } from "cliffy/command";
import { ms } from "ms";
import ReconnectingWebSocket from "reconnecting-websocket";
import { ensureDir } from "std/fs";
import { join } from "std/path";

import {
  type BroadcastJobStates,
  type PayloadClearJobCache,
  type WebsocketMessageSenderWorker,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
  WebsocketMessageTypeWorkerToServer,
  type WebsocketMessageWorkerToServer,
} from "@metapages/compute-queues-shared";

import mod from "../../mod.json" with { type: "json" };

const VERSION: string = mod.version;

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
    port: number;
  },
) {
  const { server, queueId, cpus, gpus, workerId, port } = args;

  console.log("CLI:", args);

  const url = config.mode === "local"
    ? `ws://localhost:${port}/${queueId}/worker`
    : `${server.replace("http", "ws")}/${queueId}/worker`;

  // @ts-ignore: frustrating cannot get compiler "default" import setup working
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

export const runCommand = new Command()
  .name("run")
  .arguments("[queue:string]")
  .description("Connect the worker to a queue")
  .env(
    "API_SERVER_ADDRESS=<value:string>",
    "Custom API queue server",
    {
      global: true,
      required: false,
    },
  )
  .option("-c, --cpus [cpus:number]", "Available CPU cpus")
  .option(
    "-a, --api-server-address [api-server-address:string]",
    "Custom API queue server",
  )
  .option("-g, --gpus [gpus:number]", "Available GPUs")
  .option("-m, --mode [mode:string]", "Mode")
  .option("-p, --port [port:number]", "Port number")
  .option(
    "-d, --data-directory [dataDirectory:string]",
    "Data directory",
  )
  .option("--id [id:string]", "Custom worker ID")
  .action(async (options, queue?: string) => {
    const {
      cpus,
      gpus,
      apiServerAddress,
      mode,
      port,
      dataDirectory,
      id,
    } = options as {
      cpus: number;
      gpus: number;
      apiServerAddress: string;
      mode: string;
      port: number;
      dataDirectory: string;
      id: string;
    };

    config.cpus = typeof cpus === "number" ? cpus : config.cpus;
    config.gpus = typeof gpus === "number" ? gpus : config.gpus;
    config.id = typeof id === "string" ? id : config.id;
    config.mode = typeof mode === "string" ? mode : config.mode;
    config.queue = config.mode === "local"
      ? "local"
      : typeof queue === "string"
      ? queue
      : config.queue;

    if (!config.queue && config.mode === "remote") {
      throw new Error("Remote mode: must supply the queue id");
    }
    config.port = typeof port === "number" ? port : config.port;
    config.dataDirectory = join(
      dataDirectory || config.dataDirectory,
      config.mode,
    );

    if (config.mode === "local") {
      Deno.env.set("DENO_KV_URL", join(config.dataDirectory, "kv"));
    }

    config.server = apiServerAddress ?? config.server;

    if (config.mode === "local") {
      config.server = config.server || `http://localhost:${config.port}`;

      console.log(
        "run %s mode %s with cpus=%s gpu=%s at server %s dataDirectory=%s port=%s",
        config.queue,
        config.mode,
        config.cpus,
        config.gpus,
        config.server,
        config.dataDirectory,
        config.port,
      );

      await ensureSharedVolume();
      console.log("✅ shared volume");

      const cacheDir = join(config.dataDirectory, "cache");
      await ensureDir(config.dataDirectory);
      await ensureDir(cacheDir);
      await Deno.chmod(config.dataDirectory, 0o777);
      await Deno.chmod(cacheDir, 0o777);
      console.log("✅ data directory");

      Deno.serve(
        {
          port: config.port,
          onError: (e: unknown) => {
            console.error(e);
            return new Response("Internal Server Error", { status: 500 });
          },
          onListen: ({ hostname, port }) => {
            console.log(
              `🚀 Local mode listening on hostname=${hostname} port=${port}`,
            );

            // Once the server is listening, establish the connection
            connectToServer({
              server: config.server,
              queueId: config.queue,
              cpus: config.cpus,
              gpus: config.gpus,
              workerId: config.id,
              port: config.port,
            });
          },
        },
        localHandler,
      );
    } else {
      console.log(
        "run %s mode %s with cpus=%s gpu=%s at server %s",
        config.queue,
        config.mode,
        config.cpus,
        config.gpus,
        config.dataDirectory,
        config.server,
      );

      await ensureSharedVolume();

      connectToServer({
        server: config.mode === "local"
          // ? `http://localhost:${config.port}`
          ? `http://0.0.0.0:${config.port}`
          : config.server,
        queueId: config.queue,
        cpus: config.cpus,
        gpus: config.gpus,
        workerId: config.id,
        port: config.port,
      });
    }
  });
