import {
  DockerJobDefinitionInputRefs,
  DockerJobState,
  StateChange,
  StateChangeValueQueued,
  WebsocketMessageClientToServer,
  WebsocketMessageTypeClientToServer,
} from './types.ts';
import { shaObject } from './util.ts';

export const createNewContainerJobMessage = async (opts: {
  definition: DockerJobDefinitionInputRefs;
  nocache?: boolean;
  jobId?: string;
}) :Promise<{message:WebsocketMessageClientToServer, jobId:string, stageChange:StateChange}> => {
  let { definition, nocache, jobId } = opts;
  const value: StateChangeValueQueued = {
    definition,
    nocache,
    time: new Date(),
  };
  if (!jobId) {
    jobId = await shaObject(definition);
  }
  const payload: StateChange = {
    state: DockerJobState.Queued,
    value,
    job: jobId,
    tag: "",
  };

  const message: WebsocketMessageClientToServer = {
    payload,
    type: WebsocketMessageTypeClientToServer.StateChange,
  };
  return {message, jobId, stageChange:payload};
};
