import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";

import { config } from "../config.ts";
import { ensureSharedVolume } from "../docker/volume.ts";
import { localHandler } from "../lib/local-handler.ts";
import { connectToServer, metricsHandler } from "../lib/remote-handler.ts";
import { createHandler } from "https://deno.land/x/metapages@v0.0.27/worker/routing/handlerDeno.ts";

export const runCommand = new Command()
  .name("run")
  .arguments("<queue:string>")
  .description("Connect the worker to a queue")
  .env(
    "API_SERVER_ADDRESS=<value:string>",
    "Custom API queue server",
    {
      global: true,
      required: false,
    },
  )
  .option("-c, --cpus [cpus:number]", "Available CPU cpus", { default: 1 })
  .option(
    "-a, --api-server-address [api-server-address:string]",
    "Custom API queue server",
  )
  .option("-g, --gpus [gpus:number]", "Available GPUs", { default: 0 })
  .option("-m, --mode [mode:string]", "Mode", { default: "local" })
  .action(async (options, queue: string) => {
    const { cpus, gpus, apiServerAddress, mode } = options as {
      cpus: number;
      gpus: number;
      apiServerAddress: string;
      mode: string;
    };
    if (!queue) {
      throw "Must supply the queue id ";
    }

    config.cpus = typeof cpus === "number" ? cpus as number : 1;
    config.gpus = typeof gpus === "number" ? gpus as number : 0;
    config.queue = queue;
    if (apiServerAddress) {
      config.server = apiServerAddress;
    }
    config.mode = mode;

    console.log(
      "run %s mode %s with cpus=%s gpu=%s at server %s",
      config.queue,
      config.mode,
      config.cpus,
      config.gpus,
      config.server,
    );
    await ensureSharedVolume();
    if (config.mode === "local") {
      // Create a request handler that can handle both HTTP and WebSocket
      const requestHandler = createHandler(localHandler);

      Deno.serve({
        port: 8000,
        onError: (e: unknown) => {
          console.error(e);
          return Response.error();
        },
        onListen: ({ hostname, port }) => {
          console.log(
            `🚀 Local mode listening on hostname=${hostname} port=${port}`,
          );
        },
      }, requestHandler);
    } else {
      connectToServer({
        server: config.server || "",
        queueId: queue,
        cpus,
        gpus,
        workerId: config.id,
      });
      console.log("Metrics accessible at: http://localhost:8000/metrics");
      Deno.serve({ port: 8000 }, metricsHandler);
    }
  });
