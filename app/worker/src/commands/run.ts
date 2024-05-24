import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';
import ReconnectingWebSocket from 'npm:reconnecting-websocket@4.4.0';

import {
  BroadcastState,
  WebsocketMessage,
  WebsocketMessageSender,
  WebsocketMessageType,
} from '../../../shared/src/shared/types.ts';
import { config } from '../config.ts';
import {
  DockerJobQueue,
  DockerJobQueueArgs,
} from '../queue/DockerJobQueue.ts';

/**
 * Connect via websocket to the API server, and attach the DockerJobQueue object
 * TODO: listen to multiple job queues?
 */
export async function connectToServer(args:{server:string, queueId:string, cpus:number, workerId:string}) {
  const { server, queueId, cpus, workerId } = args;

  console.log('CLI:', args);

  

  // @ts-ignore: frustrating cannot get compiler "default" import setup working
  const url = `${server.replace('http', 'ws')}/worker/${queueId}`;
  console.log(`🪐 connecting... ${url}`)
  // @ts-ignore: frustrating cannot get compiler "default" import setup working
  const rws = new ReconnectingWebSocket(url, []);

  const sender: WebsocketMessageSender = (message: WebsocketMessage) => {
    rws.send(JSON.stringify(message));
  }

  let timeLastPong = Date.now();
  let timeLastPing = Date.now();

  const dockerJobQueueArgs: DockerJobQueueArgs = { sender, cpus, id: workerId };
  const dockerJobQueue = new DockerJobQueue(dockerJobQueueArgs);

  rws.addEventListener('error', (error: any) => {
    console.log(`error=${error.message}`);
  });

  rws.addEventListener('open', () => {
    console.log(`🚀 connected! ${url} `)
    rws.send('PING');
    timeLastPing = Date.now();
    dockerJobQueue.register();
  });

  rws.addEventListener('close', () => {
    console.log(`💥🚀💥 disconnected! ${url}`)
  });

  rws.addEventListener('message', (message: MessageEvent) => {
    try {
      const messageString = message.data.toString();
      if (messageString === 'PONG') {
        timeLastPong = Date.now();

        // wait a bit then send a ping
        setTimeout(() => {
          if ((Date.now() - timeLastPing) >= 5000) {
            rws.send('PING');
            timeLastPing = Date.now();
          }
          setTimeout(() => {
            if ((Date.now() - timeLastPong) >= 10000 && rws.readyState === rws.OPEN) {
              console.log(`Reconnecting because no PONG since ${Date.now() - timeLastPong}ms `);
              rws.reconnect();
            }
          }, 10000);
        }, 5000);

        return;
      }

      if (!messageString.startsWith('{')) {
        console.log('message not JSON')
        return;
      }
      const possibleMessage: WebsocketMessage = JSON.parse(messageString);
      switch (possibleMessage.type) {
        case WebsocketMessageType.State:
          const state: BroadcastState = possibleMessage.payload as BroadcastState;
          if (!state) {
            console.log({ error: 'Missing payload in message', message });
            break;
          }
          dockerJobQueue.onState(state);
          break;
        default:
        //ignored
      }
    } catch (err) {
      console.log(err);
    }
  });
}

export const runCommand = new Command()
  .name("run")
  .arguments("<queue:string>")
  .description("Connect the worker to a queue")
  .env(
    "API_SERVER_ADDRESS=<value:string>",
    "Custom API queue server",
    {
      global: true,
      required: false,
    },
  )
  .option("-c, --cores [cores:number]", "CPU cores to use", { default: 1 })
  .option("-a, --api-server-address [api-server-address:string]", "Custom API queue server")
  .option("-g, --gpu [gpu:boolean]", "Enable GPU access", { default: false })
  .action(async (options, queue: string) => {
    const { cores, gpu, apiServerAddress } = options as {cores:number, gpu:boolean, apiServerAddress:string};
    if (!queue) {
      throw 'Must supply the queue id ';
    }

    config.cpus = typeof(cores) === "number" ? cores as number : 1;
    config.gpus = gpu || false;
    config.queue = queue;
    if (apiServerAddress) {
      config.server = apiServerAddress;
    }

    console.log(
      "run %s with cores=%s gpu=%s at server %s",
      config.queue,
      config.cpus,
      config.gpus,
      config.server
    );
    // if (false) {
      connectToServer({ server: config.server || "", queueId: queue, cpus: cores || 1, workerId: config.id });
    // }
  });
