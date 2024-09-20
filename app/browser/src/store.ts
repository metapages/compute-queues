import pDebounce from 'p-debounce';
import { create } from 'zustand';

import {
  getHashParamValueJsonFromWindow,
  setHashParamJsonInWindow,
} from '@metapages/hash-query';

import {
  deleteFinishedJob,
  getFinishedJob,
} from './cache';
import {
  BroadcastWorkers,
  DockerJobState,
  JobsStateMap,
  StateChange,
  StateChangeValueQueued,
  WebsocketMessageClientToServer,
  WebsocketMessageSenderClient,
  WebsocketMessageTypeClientToServer,
} from './shared';
import {
  ConsoleLogLine,
  DockerJobDefinitionMetadata,
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  JobStatusPayload,
  StateChangeValueWorkerFinished,
  WebsocketMessageServerBroadcast,
} from './shared/types';

const _cachedMessages: any[] = [];

export const cacheInsteadOfSendMessages = (
  message: WebsocketMessageClientToServer
) => {
  _cachedMessages.push(message);
};

interface MainStore {
  /**
   * When the client creates a new job, it goes here.
   * This is NOT from the server
   */
  newJobDefinition: DockerJobDefinitionMetadata | undefined;
  setNewJobDefinition: (job: DockerJobDefinitionMetadata) => void;
  submitJob: () => void;

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
    set((state) => ({ userClickedRun }));
  },

  // Stores the latest job definition + inputs
  newJobDefinition: undefined,
  setNewJobDefinition: async (job: DockerJobDefinitionMetadata) => {
    // Update the local job hash (id) on change
    if (!job) {
      set((state) => ({
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
      set((state) => ({
        jobState: get().jobStates[job.hash],
      }));
      return;
    }

    // new job definition!: update the jobId, and reset the logs
    set((state) => ({
      newJobDefinition: job,
      jobState: get().jobStates[job.hash],
      buildLogs: null,
      runLogs: null,
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

  jobState: undefined,
  setJobState: (jobState: DockerJobDefinitionRow | undefined) => {
    set((state) => ({ jobState }));
    if (
      jobState?.state === DockerJobState.Queued ||
      jobState?.state === DockerJobState.ReQueued
    ) {
      set((state) => ({
        buildLogs: null,
        runLogs: null,
      }));
    } else if (jobState?.state === DockerJobState.Finished) {
      // if the job is finished, logs come from the result
      // not the cached streaming logs
      const resultFinished = jobState?.value as StateChangeValueWorkerFinished;
      set((state) => ({
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
    console.log('sendClientStateChange',  clientStateChange)
    if (clientStateChange.state === DockerJobState.Queued) {
      const queueState = clientStateChange.value as StateChangeValueQueued;
      const existingFinishedJob = await getFinishedJob(clientStateChange.job);
      if (existingFinishedJob) {
        console.log(
          `✅ 🐼 Found existing finished job for ${clientStateChange.job}`
        );
        const currentJobStates = get().jobStates;
        const newJobStates = {
          ...currentJobStates,
          [clientStateChange.job]: existingFinishedJob,
        };
        get().setJobStates(newJobStates);
        // set((state) => ({ jobStates: newJobStates }));
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
    }
    get().sendClientStateChange(stateChange);
  },

  resubmitJob: () => {
    const jobState = get().jobState;
    if (!jobState) {
      return;
    }
    get().setJobState(undefined);
    // delete the finished job from the local cache
    deleteFinishedJob(jobState.hash);
    const messageClientToServer: WebsocketMessageClientToServer = {
      type: WebsocketMessageTypeClientToServer.ResubmitJob,
      payload: {
        jobId: jobState.hash,
      }
    }
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
    }
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
    set((state) => ({ jobStates: newJobStates }));
    get().setJobState(serverJobState);

    // Set the job state(s) from the server
  },

  workers: undefined,
  setWorkers: (workers: BroadcastWorkers) => {
    set((state) => ({ workers }));
  },

  isServerConnected: false,
  setIsServerConnected: (isServerConnected: boolean) => {
    set((state) => ({ isServerConnected }));
  },

  // the initial sendMessage just caches the messages to send later
  sendMessage: (message: WebsocketMessageClientToServer) => {
    console.log(`❔ CACHING:`, message);
    _cachedMessages.push(message);
  },
  setSendMessage: (sendMessage: WebsocketMessageSenderClient) => {
    // Send the cached messages
    while (_cachedMessages.length > 0) {
      console.log(`❔ 💘 SENDING CACHed:`, _cachedMessages[0]);
      sendMessage(_cachedMessages.shift());
    }
    set((state) => ({ sendMessage }));
  },

  rawMessage: undefined,
  setRawMessage: (rawMessage: WebsocketMessageServerBroadcast) => {
    set((state) => ({ rawMessage }));
  },

  buildLogs: null,
  setBuildLogs: (logs: ConsoleLogLine[] | null) => {
    set((state) => ({ buildLogs: logs }));
  },
  appendBuildLogs: (logs: ConsoleLogLine[] | null) => {
    if (!logs || logs.length === 0) {
      return;
    }
    set((state) => ({ buildLogs: [...(get().buildLogs || []), ...logs] }));
  },

  runLogs: null,
  setRunLogs: (logs: ConsoleLogLine[] | null) => {
    set((state) => ({ runLogs: logs }));
  },
  appendRunLogs: (logs: ConsoleLogLine[] | null) => {
    if (!logs || logs.length === 0) {
      return;
    }
    set((state) => ({ runLogs: [...(get().runLogs || []), ...logs] }));
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
    set((state) => ({ rightPanelContext }));
  },
  rightPanelContext: null,

  mainInputFile: null,
  setMainInputFile: (mainInputFile: string | null) => {
    set((state) => ({ mainInputFile }));
  },

  mainInputFileContent: null,
  setMainInputFileContent: (mainInputFileContent: string | null) => {
    set((state) => ({ mainInputFileContent }));
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
    const inputs:Record<string,string> = getHashParamValueJsonFromWindow('inputs') || {};
    inputs[get().mainInputFile] = get().mainInputFileContent;
    setHashParamJsonInWindow('inputs', inputs);
    get().setMainInputFileContent(null);
  }

}));

