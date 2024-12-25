export type IsStdErr = boolean;
export type ConsoleLogLine = [string, number, IsStdErr] | [string, number];

export type JobInputs = { [key: string]: string };

// represents a way of getting a blob of data (inputs/outputs)
export enum DataRefType {
  base64 = "base64", //default, value is a base64 encoded bytes
  url = "url", // request the data at this URL
  utf8 = "utf8",
  json = "json",
  // the internal system can get this data blob given the key address (stored in the value)
  // this is typically the sha256 hash of the data
  key = "key",
}

const DataRefTypeKeys: string[] = Object.keys(DataRefType).filter((key) =>
  isNaN(Number(key))
);
export const DataRefTypesSet: Set<string> = new Set(DataRefTypeKeys);
export const DataRefTypeDefault = DataRefType.utf8;

export type DataRef<T = string> = {
  value: T;
  type?: DataRefType;
  hash?: string;
};

export const isDataRef = (value: unknown): boolean => {
  return !!(
    value &&
    typeof value === "object" &&
    (value as DataRef)?.type &&
    DataRefTypesSet.has((value as DataRef).type!) &&
    (value as DataRef)?.value
  );
};

export type Image = string;
export type Command = string;
export type Env = { [name in string]: string } | undefined;
export type InputsRefs = { [name in string]: DataRef };
// values are base64 encoded buffers
export type InputsBase64String = { [name in string]: string };

export type DockerJobImageBuild = {
  context?: string;
  filename?: string;
  target?: string;
  // An actual Dockerfile content
  dockerfile?: string;
  buildArgs?: string[];
};

// inputs values are base64 encoded strings
export type DockerJobDefinitionInputsBase64V1 = {
  // version, incrementing
  v?: number;
  // the docker image OR git repository URL
  image?: Image;
  // docker image build configuration
  build?: DockerJobImageBuild;
  // docker command
  command?: Command;
  // docker env vars, not currently implemented on the client
  env?: Env;
  // entrypoint?: string[];
  entrypoint?: string;
  workdir?: string;
  // https://docs.docker.com/engine/containers/run/#user-memory-constraints
  shmSize?: string;

  // these are dynamic
  inputs?: InputsBase64String;
  // these are fixed and part of the job sha
  configFiles?: InputsBase64String;
  durationMax?: number;
  gpu?: boolean;
};

// as soon as the DockerJobDefinition hits the server, it is converted
// immediately to this version, otherwise big lumps in the inputs will
// completely clog up the data pipes. Stay small out there, definitions,
// you're the living entities flowing
export type DockerJobDefinitionInputRefs =
  & Omit<DockerJobDefinitionInputsBase64V1, "inputs" | "configFiles">
  & {
    inputs?: InputsRefs;
    configFiles?: InputsRefs;
  };

export interface DockerRunResult {
  StatusCode?: number;
  logs: ConsoleLogLine[];
  // eslint-disable-next-line
  error?: unknown;
}

export interface DockerRunResultWithOutputs extends DockerRunResult {
  outputs: InputsRefs;
}

/**
 * Think very hard and carefully before adding a new state.
 * There is a lot of power in keeping this part simple.
 */
export enum DockerJobState {
  Queued = "Queued",
  ReQueued = "ReQueued",
  Running = "Running",
  Finished = "Finished",
}

/**
 * Add as many as needed to help anyone understand why a job finished
 */
export enum DockerJobFinishedReason {
  Cancelled = "Cancelled",
  TimedOut = "TimedOut",
  Success = "Success",
  Error = "Error",
  WorkerLost = "WorkerLost",
  JobReplacedByClient = "JobReplacedByClient",
}

export type DockerJobStateValue =
  | StateChangeValueQueued
  | StateChangeValueReQueued
  | StateChangeValueRunning
  | StateChangeValueFinished;

export interface StateChange {
  // 'id' implies permanence, and you should never delete it
  // 'tag' can be changed, when a driver for the state machine
  // updates or takes over another processes control of the fsm process
  tag: string;
  state: DockerJobState;
  job: string;
  value: DockerJobStateValue;
}
/**
 * This state change contains the job definition.
 * This means history is recoverable.
 */
export interface StateChangeValueQueued {
  definition: DockerJobDefinitionInputRefs;
  time: number;
  debug?: boolean;
  // the client that submitted the job
  // if there are multiple jobs from the same source,
  // only the most recent one is kept, all others are killed
  // TODO: handle the edge case where two different sources
  // submit the exact same job definition. In that case, just
  // don't kill the job unless you add a record of claimed jobs
  // A ttl simple record would do here.
  source?: string;
}

export interface StateChangeValueReQueued {
  time: number;
}

export interface StateChangeValueRunning {
  worker: string;
  time: number;
}

export interface StateChangeValueFinished {
  result?: DockerRunResultWithOutputs;
  reason: DockerJobFinishedReason;
  worker?: string;
  time: number;
}

export interface DockerJobDefinitionRow {
  // hash of the definition.
  hash: string;
  state: DockerJobState;
  value: DockerJobStateValue;
  history: StateChange[];
}

export const isDockerJobDefinitionRowFinished = (
  row: DockerJobDefinitionRow,
): boolean => {
  return row.state === DockerJobState.Finished;
};

export const getFinishedJobState = (
  row: DockerJobDefinitionRow,
): StateChangeValueFinished | undefined => {
  if (isDockerJobDefinitionRowFinished(row)) {
    return row.value as StateChangeValueFinished;
  }
};

// export type JobsStateMap = { [id in string]: DockerJobDefinitionRow };
export type JobsStateMap = Record<string, DockerJobDefinitionRow>;

export interface JobStates {
  jobs: JobsStateMap;
}

export interface WorkerRegistration {
  version: string;
  id: string;
  cpus: number;
  gpus: number;
  time: number;
}

export interface WorkerStatusResponse {
  time: number;
  id: string;
  cpus: number;
  gpus: number;
  queue: Record<string, { jobId: string; finished: boolean }>;
}

export interface JobStatusPayload {
  jobId: string;
  step:
    | "docker image pull"
    | "cloning repo"
    | "docker build"
    | `${DockerJobState.Running}`
    | "docker image push";
  logs: ConsoleLogLine[];
}

export interface InstanceRegistration {
  instances: {
    id: string;
  }[];
}

/**
 * These are all the messsages types the worker sends to the api server
 */
export enum WebsocketMessageTypeWorkerToServer {
  StateChange = "StateChange",
  WorkerRegistration = "WorkerRegistration",
  WorkerStatusResponse = "WorkerStatusResponse",
  JobStatusLogs = "JobStatusLogs",
}
export interface WebsocketMessageWorkerToServer {
  type: WebsocketMessageTypeWorkerToServer;
  payload:
    | StateChange
    | WorkerRegistration
    | WorkerStatusResponse
    | JobStatusPayload;
}
export type WebsocketMessageSenderWorker = (
  message: WebsocketMessageWorkerToServer,
) => void;

/**
 * These are all the messsages types the (browser) clients send to the api server
 */
export enum WebsocketMessageTypeClientToServer {
  StateChange = "StateChange",
  ClearJobCache = "ClearJobCache",
  ResubmitJob = "ResubmitJob",
  QueryJob = "QueryJob",
}
export interface PayloadClearJobCache {
  jobId: string;
  // why do we need the definition here?
  definition: DockerJobDefinitionInputRefs;
}

export interface PayloadResubmitJob {
  jobId: string;
  // send the definition again, so we can update the state
  // with the new definition (that may have changed the content (presigned URLS)
  // that do not alter the hash (job id) )
  definition: DockerJobDefinitionInputRefs;
}

export interface PayloadClearJobCacheConfirm {
  jobId: string;
}

export interface PayloadClearJobOnWorker {
  jobId: string;
}

export interface PayloadQueryJob {
  jobId: string;
}

export interface WebsocketMessageClientToServer {
  type: WebsocketMessageTypeClientToServer;
  payload:
    | StateChange
    | PayloadClearJobCache
    | PayloadResubmitJob
    | PayloadQueryJob;
}
export type WebsocketMessageSenderClient = (
  message: WebsocketMessageClientToServer,
) => void;

/**
 * These are all the messsages types the server sends to:
 *   - the (browser) clients
 *   - the workers
 */
export enum WebsocketMessageTypeServerBroadcast {
  // All jobs in the queue
  JobStates = "JobStates",
  // Updated jobs, not declarative of the entire queue
  JobStateUpdates = "JobStateUpdates",
  // logs from the worker
  JobStatusPayload = "JobStatusPayload",
  Workers = "Workers",
  StatusRequest = "StatusRequest",
  // Only the worker listens to this
  ClearJobCache = "ClearJobCache",
  ClearJobCacheConfirm = "ClearJobCacheConfirm",
}
export interface WebsocketMessageServerBroadcast {
  type: WebsocketMessageTypeServerBroadcast;
  payload:
    | BroadcastJobStates
    | BroadcastJobs
    | BroadcastWorkers
    | BroadcastStatusRequest
    | PayloadClearJobCacheConfirm
    | PayloadClearJobCache
    | JobStatusPayload;
}
/**
 * The job states, not the jobs themselves
 */
export interface BroadcastJobStates {
  isSubset?: boolean;
  state: JobStates;
}
/**
 * This doesn't contain the states, just the job definitions
 * These are just stored, the states are handled separately
 * to minimize the amount of data sent over the wire
 */
export interface BroadcastJobs {
  jobs: { [key: string]: DockerJobDefinitionInputRefs };
}
/**
 * Let everyone know how many workers and their resources
 */
export interface BroadcastWorkers {
  workers: WorkerRegistration[];
}

export type BroadcastStatusRequest = undefined;

/************************************************************
 * Client specific
 ************************************************************/

export type DockerJobDefinitionParamsInUrlHash = Omit<
  DockerJobDefinitionInputRefs,
  "inputs" | "configInputs"
>;

// this is the actual job definition consumed by the workers
export interface DockerJobDefinitionMetadata {
  hash: string;
  definition: DockerJobDefinitionInputRefs;
  debug?: boolean;
  source?: string;
}

/************************************************************
 * End Client specific
 ************************************************************/

/**
 * Only Finished jobs can have the cached state deleted
 * Queued or Running jobs should not be deleted
 * @param state
 * @returns
 */
export const isJobCacheAllowedToBeDeleted = (state: StateChange): boolean => {
  // This is duplicated (search for it, turn into function)
  switch (state.state) {
    case DockerJobState.Queued:
    case DockerJobState.ReQueued:
    case DockerJobState.Running:
      // not touching the job since it's active. Finish it first.
      return false;
    case DockerJobState.Finished:
      return true;
    default:
      return false;
  }
};

export type DockerApiDeviceRequest = {
  Driver: string;
  Count?: number;
  DeviceIDs?: string[];
  Capabilities: string[][];
};
