import {
  UserDockerJobQueue,
  userJobQueues,
} from '../docker-jobs/UserDockerJobQueue.ts';
import { SERVER_INSTANCE_ID } from '../util/id.ts';

export interface WebsocketUrlParameters {
  token: string;
}


export async function wsHandlerClient(token:string, socket: WebSocket, request: Request) {
  // const server:FastifyInstanceWithDB = this as FastifyInstanceWithDB;

  try {
    // console.log(`/client/:token wsHandler`)
    
    // console.log('token', token);
    if (!token || token === "" || token === 'undefined' || token === 'null') {
      console.log('No token, closing socket');
      console.log(`🐋 ws: closing and returning because invalid key: ${token}`);
      socket.close();
      return;
    }
    if (!userJobQueues[token]) {
      // TODO: hydrate queue from some kind of persistence
      // actually the queue should handle that itself
      userJobQueues[token] = new UserDockerJobQueue({serverId:SERVER_INSTANCE_ID, address:token});
      await userJobQueues[token].setup();
    }
    userJobQueues[token].connectClient({socket});
  } catch (err) {
    console.error(err);
  }
}

export async function wsHandlerWorker(token:string, socket: WebSocket, request: Request) {
  try {
    // console.log(`/worker/:token wsHandler`)
    // const params = request.params as WebsocketUrlParameters;
    // const token = params.token;
    // console.log('token', token);
    if (!token) {
      console.log('No token, closing socket');
      socket.close();
      return;
    }
    if (!userJobQueues[token]) {
      // TODO: hydrate queue from some kind of persistence
      userJobQueues[token] = new UserDockerJobQueue({serverId: SERVER_INSTANCE_ID, address:token});
      await userJobQueues[token].setup()
    }
    userJobQueues[token].connectWorker({socket});
  } catch (err) {
    console.error(err);
  }
}
