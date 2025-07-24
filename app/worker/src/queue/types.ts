import type { Container } from "dockerode";

import type {
  DockerApiDeviceRequest,
  DockerJobDefinitionInputRefs,
  DockerJobImageBuild,
  DockerRunResult,
  WebsocketMessageSenderWorker,
  WebsocketMessageWorkerToServer,
  WorkerRegistration,
} from "@metapages/compute-queues-shared";

import type { JobDefinitionCache } from "./JobDefinitionCache.ts";

export interface DockerJobQueueArgs extends WorkerRegistration {
  sender: WebsocketMessageSenderWorker;
  queue: string;
  jobDefinitions: JobDefinitionCache;
}

export enum DockerRunPhase {
  CopyInputs = "CopyInputs",
  Building = "Building",
  Running = "Running",
  UploadOutputs = "UploadOutputs",
  Ended = "Ended",
}

export type WorkerJobQueueItem = {
  phase: DockerRunPhase;
  time: number;
  execution: DockerJobExecution | null;
  definition: DockerJobDefinitionInputRefs;
  // We might have to send this multiple times, so keep it around
  runningMessageToServer: WebsocketMessageWorkerToServer;
  gpuIndices?: number[];
};

export interface Volume {
  host: string;
  container: string;
}
// this goes in
export interface DockerJobArgs {
  workItem: WorkerJobQueueItem;
  workerId: string;
  sender: WebsocketMessageSenderWorker;
  queue: string;
  id: string;
  image?: string;
  build?: DockerJobImageBuild;
  command?: string[] | undefined;
  env?: Record<string, string>;
  entrypoint?: string[] | undefined;
  workdir?: string;
  shmSize?: string;
  volumes?: Array<Volume>;
  outputsDir: string;
  deviceRequests?: DockerApiDeviceRequest[];
  // always defined, no jobs run forever
  maxJobDuration: number;
  isKilled: { value: boolean };
}

// this comes out
export interface DockerJobExecution {
  finish: Promise<DockerRunResult | undefined>;
  container: Container | undefined;
  kill: (reason: string) => void | Promise<void>;
  isKilled: { value: boolean };
}
