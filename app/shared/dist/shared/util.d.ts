import { DockerJobDefinitionRow } from "./types.ts";
import { DockerJobDefinitionInputRefs } from "./types.ts";
export declare const shaDockerJob: (job: DockerJobDefinitionInputRefs) => Promise<string>;
export declare const shaObject: (obj: any) => Promise<string>;
export declare const sha256Buffer: (buffer: Uint8Array) => Promise<string>;
export declare const fetchRobust: any;
/**
 * The situation here is fluid and dynamic, workers and servers and clients coming
 * and going all the time. Rather than force some rigid single source of truth, we
 * resolve conflicts and differences as they come in, and allow jobs to be requeued.
 * This means that resolving which of two jobs is the *most correct* is critical
 * and drives a lot of the rest of the dynamics.
 * At a high level:
 *  - if a job is Finished, it trumps most things
 *  - if two jobs seem the same, the one queued first is priority
 *  - other conflicts: check the time, the earliest wins
 *  - otherwise, whoever has the longest history is priority
 */
export declare const resolveMostCorrectJob: (jobA: DockerJobDefinitionRow, jobB: DockerJobDefinitionRow) => DockerJobDefinitionRow | null;
