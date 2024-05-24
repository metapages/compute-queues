import machineId from 'https://deno.land/x/deno_machine_id@1.0.0/mod.ts';

export const VERSION: string = "0.2.0";
const MACHINE_ID: string = await machineId();

export interface Arguments {
    cpus: number;
    server?: string;
    // version?: Boolean;
    queue: string;
    id: string;
    gpus?: Boolean;
}
/**
 * Global configuration for the worker.
 * Too much effort passing this around in functions, this is truly global
 * configuration, set once at the start of the program.
 */
export const config :Arguments = {
    cpus: 1, //cpus: { type: Number, alias: 'c', description: 'Number of CPUs allowed (default 1)', defaultValue: 1 },
    server: "https://docker-metapage-io.glitch.me",
    // server: "https://docker-metapage-io.glitch.me", // { type: String, alias: 's', description: `Custom server (default: https://docker-metapage-io.glitch.me)`, optional: true, defaultValue: "https://docker-metapage-io.glitch.me" },
    queue: "", //{ type: String, alias: 'q', description: 'Queue id. Browser links to this queue ' },
    // version: VERSION, //{ type: Boolean, alias: 'v', description: 'Print version', optional: true },
    id: MACHINE_ID, //{ type: String, alias: 'i', description: `Worker Id (default:${MACHINE_ID})`, defaultValue: MACHINE_ID },
    gpus: false, //{ type: Boolean, alias: 'g', description: `Enable "--gpus all" flag if the job requests and the worker supports`, optional: true },
};
