import { config } from "/@/config.ts";

import { ms } from "ms";
import parseDuration from "parse-duration";
import ReconnectingWebSocket from "reconnecting-websocket";
import { ensureDir, existsSync } from "std/fs";
import { join } from "std/path";
import { localHandler } from "/@/lib/local-handler.ts";
import { processes, waitForDocker } from "/@/processes.ts";
import { clearCache } from "/@/queue/dockerImage.ts";
import { DockerJobQueue, type DockerJobQueueArgs } from "/@/queue/index.ts";

import { Command } from "@cliffy/command";
import {
  type BroadcastJobStates,
  type PayloadClearJobCache,
  type WebsocketMessageSenderWorker,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
  WebsocketMessageTypeWorkerToServer,
  type WebsocketMessageWorkerToServer,
} from "@metapages/compute-queues-shared";

import { getKv } from "../../../shared/src/shared/kv.ts";
import mod from "../../mod.json" with { type: "json" };
import { prepGpus, runChecksOnInterval } from "/@/docker/utils.ts";

const VERSION: string = mod.version;

const EnvPrefix = "METAPAGE_IO_";

export const runCommand = new Command()
  .name("run")
  .arguments("[queue:string]")
  .description("Connect the worker to a queue")
  .option("-c, --cpus [cpus:number]", "Available CPU cores", { default: 1 })
  .option(
    "-a, --api-address [api-address:string]",
    "Custom API queue server",
  )
  .option("-g, --gpus [gpus:number]", "Available GPUs")
  .option("-m, --mode [mode:string]", "Mode [default: remote]", {
    default: "remote",
  })
  .option("-p, --port [port:number]", "Port when mode=local", { default: 8000 })
  .option(
    "-d, --data-directory [dataDirectory:string]",
    "Data directory",
    { default: "/tmp/worker-metapage-io" },
  )
  .option("--id [id:string]", "Custom worker ID")
  .option(
    "-t, --max-job-duration [maxJobDuration:string]",
    "Maximum duration of a job. Default: 5m",
  )
  .option("--debug [debug:boolean]", "Debug mode", { default: undefined })
  .option(
    "--test-mode [testMode:boolean]",
    "Test mode: jobs are ignored by existing workers on the same host",
  )
  .action(async (options, queue?: string) => {
    const METAPAGE_IO_CPUS = Deno.env.get(`${EnvPrefix}CPUS`);
    config.cpus = typeof options.cpus === "number"
      ? options.cpus
      : (METAPAGE_IO_CPUS ? parseInt(METAPAGE_IO_CPUS) : 1);

    const METAPAGE_IO_GPUS = Deno.env.get(`${EnvPrefix}GPUS`);
    config.gpus = typeof options.gpus === "number"
      ? options.gpus
      : (METAPAGE_IO_GPUS ? parseInt(METAPAGE_IO_GPUS) : 0);

    const METAPAGE_IO_MODE = Deno.env.get(`${EnvPrefix}MODE`);
    config.mode = options.mode === "remote" || options.mode === "local"
      ? options.mode
      : (METAPAGE_IO_MODE || "remote");

    const METAPAGE_IO_QUEUE = Deno.env.get(`${EnvPrefix}QUEUE`);
    config.queue = config.mode === "local"
      ? "local"
      : queue || METAPAGE_IO_QUEUE || "";
    if (!queue && !METAPAGE_IO_QUEUE && config.mode === "remote") {
      throw new Error("Remote mode: must supply the queue id");
    }

    const METAPAGE_IO_PORT = Deno.env.get(`${EnvPrefix}PORT`);
    config.port = typeof options.port === "number"
      ? options.port
      : (METAPAGE_IO_PORT ? parseInt(METAPAGE_IO_PORT) : 8000);
    config.dataDirectory = join(
      options.dataDirectory && typeof (options.dataDirectory) === "string"
        ? options.dataDirectory
        : "/tmp/worker-metapage-io",
      config.mode,
    );

    const METAPAGE_IO_DEBUG = Deno.env.get(`${EnvPrefix}DEBUG`);
    config.debug = !!(typeof (options.debug) === "boolean"
      ? options.debug
      : METAPAGE_IO_DEBUG === "true");

    if (config.mode === "local") {
      Deno.env.set("DENO_KV_URL", join(config.dataDirectory, "kv"));
    }

    const METAPAGE_IO_API_ADDRESS = Deno.env.get(`${EnvPrefix}API_ADDRESS`);
    config.server = typeof (options.apiAddress) === "string"
      ? options.apiAddress
      : (METAPAGE_IO_API_ADDRESS ?? config.server);
    if (config.mode === "local") {
      config.server = `http://localhost:${config.port}`;
    }

    const METAPAGE_IO_JOB_MAX_DURATION = Deno.env.get(
      `${EnvPrefix}JOB_MAX_DURATION`,
    );
    const stringDuration = typeof (options.maxJobDuration) === "string"
      ? options.maxJobDuration
      : (METAPAGE_IO_JOB_MAX_DURATION || "5m");
    config.maxJobDuration = parseDuration(stringDuration) as number;

    config.testMode = !!options.testMode;

    const kv = await getKv(); //Deno.openKv(Deno.env.get("DENO_KV_URL"));
    const existingId: string | null = (await kv.get<string>(["workerId"]))
      ?.value;
    if (existingId) {
      config.id = existingId;
    } else {
      config.id = crypto.randomUUID();
      kv.set(["workerId"], config.id); // don't need to await
    }

    // If this is set, we are going to generate it every time
    if (Deno.env.get("METAPAGE_IO_GENERATE_WORKER_ID")) {
      config.id = crypto.randomUUID();
    }

    console.log(
      `Worker config: [id=%s...] [queue=%s] [mode=%s] [cpus=%s] [gpus=%s] [maxDuration=%s] [dataDirectory=%s] [api=%s] [debug=%s] ${
        config.mode === "local" ? "[port=%s]" : ""
      }`,
      config.id.substring(0, 6),
      config.queue,
      config.mode,
      config.cpus,
      config.gpus,
      stringDuration,
      config.dataDirectory,
      config.server,
      config.debug,
      config.mode === "local" ? config.port : "",
    );

    // Check if we need to run in standalone mode
    if (Deno.env.get("METAPAGE_IO_WORKER_RUN_STANDALONE") === "true") {
      console.log(
        `Standalone mode: starting dockerd`,
      );
      (async () => {
        const dockerd = new Deno.Command("dockerd", {
          args: ["-p", "/var/run/docker.pid"],
        });
        processes.dockerd = dockerd.spawn();
        const result = await processes.dockerd.output();
        console.log("dockerd exited");
        console.log(result);
      })();
    }

    await waitForDocker();
    await prepGpus(config.gpus);
    await runChecksOnInterval(config.queue);

    if (config.mode === "local") {
      const cacheDir = join(config.dataDirectory, "cache");
      await ensureDir(config.dataDirectory);
      await ensureDir(cacheDir);
      await Deno.chmod(config.dataDirectory, 0o777);
      await Deno.chmod(cacheDir, 0o777);
      console.log(
        `[mode=local] Data directory [${config.dataDirectory}] created ✅`,
      );
      console.log(`[mode=local] Cache directory [${cacheDir}] created ✅`);

      Deno.serve(
        {
          port: config.port,
          onError: (e: unknown) => {
            console.error(e);
            return new Response("Internal Server Error", { status: 500 });
          },
          onListen: ({ hostname, port }) => {
            console.log(
              `[mode=local] listening on hostname=${hostname} port=${port} 🚀 `,
            );

            // Once the server is listening, establish the connection
            connectToServer({
              server: config.server || "",
              queueId: config.queue,
              cpus: config.cpus,
              gpus: config.gpus ?? 0,
              workerId: config.id,
              port: config.port,
              maxJobDuration: stringDuration,
            });
          },
        },
        localHandler,
      );
    } else {
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
        maxJobDuration: stringDuration,
      });
    }
  });

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
    maxJobDuration: string;
  },
) {
  const { server, queueId, cpus, gpus, workerId, port, maxJobDuration } = args;

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
    maxJobDuration,
    queue: queueId,
  };
  const dockerJobQueue = new DockerJobQueue(dockerJobQueueArgs);

  wsPool.add(rws);

  rws.addEventListener("error", (error: Error) => {
    console.log(`Websocket error=${error.message}`);
  });

  rws.addEventListener("open", () => {
    console.log(`🚀 connected! ${url} `);
    rws.send("PING");
    _timeLastPing = Date.now();
    dockerJobQueue.register();
  });

  let closed = false;
  rws.addEventListener("close", () => {
    closed = true;
    wsPool.remove(rws);
    console.log(`💥🚀💥 disconnected! ${url}`);
  });
  const intervalSinceNoTrafficToTriggerReconnect = ms("15s") as number;
  const twoSeconds = ms("2s") as number;
  const reconnectCheck = () => {
    if (closed) {
      return;
    }
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
    setTimeout(reconnectCheck, twoSeconds);
  };
  setTimeout(reconnectCheck, twoSeconds);

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
        if (config.debug) {
          console.log("➡️ 📧 to worker message not JSON", messageString);
        }
        return;
      }
      if (config.debug) {
        console.log("➡️ 📧 to worker message", messageString);
      }
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

          if (clearJobCacheConfirm?.jobId) {
            const jobCacheDir = join(
              config.dataDirectory,
              clearJobCacheConfirm.jobId,
            );
            if (existsSync(jobCacheDir)) {
              try {
                console.log(
                  `[${
                    clearJobCacheConfirm.jobId?.substring(0, 6)
                  }] 🔥 deleting job cache dir ${jobCacheDir}`,
                );
                Deno.removeSync(jobCacheDir, { recursive: true });
              } catch (err) {
                console.log(
                  `Error deleting job cache dir ${jobCacheDir}: ${err}`,
                );
              }
            }
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

export class WebSocketPool {
  private static MAX_CONNECTIONS = 20000;
  private connections = new Set<WebSocket>();

  add(ws: WebSocket) {
    if (this.connections.size >= WebSocketPool.MAX_CONNECTIONS) {
      throw new Error("Maximum WebSocket connections reached");
    }
    this.connections.add(ws);

    ws.addEventListener("close", () => {
      this.connections.delete(ws);
    });
  }

  remove(ws: WebSocket) {
    this.connections.delete(ws);
  }

  closeAll() {
    for (const ws of this.connections) {
      try {
        ws.close();
      } catch (err) {
        console.error("Error closing WebSocket:", err);
      }
    }
    this.connections.clear();
  }

  get size() {
    return this.connections.size;
  }
}

const wsPool = new WebSocketPool();

// Add to app/worker/src/commands/run.ts
const cleanup = () => {
  wsPool.closeAll();
  // Close any other open resources
};

globalThis.addEventListener("unload", cleanup);
globalThis.addEventListener("beforeunload", cleanup);
