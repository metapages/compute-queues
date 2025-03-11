import {
  BroadcastWorkers,
  ConsoleLogLine,
  DockerJobDefinitionMetadata,
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  getFinishedJobState,
  JobsStateMap,
  JobStatusPayload,
  PayloadQueryJob,
  StateChange,
  StateChangeValueFinished,
  StateChangeValueQueued,
  WebsocketMessageClientToServer,
  WebsocketMessageSenderClient,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeClientToServer,
} from "/@shared/client";
import pDebounce from "p-debounce";
import { create } from "zustand";

import { getHashParamValueJsonFromWindow, setHashParamValueJsonInWindow } from "@metapages/hash-query";

import { deleteFinishedJob, getFinishedJob } from "./cache";
import { LogsMode } from "./components/sections/logs/DisplayLogs";

let _cachedMostRecentSubmit: WebsocketMessageClientToServer | undefined;

export const cacheInsteadOfSendMessages = (message: WebsocketMessageClientToServer) => {
  if (
    message.type === WebsocketMessageTypeClientToServer.StateChange &&
    (message.payload as StateChange).state === DockerJobState.Queued
  ) {
    _cachedMostRecentSubmit = message;
  }
};

interface MainStore {
  /**
   * When the client creates a new job, it goes here.
   * This is NOT from the server
   */
  newJobDefinition: DockerJobDefinitionMetadata | undefined;
  setNewJobDefinition: (job: DockerJobDefinitionMetadata) => void;
  submitJob: () => void;
  queryJob: () => void;

  /**
   * This is the state of our current job, sent from the server.
   */
  jobState: DockerJobDefinitionRow | undefined;
  setJobState: (job: DockerJobDefinitionRow | undefined) => void;

  /* We send the new job this way */
  sendClientStateChange: (payload: StateChange) => Promise<void>;

  /* The server sends job states, we get our current job state from this */
  jobStates: JobsStateMap;
  setJobStates: (jobStates: JobsStateMap) => void;
  cancelJob: () => void;
  deleteJobCache: () => boolean;
  resubmitJob: () => void;

  /* To display all the workers */
  workers: BroadcastWorkers | undefined;
  setWorkers: (workers: BroadcastWorkers) => void;

  isServerConnected: boolean;
  setIsServerConnected: (isServerConnected: boolean) => void;

  /** Sends the websocket message to the API server */
  sendMessage: WebsocketMessageSenderClient;
  setSendMessage: (sendMessage: WebsocketMessageSenderClient) => void;

  /** Sends the websocket message to the API server */
  rawMessage: WebsocketMessageServerBroadcast | undefined;
  setRawMessage: (rawMessage: WebsocketMessageServerBroadcast) => void;

  /**
   * Logs streamed from the build step.
   * They are not cached anywhere.
   */
  buildLogs: ConsoleLogLine[] | null;
  setBuildLogs: (logs: ConsoleLogLine[] | null) => void;
  appendBuildLogs: (logs: ConsoleLogLine[] | null) => void;

  /**
   * Logs from the run step. They are streamed live from
   * the server: the streamed logs are not cached.
   * When the job is done, you get the logs (if any)
   */
  runLogs: ConsoleLogLine[] | null;
  setRunLogs: (logs: ConsoleLogLine[] | null) => void;
  appendRunLogs: (logs: ConsoleLogLine[] | null) => void;

  handleJobStatusPayload: (status: JobStatusPayload) => void;

  setRightPanelContext: (context: string | null) => void;
  rightPanelContext: string | null;

  mainInputFile: string | null;
  setMainInputFile: (context: string | null) => void;
  mainInputFileContent: string | null;
  setMainInputFileContent: (mainInputFileContent: string | null) => void;

  saveInputFileAndRun: () => void;

  userClickedRun: boolean;
  setUserClickedRun: (userClickedRun: boolean) => void;

  copyLogsToClipboard: (mode: LogsMode) => void;
}

/**
 * This is where two complex hooks are threaded together:
 * 1. get the job definition
 * 2. send the job definition if changed
 * 3. Show the status of the current job, and allow cancelling
 * 4. If the current job is finished, send the outputs (once)
 */
export const useStore = create<MainStore>((set, get) => ({
  // This is only used to figure out if the job outputs should
  // be sent to the metaframe outputs when the metaframe starts
  // The hash param jobStartsAutomatically is also checked.
  userClickedRun: false,
  setUserClickedRun: (userClickedRun: boolean) => {
    set(() => ({ userClickedRun }));
  },

  // Stores the latest job definition + inputs
  newJobDefinition: undefined,
  setNewJobDefinition: async (job: DockerJobDefinitionMetadata) => {
    // Update the local job hash (id) on change
    if (!job) {
      set(() => ({
        newJobDefinition: undefined,
        jobState: undefined,
        jobId: undefined,
        buildLogs: null,
        runLogs: null,
      }));
      return;
    }
    if (get().newJobDefinition?.hash === job.hash) {
      // no change.
      // But we update the state anyway, in case the job state changed
      set(() => ({
        jobState: get().jobStates[job.hash],
      }));
      return;
    }

    // new job definition!: update the jobId, and reset the logs
    const finishedState = get().jobStates[job.hash] ? getFinishedJobState(get().jobStates[job.hash]) : undefined;
    set(() => ({
      newJobDefinition: job,
      jobState: get().jobStates[job.hash],
      buildLogs: null,
      runLogs: finishedState?.result?.logs || null,
    }));
  },

  submitJob: pDebounce(() => {
    const definitionBlob = get().newJobDefinition;
    if (!definitionBlob) {
      return;
    }
    // inputs are already minified (fat blobs uploaded to the cloud)
    const value: StateChangeValueQueued = {
      definition: definitionBlob.definition,
      time: Date.now(),
      control: definitionBlob.control,
    };
    if (definitionBlob.debug) {
      value.debug = true;
    }
    const payload: StateChange = {
      state: DockerJobState.Queued,
      value,
      job: definitionBlob.hash,
      tag: "", // document the meaning of this. It's the worker claim. Might be unneccesary due to history
    };
    get().sendClientStateChange(payload);
  }, 200),

  queryJob: pDebounce(() => {
    const definitionBlob = get().newJobDefinition;
    if (!definitionBlob) {
      return;
    }

    const payload: PayloadQueryJob = {
      jobId: definitionBlob.hash,
    };
    // otherwise, just send the state change
    get().sendMessage({
      type: WebsocketMessageTypeClientToServer.QueryJob,
      payload,
    });
  }, 200),

  jobState: undefined,
  setJobState: (jobState: DockerJobDefinitionRow | undefined) => {
    if (!jobState) {
      set(() => ({
        jobState: undefined,
        buildLogs: null,
        runLogs: null,
      }));
      return;
    }
    const existingJobState = get().jobState;
    if (
      existingJobState &&
      existingJobState.hash === jobState.hash &&
      existingJobState.history.length === jobState.history.length
    ) {
      return;
    }

    set(() => ({ jobState }));
    if (jobState?.state === DockerJobState.Queued || jobState?.state === DockerJobState.ReQueued) {
      set(() => ({
        buildLogs: null,
        runLogs: null,
      }));
    } else if (jobState?.state === DockerJobState.Finished) {
      // if the job is finished, logs come from the result
      // not the cached streaming logs
      const resultFinished = jobState?.value as StateChangeValueFinished;
      set(() => ({
        runLogs: resultFinished.result?.logs,
      }));
    }
  },

  // This tells the server connection to send, but we check for
  // cached jobs first
  sendClientStateChange: async (clientStateChange: StateChange) => {
    // check if it's queued and an existing finished job exists.
    // If so, set the job state to finished, with the cached finished state
    // This means the state change doesn't reach the server+worker
    if (clientStateChange.state === DockerJobState.Queued) {
      const existingFinishedJob = await getFinishedJob(clientStateChange.job);
      if (existingFinishedJob) {
        // console.log(
        //   `✅ 🐼 Found existing finished job for ${clientStateChange.job}`
        // );
        const currentJobStates = get().jobStates;
        const newJobStates = {
          ...currentJobStates,
          [clientStateChange.job]: existingFinishedJob,
        };
        get().setJobStates(newJobStates);
        return;
      }
    }
    // otherwise, just send the state change
    get().sendMessage({
      type: WebsocketMessageTypeClientToServer.StateChange,
      payload: clientStateChange,
    });
  },

  cancelJob: () => {
    const jobState = get().jobState;
    if (!jobState) {
      return;
    }
    const stateChange: StateChange = {
      tag: "",
      state: DockerJobState.Finished,
      job: jobState.hash,
      value: {
        reason: DockerJobFinishedReason.Cancelled,
        time: Date.now(),
      },
    };
    get().sendClientStateChange(stateChange);
  },

  resubmitJob: () => {
    const jobState = get().jobState;
    if (!jobState) {
      return;
    }
    if (!get().newJobDefinition?.definition) {
      return;
    }
    get().setJobState(undefined);
    // delete the finished job from the local cache
    deleteFinishedJob(jobState.hash);
    const messageClientToServer: WebsocketMessageClientToServer = {
      type: WebsocketMessageTypeClientToServer.ResubmitJob,
      payload: {
        jobId: jobState.hash,
        definition: get().newJobDefinition.definition,
      },
    };
    get().sendMessage(messageClientToServer);
  },

  deleteJobCache: () => {
    const client = get().newJobDefinition;
    if (!client?.hash) {
      return false;
    }

    // send a cancel message to the server
    const stateChange: StateChange = {
      tag: "",
      state: DockerJobState.Finished,
      job: client.hash,
      value: {
        reason: DockerJobFinishedReason.Cancelled,
        time: Date.now(),
      },
    };
    get().sendClientStateChange(stateChange);
    // delete the finished job from the local cache
    deleteFinishedJob(client.hash);
    return true;
  },

  jobStates: {},
  setJobStates: (jobStates: JobsStateMap) => {
    // blind merge update
    const currentJobStates = get().jobStates;
    const newJobStates = { ...currentJobStates, ...jobStates };

    const jobHash = get().newJobDefinition?.hash;
    const serverJobState = newJobStates[jobHash];
    set(() => ({ jobStates: newJobStates }));
    get().setJobState(serverJobState);

    // Set the job state(s) from the server
  },

  workers: undefined,
  setWorkers: (workers: BroadcastWorkers) => {
    set(() => ({ workers }));
  },

  isServerConnected: false,
  setIsServerConnected: (isServerConnected: boolean) => {
    set(() => ({ isServerConnected }));
  },

  // the initial sendMessage just caches the messages to send later
  sendMessage: cacheInsteadOfSendMessages,

  setSendMessage: (sendMessage: WebsocketMessageSenderClient) => {
    // Send the cached messages
    if (sendMessage !== cacheInsteadOfSendMessages) {
      const msg = _cachedMostRecentSubmit;
      _cachedMostRecentSubmit = undefined;
      sendMessage(msg);
    }
    set(() => ({ sendMessage }));
  },

  rawMessage: undefined,
  setRawMessage: (rawMessage: WebsocketMessageServerBroadcast) => {
    set(() => ({ rawMessage }));
  },

  buildLogs: null,
  setBuildLogs: (logs: ConsoleLogLine[] | null) => {
    set(() => ({ buildLogs: logs }));
  },
  appendBuildLogs: (logs: ConsoleLogLine[] | null) => {
    if (!logs || logs.length === 0) {
      return;
    }
    set(() => ({ buildLogs: [...(get().buildLogs || []), ...logs] }));
  },

  runLogs: null,
  setRunLogs: (logs: ConsoleLogLine[] | null) => {
    set(() => ({ runLogs: logs }));
  },
  appendRunLogs: (logs: ConsoleLogLine[] | null) => {
    if (!logs || logs.length === 0) {
      return;
    }
    set(() => ({ runLogs: [...(get().runLogs || []), ...logs] }));
  },

  handleJobStatusPayload: (status: JobStatusPayload) => {
    if (!get().jobState?.hash || get().jobState?.hash !== status?.jobId) {
      return;
    }
    switch (status.step) {
      case "docker image push":
        // TODO: do something with the push logs?
        break;
      case "docker image pull":
      case "cloning repo":
      case "docker build":
        get().appendBuildLogs(status.logs);
        break;
      case `${DockerJobState.Running}`:
        get().appendRunLogs(status.logs);
        break;
      default:
        console.error(`❌ Unknown job step:`, status.step);
        break;
    }
  },

  setRightPanelContext: (rightPanelContext: string | null) => {
    set(() => ({ rightPanelContext }));
  },
  // rightPanelContext: "editScript",
  rightPanelContext: null,

  mainInputFile: null,
  setMainInputFile: (mainInputFile: string | null) => {
    set(() => ({ mainInputFile }));
  },

  mainInputFileContent: null,
  setMainInputFileContent: (mainInputFileContent: string | null) => {
    set(() => ({ mainInputFileContent }));
  },

  saveInputFileAndRun: () => {
    if (!get().mainInputFile || !get().mainInputFileContent) {
      return;
    }
    const currentJobId = get().newJobDefinition?.hash;
    const unsubscribe = useStore.subscribe(state => {
      if (state.newJobDefinition?.hash !== currentJobId) {
        unsubscribe();
        get().submitJob();
      }
    });
    const inputs: Record<string, string> = getHashParamValueJsonFromWindow("inputs") || {};
    inputs[get().mainInputFile] = get().mainInputFileContent;
    setHashParamValueJsonInWindow("inputs", inputs);
    get().setMainInputFileContent(null);
  },

  copyLogsToClipboard: (mode: LogsMode) => {
    let logs = [];
    switch (mode) {
      case "stdout+stderr":
        logs = get().runLogs ? get().runLogs : get().buildLogs || [];
        break;
      case "stdout":
        logs = get().runLogs ? get().runLogs.filter(log => !log[2]) : get().buildLogs || [];
        break;
      case "stderr":
        logs = get().runLogs ? get().runLogs.filter(log => log[2]) : get().buildLogs || [];
        break;
      case "build":
        logs = get().buildLogs || [];
        break;
    }
    if (!logs || logs.length === 0) {
      return;
    }
    const allLogsText = logs.join("\n");
    navigator?.clipboard?.writeText(allLogsText);
  },
}));
