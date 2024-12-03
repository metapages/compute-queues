// For serving metrics endpoint and WebSocket server
import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';
import { ms } from 'ms';
import ReconnectingWebSocket from 'npm:reconnecting-websocket@4.4.0';

import mod from '../../mod.json' with { type: 'json' };
import { config } from '../config.ts';
import { ensureSharedVolume } from '../docker/volume.ts';
import { clearCache } from '../queue/dockerImage.ts';
import {
  DockerJobQueue,
  DockerJobQueueArgs,
} from '../queue/DockerJobQueue.ts';
import {
  DockerJobState,
  BroadcastJobStates,
  JobStates,
  PayloadClearJobCache,
  WebsocketMessageSenderWorker,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
  WebsocketMessageTypeWorkerToServer,
  WebsocketMessageWorkerToServer,
} from "/@/shared";

const VERSION: string = mod.version;

let jobList: JobStates = { jobs: {} };

/**
 * Connect via websocket to the API server, and attach the DockerJobQueue object
 * TODO: listen to multiple job queues?
 */
export function connectToServer(args: { server: string; queueId: string; cpus: number; gpus: number; workerId: string }) {
  const { server, queueId, cpus, gpus, workerId } = args;

  console.log('CLI:', args);

  // @ts-ignore: frustrating cannot get compiler "default" import setup working
  const url = `${server.replace('http', 'ws')}/${queueId}/worker`;
  console.log(`🪐 connecting... ${url}`);
  // @ts-ignore: frustrating cannot get compiler "default" import setup working
  const rws = new ReconnectingWebSocket(url, [], {
    maxReconnectionDelay: 10000,
    minReconnectionDelay: 1000 + Math.random() * 4000,
    reconnectionDelayGrowFactor: 1.3,
    minUptime: 5000,
    // connectionTimeout: 4000,
    connectionTimeout: 6000,
    maxRetries: Infinity,
    maxEnqueuedMessages: Infinity,
    // debug: true,
  });

  const sender: WebsocketMessageSenderWorker = (message: WebsocketMessageWorkerToServer) => {
    rws.send(JSON.stringify(message));
  };

  let timeLastPong = Date.now();
  let timeLastPing = Date.now();

  const dockerJobQueueArgs: DockerJobQueueArgs = { sender, cpus, gpus, id: workerId, version: VERSION, time: Date.now() };
  const dockerJobQueue = new DockerJobQueue(dockerJobQueueArgs);

  rws.addEventListener('error', (error: Error) => {
    console.log(`Websocket error=${error.message}`);
  });

  rws.addEventListener('open', () => {
    console.log(`🚀 connected! ${url} `);
    rws.send('PING');
    timeLastPing = Date.now();
    dockerJobQueue.register();
  });

  rws.addEventListener('close', () => {
    console.log(`💥🚀💥 disconnected! ${url}`);
  });

  const intervalSinceNoTrafficToTriggerReconnect = ms('15s') as number;
  setInterval(() => {
    if (Date.now() - timeLastPong >= intervalSinceNoTrafficToTriggerReconnect && rws.readyState === rws.OPEN) {
      console.log(`Reconnecting because no PONG since ${(Date.now() - timeLastPong) / 1000}s `);
      rws.reconnect();
    }
  }, ms('2s') as number);

  rws.addEventListener('message', (message: MessageEvent) => {
    try {
      const messageString = message.data.toString();

      if (messageString === 'PONG') {
        timeLastPong = Date.now();

        // wait a bit then send a ping
        setTimeout(() => {
          rws.send('PING');
          timeLastPing = Date.now();
        }, 5000);

        return;
      }

      if (!messageString.startsWith('{')) {
        console.log('message not JSON');
        return;
      }
      // console.log('message', messageString);
      const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(messageString);
      switch (possibleMessage.type) {
        // definitive list of jobs
        case WebsocketMessageTypeServerBroadcast.JobStates: {
          const allJobsStatesPayload = possibleMessage.payload as BroadcastJobStates;
          jobList = allJobsStatesPayload.state;
          break;
        }
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates: {
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            console.log({ error: 'Missing payload in message', possibleMessage });
            break;
          }
          dockerJobQueue.onUpdateUpdateASubsetOfJobs(someJobsPayload);
          break;
        }
        case WebsocketMessageTypeServerBroadcast.StatusRequest: {
          const status = dockerJobQueue.status();
          sender({
            type: WebsocketMessageTypeWorkerToServer.WorkerStatusResponse,
            payload: status,
          });
          break;
        }
        case WebsocketMessageTypeServerBroadcast.ClearJobCache: {
          const clearJobCacheConfirm = possibleMessage.payload as PayloadClearJobCache;
          console.log(`[${clearJobCacheConfirm.jobId?.substring(0, 6)}] 🗑️ deleting docker images`);
          if (clearJobCacheConfirm?.definition?.build) {
            void clearCache({ build: clearJobCacheConfirm.definition.build });
          }
          break;
        }
        default:
          // ignored
          break;
      }
    } catch (err) {
      console.log(err);
    }
  });
}

/**
 * HTTP handler for metrics and WebSockets
 */
function httpHandler({ queueId, cpus, gpus, workerId, serveWebsockets }: { 
  queueId: string; 
  cpus: number; 
  gpus: number; 
  workerId: string;
  serveWebsockets: boolean;
}) {
  return (req: Request): Response | Promise<Response> => {
    const url = new URL(req.url);
    const { pathname } = url;

    // Handle metrics endpoint
    if (pathname === '/metrics') {
      const unfinishedJobs = Object.values(jobList.jobs).filter((job) => job.state !== DockerJobState.Finished);
      const unfinishedQueueLength = unfinishedJobs.length;
      const response = `
# HELP queue_length The number of outstanding jobs in the queue
# TYPE queue_length gauge
queue_length ${unfinishedQueueLength}
`;
      return new Response(response, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }

    // Handle WebSocket upgrade
    // [TODO] implement logic
    if (serveWebsockets) {
      const upgrade = req.headers.get('upgrade') || '';
      if (upgrade.toLowerCase() === 'websocket') {
        const { socket, response } = Deno.upgradeWebSocket(req);
        socket.onopen = () => console.log('WebSocket connection opened');
        socket.onmessage = (event) => {
          if (typeof event.data === 'string') {
            event.data === 'PING' ? socket.send('PONG') : console.log(`Received message: ${event.data}`);
          }
        };
        socket.onclose = () => console.log('WebSocket connection closed');
        socket.onerror = (e) => console.log('WebSocket error:', e);
        return response;
      }
    }

    // We don't serve anything else
    return new Response('Not Found', { status: 404 });
  };
}

export const runCommand = new Command()
  .name('run')
  .arguments('<queue:string>')
  .description('Connect the worker to a queue')
  .env('API_SERVER_ADDRESS=<value:string>', 'Custom API queue server', {
    global: true,
    required: false,
  })
  .option('-c, --cpus [cpus:number]', 'Available CPU cpus', { default: 1 })
  .option('-a, --api-server-address [api-server-address:string]', 'Custom API queue server')
  .option('-g, --gpus [gpus:number]', 'Available GPUs', { default: 0 })
  .option('-m, --mode [mode:string]', 'Run mode', { default: "remote" })
  .action(async (options, queue: string) => {
    const { cpus, gpus, apiServerAddress, mode } = options as {
      cpus: number;
      gpus: number;
      apiServerAddress: string;
      mode: string;
    };
    if (!queue) {
      throw 'Must supply the queue id ';
    }
  
    config.cpus = typeof cpus === 'number' ? cpus : 1;
    config.gpus = typeof gpus === 'number' ? gpus : 0;
    config.queue = queue;
    config.mode = mode === "local" ? "local" : "remote";
    if (apiServerAddress) {
      config.server = apiServerAddress;
    }
  
    console.log(
      'run %s with cpus=%s gpu=%s mode=%s at server %s',
      config.queue,
      config.cpus,
      config.gpus,
      config.mode,
      config.server
    );
    await ensureSharedVolume();
  
    if (config.mode === "local") {
      console.log('Running in local mode');
      console.log('Metrics and WebSocket server accessible at: http://localhost:8000');
    } else {
      connectToServer({ server: config.server || '', queueId: queue, cpus, gpus, workerId: config.id });
      console.log('Metrics accessible at: http://localhost:8000/metrics');
    }

    Deno.serve({ port: 8000 }, httpHandler({ 
      queueId: queue,
      cpus,
      gpus,
      workerId: config.id,
      serveWebsockets: config.mode === "local"
    }));
  });
