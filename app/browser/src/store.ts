import { create } from 'zustand';

import { getFinishedJob } from './cache';
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
  DockerJobDefinitionMetadata,
  WebsocketMessageServerBroadcast,
} from './shared/types';

const _cachedMessages: any[] = [];

export const cacheInsteadOfSendMessages = (
  message: WebsocketMessageClientToServer
) => {
  _cachedMessages.push(message);
}

interface MainStore {

  newJobDefinition: DockerJobDefinitionMetadata | undefined;
  setNewJobDefinition: (job:DockerJobDefinitionMetadata) => void;

  sendClientStateChange: (payload: StateChange) => Promise<void>;
  // clientStateChange: StateChange | undefined;

  jobStates: JobsStateMap;
  setJobStates: (jobStates: JobsStateMap) => void;

  workers : BroadcastWorkers|undefined;
  setWorkers: (workers: BroadcastWorkers) => void;

  isServerConnected : boolean;
  setIsServerConnected: (isServerConnected: boolean) => void;

  /** Sends the websocket message to the API server */
  sendMessage :WebsocketMessageSenderClient;
  setSendMessage: (sendMessage: WebsocketMessageSenderClient) => void;

  /** Sends the websocket message to the API server */
  rawMessage :WebsocketMessageServerBroadcast | undefined;
  setRawMessage: (rawMessage: WebsocketMessageServerBroadcast) => void;
}

export const useStore = create<MainStore>((set, get) => ({
  
  // Stores the latest job definition + inputs
  newJobDefinition: undefined,
  setNewJobDefinition: (job:DockerJobDefinitionMetadata) => {
    set((state) => ({ newJobDefinition: job }));
  },

  // This tells the server connection to send, but we check for
  // cached jobs first
  sendClientStateChange: async (clientStateChange: StateChange) => {
    // check if it's queued and an existing finished job exists.
    // If so, set the job state to finished, with the cached finished state
    // This means the state change doesn't reach the server+worker
    if (clientStateChange.state === DockerJobState.Queued) {
      const queueState = clientStateChange.value as StateChangeValueQueued;
      const existingFinishedJob = await getFinishedJob(clientStateChange.job);
      if (existingFinishedJob) {
        console.log(`✅ 🐼 Found existing finished job for ${clientStateChange.job}`)
        const currentJobStates = get().jobStates;
        const newJobStates = {...currentJobStates, [clientStateChange.job]:existingFinishedJob}
        set((state) => ({ jobStates: newJobStates }));
        return;
      }
      
    }
    // otherwise, just send the state change
    get().sendMessage({
      type: WebsocketMessageTypeClientToServer.StateChange,
      payload: clientStateChange,
    });
  },

  jobStates: {},
  setJobStates: (jobStates: JobsStateMap) => {
    // blind merge update
    const currentJobStates = get().jobStates;
    const newJobStates = {...currentJobStates, ...jobStates}
    set((state) => ({ jobStates: newJobStates }));
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
  sendMessage :(
    message: WebsocketMessageClientToServer
  ) => {
    console.log(`❔ CACHING:`, message)
    _cachedMessages.push(message);
  },
  setSendMessage: (sendMessage: WebsocketMessageSenderClient) => {
    // Send the cached messages
    while(_cachedMessages.length > 0) {
      console.log(`❔ 💘 SENDING CACHed:`, _cachedMessages[0]);
      sendMessage(_cachedMessages.shift());
    }
    set((state) => ({ sendMessage }));
  },

  rawMessage: undefined,
  setRawMessage: (rawMessage: WebsocketMessageServerBroadcast) => {
    set((state) => ({ rawMessage }));
  },
}));
