import { config } from "/@/config.ts";

import { ms } from "ms";
import parseDuration from "parse-duration";
import humanizeDuration from "humanize-duration";
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

    if (options.id && typeof options.id === "string") {
      config.id = options.id;
    } else {
      const kv = await getKv();
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
    }

    console.log(
      `Worker config: [id=%s...] [queue=%s] [mode=%s] [cpus=%s] [gpus=%s] [maxDuration=%s] [dataDirectory=%s] [api=%s] [debug=%s] ${
        config.mode === "local" ? "[port=%s]" : ""
      }`,
      config.id.substring(0, 12),
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

    console.log("config.id", config.id);

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
    maxReconnectionDelay: 6000,
    minReconnectionDelay: 1000 + Math.random() * 4000,
    reconnectionDelayGrowFactor: 1,
    minUptime: 5000,
    // connectionTimeout: 4000,
    connectionTimeout: 6000,
    maxRetries: Infinity,
    maxEnqueuedMessages: Infinity,
    debug: config.debug,
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

  rws.addEventListener("error", (error: Error) => {
    console.log(`Websocket error=${error.message}`);
  });

  rws.addEventListener("open", () => {
    console.log(`🚀 connected! ${url} `);
    // This isn't a PING, but it's when we start measuring
    _timeLastPing = Date.now();
    dockerJobQueue.register();
  });

  // let closed = false;
  // const pingInterval =
  setInterval(() => {
    if (rws.readyState === rws.OPEN) {
      // console.log("🌳 pinging");
      rws.send("PING");
      _timeLastPing = Date.now();
      timeLastPong = Date.now();
    } else {
      console.log("🌳 🚩 pinging but not open");
    }
  }, 5000);

  rws.addEventListener("close", () => {
    // closed = true;
    // wsPool.remove(rws);
    console.log(`💥🚀💥 disconnected! ${url}`);
    // clearInterval(pingInterval);
  });
  const intervalSinceNoTrafficToTriggerReconnect = ms("10s") as number;
  const reconnectCheckInterval = ms("3s") as number;
  const reconnectCheck = () => {
    if (
      (Date.now() - timeLastPong) >= intervalSinceNoTrafficToTriggerReconnect &&
      rws.readyState === rws.OPEN
    ) {
      console.log(
        `Reconnecting because no PONG since ${
          humanizeDuration(Date.now() - timeLastPong)
        } >= ${humanizeDuration(intervalSinceNoTrafficToTriggerReconnect)}`,
      );
      rws.reconnect();
      // } else {
      //   console.log(
      //     `Not reconnecting because no PONG since ${
      //       humanizeDuration(Date.now() - timeLastPong)
      //     } < ${humanizeDuration(intervalSinceNoTrafficToTriggerReconnect)}`,
      //   );
    }
    setTimeout(reconnectCheck, reconnectCheckInterval);
  };
  setTimeout(reconnectCheck, reconnectCheckInterval);

  const logGotJobStatesEvery = 10;
  let currentGotJobStates = 0;
  let currentGotJobStateUpdates = 0;
  const logGotJobStateUpdatesEvery = 10;
  rws.addEventListener("message", (message: MessageEvent) => {
    try {
      const messageString = message.data.toString();

      if (messageString.startsWith("PONG")) {
        timeLastPong = Date.now();
        const pongedWorkerId = messageString.split(" ")[1];
        if (pongedWorkerId !== workerId) {
          console.log(
            `Server does not recognize us, registering again , sees [${pongedWorkerId}] expected [${workerId}]`,
          );
          dockerJobQueue.register();
          // } else {
          //   console.log(
          //     `🌳 ✅ PONG from server`,
          //   );
        }

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
          currentGotJobStates++;
          if (currentGotJobStates > logGotJobStatesEvery) {
            console.log(
              `[${workerId?.substring(0, 6)}] got JobStates(${
                allJobsStatesPayload?.state?.jobs?.length || 0
              }) (only logging every ${logGotJobStatesEvery} messages)`,
            );
            currentGotJobStates = 0;
          }

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

          if (currentGotJobStateUpdates > logGotJobStateUpdatesEvery) {
            console.log(
              `[${workerId?.substring(0, 6)}] got JobStateUpdates(${
                someJobsPayload?.state?.jobs?.length || 0
              })`,
            );
            currentGotJobStateUpdates = 0;
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
