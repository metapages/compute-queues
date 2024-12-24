export type IsStdErr = boolean;
export type ConsoleLogLine = [string, number, IsStdErr] | [string, number];
export type JobInputs = {
    [key: string]: string;
};
export declare enum DataRefType {
    base64 = "base64",//default, value is a base64 encoded bytes
    url = "url",// request the data at this URL
    utf8 = "utf8",
    json = "json",
    key = "key"
}
export declare const DataRefTypesSet: Set<string>;
export declare const DataRefTypeDefault = DataRefType.utf8;
export type DataRef<T = string> = {
    value: T;
    type?: DataRefType;
    hash?: string;
};
export declare const isDataRef: (value: any) => boolean;
export type Image = string;
export type Command = string;
export type Env = {
    [name in string]: string;
} | undefined;
export type InputsRefs = {
    [name in string]: DataRef;
};
export type InputsBase64String = {
    [name in string]: string;
};
export type DockerJobImageBuild = {
    context?: string;
    filename?: string;
    target?: string;
    dockerfile?: string;
    buildArgs?: string[];
};
export type DockerJobDefinitionInputsBase64V1 = {
    v?: number;
    image?: Image;
    build?: DockerJobImageBuild;
    command?: Command;
    env?: Env;
    entrypoint?: string;
    workdir?: string;
    shmSize?: string;
    inputs?: InputsBase64String;
    configFiles?: InputsBase64String;
    durationMax?: number;
    gpu?: boolean;
};
export type DockerJobDefinitionInputRefs = Omit<DockerJobDefinitionInputsBase64V1, "inputs" | "configFiles"> & {
    inputs?: InputsRefs;
    configFiles?: InputsRefs;
};
export interface DockerRunResult {
    StatusCode?: number;
    logs: ConsoleLogLine[];
    error?: any;
}
export interface DockerRunResultWithOutputs extends DockerRunResult {
    outputs: InputsRefs;
}
/**
 * Think very hard and carefully before adding a new state.
 * There is a lot of power in keeping this part simple.
 */
export declare enum DockerJobState {
    Queued = "Queued",
    ReQueued = "ReQueued",
    Running = "Running",
    Finished = "Finished"
}
/**
 * Add as many as needed to help anyone understand why a job finished
 */
export declare enum DockerJobFinishedReason {
    Cancelled = "Cancelled",
    TimedOut = "TimedOut",
    Success = "Success",
    Error = "Error",
    WorkerLost = "WorkerLost",
    JobReplacedByClient = "JobReplacedByClient"
}
export type DockerJobStateValue = StateChangeValueQueued | StateChangeValueReQueued | StateChangeValueRunning | StateChangeValueFinished;
export interface StateChange {
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
    hash: string;
    state: DockerJobState;
    value: DockerJobStateValue;
    history: StateChange[];
}
export declare const isDockerJobDefinitionRowFinished: (row: DockerJobDefinitionRow) => boolean;
export declare const getFinishedJobState: (row: DockerJobDefinitionRow) => StateChangeValueFinished | undefined;
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
    queue: Record<string, {
        jobId: string;
        finished: boolean;
    }>;
}
export interface JobStatusPayload {
    jobId: string;
    step: "docker image pull" | "cloning repo" | "docker build" | `${DockerJobState.Running}` | "docker image push";
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
export declare enum WebsocketMessageTypeWorkerToServer {
    StateChange = "StateChange",
    WorkerRegistration = "WorkerRegistration",
    WorkerStatusResponse = "WorkerStatusResponse",
    JobStatusLogs = "JobStatusLogs"
}
export interface WebsocketMessageWorkerToServer {
    type: WebsocketMessageTypeWorkerToServer;
    payload: StateChange | WorkerRegistration | WorkerStatusResponse | JobStatusPayload;
}
export type WebsocketMessageSenderWorker = (message: WebsocketMessageWorkerToServer) => void;
/**
 * These are all the messsages types the (browser) clients send to the api server
 */
export declare enum WebsocketMessageTypeClientToServer {
    StateChange = "StateChange",
    ClearJobCache = "ClearJobCache",
    ResubmitJob = "ResubmitJob",
    QueryJob = "QueryJob"
}
export interface PayloadClearJobCache {
    jobId: string;
    definition: DockerJobDefinitionInputRefs;
}
export interface PayloadResubmitJob {
    jobId: string;
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
    payload: StateChange | PayloadClearJobCache | PayloadResubmitJob | PayloadQueryJob;
}
export type WebsocketMessageSenderClient = (message: WebsocketMessageClientToServer) => void;
/**
 * These are all the messsages types the server sends to:
 *   - the (browser) clients
 *   - the workers
 */
export declare enum WebsocketMessageTypeServerBroadcast {
    JobStates = "JobStates",
    JobStateUpdates = "JobStateUpdates",
    JobStatusPayload = "JobStatusPayload",
    Workers = "Workers",
    StatusRequest = "StatusRequest",
    ClearJobCache = "ClearJobCache",
    ClearJobCacheConfirm = "ClearJobCacheConfirm"
}
export interface WebsocketMessageServerBroadcast {
    type: WebsocketMessageTypeServerBroadcast;
    payload: BroadcastJobStates | BroadcastJobs | BroadcastWorkers | BroadcastStatusRequest | PayloadClearJobCacheConfirm | PayloadClearJobCache | JobStatusPayload;
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
    jobs: {
        [key: string]: DockerJobDefinitionInputRefs;
    };
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
export type DockerJobDefinitionParamsInUrlHash = Omit<DockerJobDefinitionInputRefs, "inputs" | "configInputs">;
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
export declare const isJobCacheAllowedToBeDeleted: (state: StateChange) => boolean;
export type DockerApiDeviceRequest = {
    Driver: string;
    Count?: number;
    DeviceIDs?: string[];
    Capabilities: string[][];
};
