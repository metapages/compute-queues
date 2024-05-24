import { UserDockerJobQueue } from '../docker-jobs/UserDockerJobQueue.ts';

export interface WebsocketUrlParameters {
  token: string;
}

// in memory active queue of jobs. they're persisted to the db
// only to make this in-memory queue durable
const userJobQueues: { [id in string]: UserDockerJobQueue } = {};

export function wsHandlerBrowser(token:string, socket: WebSocket, request: Request) {
  // const server:FastifyInstanceWithDB = this as FastifyInstanceWithDB;

  try {
    console.log(`/browser/:token wsHandler`)
    
    console.log('token', token);
    if (!token || token === "" || token === 'undefined' || token === 'null') {
      console.log('No token, closing socket');
      console.log(`🐋 ws: closing and returning because invalid key: ${token}`);
      socket.close();
      return;
    }
    if (!userJobQueues[token]) {
      // TODO: hydrate queue from some kind of persistence
      userJobQueues[token] = new UserDockerJobQueue(token);
    }
    userJobQueues[token].connectBrowser({socket});
  } catch (err) {
    console.error(err);
  }
}

export function wsHandlerWorker(token:string, socket: WebSocket, request: Request) {
  try {
    console.log(`/worker/:token wsHandler`)
    // const params = request.params as WebsocketUrlParameters;
    // const token = params.token;
    console.log('token', token);
    if (!token) {
      console.log('No token, closing socket');
      socket.close();
      return;
    }
    if (!userJobQueues[token]) {
      // TODO: hydrate queue from some kind of persistence
      userJobQueues[token] = new UserDockerJobQueue(token);
    }
    userJobQueues[token].connectWorker({socket});
  } catch (err) {
    console.error(err);
  }
}
