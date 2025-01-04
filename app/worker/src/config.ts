import machineId from "deno-machine-id";

export const VERSION: string = "0.2.0";
const MACHINE_ID: string = await machineId();

export interface Arguments {
  // This is a proxy for the number of jobs, since currently, jobs
  // are not prevented from claiming as many cpu cpus as they want.
  cpus: number;
  server: string;
  // version?: Boolean;
  queue: string;
  id: string;
  // This is the most GPUs this worker will claim.
  // https://docs.docker.com/engine/containers/resource_constraints/#gpu
  gpus: number;
  // Currently "remote" (default) and "local" modes are supported.
  mode: string;
  port: number;
  dataDirectory: string;
}

/**
 * Global configuration for the worker.
 * Too much effort passing this around in functions, this is truly global
 * configuration, set once at the start of the program.
 */
export const config: Arguments = {
  cpus: 1, //cpus: { type: Number, alias: 'c', description: 'Number of CPUs allowed (default 1)', defaultValue: 1 },
  server: "https://container.mtfm.io", // { type: String, alias: 's', description: `Custom server (default: https://container.mtfm.io)`, optional: true, defaultValue: "https://container.mtfm.io" },
  queue: "", //{ type: String, alias: 'q', description: 'Queue id. Browser links to this queue ' },
  id: MACHINE_ID, //{ type: String, alias: 'i', description: `Worker Id (default:${MACHINE_ID})`, defaultValue: MACHINE_ID },
  gpus: 0, //{ type: Number, alias: 'g', description: `Enable "--gpus all" flag if the job requests and the worker supports`, optional: true },
  mode: "remote", //{ type: String, alias: 'm', description: `Mode (default: remote)`, optional: true },
  port: 8000, //{ type: Number, alias: 'p', description: `Port (default: 8000)`, optional: true },
  dataDirectory: "/tmp/worker-metapage-io", //{ type: String, alias: 'd', description: `Data directory (default: /tmp/worker-metapage-io)`, optional: true },
};

export const getConfig = (): Arguments => {
  return config;
};
