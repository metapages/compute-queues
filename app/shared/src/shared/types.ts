
// represents a way of getting a blob of data (inputs/outputs)
export enum DataRefType {
    base64 = "base64", //default, value is a base64 encoded bytes
    url = "url", // request the data at this URL
    utf8 = "utf8",
    json = "json",
    // Inline = "inline", // string or JSON as the actual final input/output data. binary is hard here, so use others when needed
    hash = "hash", // the internal system can get this data blob given the hash address (stored in the value)
}

export const DataRefTypeDefault = DataRefType.utf8;

export type DataRef<T=string> = {
    value: T;
    hash?: string;
    type?: DataRefType;
}

export type Image = string;
export type Command = string;
export type Env = { [name in string]: string } | undefined;
export type InputsRefs = { [name in string]: DataRef };
// values are base64 encoded buffers
export type InputsBase64String = { [name in string]: string };

// inputs values are base64 encoded strings
export type DockerJobDefinitionInputsBase64 = {
    // the docker image OR git repository URL
    image: Image;
    command?: Command;
    env?: Env;
    // entrypoint?: string[];
    entrypoint?: string;
    workdir?:string;
    inputs?: InputsBase64String;
    durationMax?: number;
    gpu?: boolean;
}

// as soon as the DockerJobDefinition hits the server, it is converted
// immediately to this version, otherwise big lumps in the inputs will
// completely clog up the data pipes. Stay small out there, definitions,
// you're the living entities flowing
export type DockerJobDefinitionInputRefs = Omit<DockerJobDefinitionInputsBase64, "inputs"> & {
    inputs?: InputsRefs;
}

export interface DockerRunResultWithOutputs {
    StatusCode?: number;
    stdout?: string[];
    stderr?: string[];
    error?: any;
    outputs :InputsRefs;
}

export enum DockerJobState {
    CloningRepo = "CloningRepo",
    DownloadingImage = "DownloadingImage",
    Building = "Building",
    Queued = "Queued",
    ReQueued = "ReQueued",
    Running = "Running",
    Finished = "Finished",
}

export enum DockerJobFinishedReason {
    Cancelled = "Cancelled",
    TimedOut = "TimedOut",
    Success = "Success",
    Error = "Error",
    WorkerLost = "WorkerLost",
}

// export type DockerJobStateValue = StateChangeValueQueuedFromBrowser | StateChangeValueQueuedInternal | StateChangeValueRunning | StateChangeValueWorkerFinished;
export type DockerJobStateValue = StateChangeValueQueued | StateChangeValueReQueued | StateChangeValueRunning | StateChangeValueWorkerFinished;

export interface StateChange {
    // 'id' implies permanence, and you should never delete it
    // 'tag' can be changed, when a driver for the state machine
    // updates or takes over another processes control of the fsm process
    tag: string;
    state: DockerJobState;
    job: string;
    value: DockerJobStateValue
}

export interface StateChangeValueQueued {
    definition: DockerJobDefinitionInputRefs;
    time: Date;
    nocache?:boolean;
}

export interface StateChangeValueReQueued {
    time: Date;
}

export interface StateChangeValueRunning {
    worker: string;
    time: Date;
}

export interface StateChangeValueWorkerFinished {
    result?: DockerRunResultWithOutputs;
    reason: DockerJobFinishedReason;
    worker?: string;
    time: Date;
}

export interface DockerJobDefinitionRow {
    // hash of the definition.
    hash: string;
    definition: DockerJobDefinitionInputRefs;
    state: DockerJobState;
    value: DockerJobStateValue;
    history: StateChange[];
}

export type StateMap = { [id in string]: DockerJobDefinitionRow };

export interface State {
    jobs: StateMap;
}

export interface BroadcastState {
    state: State;
    workers: WorkerRegistration[];
    version: number;
    browsers: number;
}

export interface WorkerRegistration {
    id: string;
    cpus: number;
}

export enum WebsocketMessageType {
    State = "State",
    StateChange = "StateChange",
    Logs = "Logs",
    WorkerRegistration = "WorkerRegistration",
}

export type LogMessage = [string, string];

export interface WebsocketMessage {
    type: WebsocketMessageType;
    payload: BroadcastState | StateChange | LogMessage | WorkerRegistration;
}

export type WebsocketMessageSender = (message: WebsocketMessage) => void;
