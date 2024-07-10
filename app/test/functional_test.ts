import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  closed,
  open,
} from '@korkje/wsi';

import {
  BroadcastJobStates,
  DockerJobState,
  StateChangeValueWorkerFinished,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from '../shared/src/mod.ts';
import { createNewContainerJobMessage } from '../shared/src/shared/jobtools.ts';

const API_URL = Deno.env.get("API_URL") || "http://api1:8081";
console.log('API_URL', API_URL);

Deno.test(
  "pretend to be a client: submit job and get expected results",
  async () => {
    const socket = new WebSocket(`${API_URL.replace("http", "ws")}/local1/client`);

    const definition = {
      image: "alpine:3.18.5",
      command: "ls -a",
    };
    const { message, jobId, stageChange } = await createNewContainerJobMessage({
      definition,
    });

    let {
      promise: jobCompleteDeferred,
      resolve,
      reject,
    } = Promise.withResolvers<string>();

    socket.onmessage = (message: MessageEvent) => {
      const messageString = message.data.toString();
      const possibleMessage: WebsocketMessageServerBroadcast =
        JSON.parse(messageString);
      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            break;
            }
          const jobState = someJobsPayload.state.jobs[jobId];
          if (!jobState) {
            break;
          }
          if (jobState.state === DockerJobState.Finished) {
            const finishedState = jobState.value as StateChangeValueWorkerFinished;
            const lines :string = finishedState.result?.stdout?.[0]!;
            resolve(lines);
            
          }
          break;
        default:
          //ignored
      }
    };

    
    console.log(`opening the socket to the API server...`)
    await open(socket);
    console.log(`...socket opened. Sending message...`, message);
    socket.send(JSON.stringify(message));
    console.log(`...awaiting job to finish`);
    const result = await jobCompleteDeferred;
    assertEquals(result, ".\n..\n.dockerenv\nbin\ndev\netc\nhome\ninputs\nlib\nmedia\nmnt\nopt\noutputs\nproc\nroot\nrun\nsbin\nsrv\nsys\ntmp\nusr\nvar\n");
  
    socket.close();
    await closed(socket);
  }
);


Deno.test(
  "submit multiple jobs and get expected results",
  async () => {
    const socket = new WebSocket(`${API_URL.replace("http", "ws")}/local1/client`);

    const definitions = Array.from(Array(10).keys()).map((i) => ({
      
        image: "alpine:3.18.5",
        command: `echo ${Math.random()}`,
      
    }));

    const jobIds  = new Set<string>();
    const jobIdsFinished  = new Set<string>();

    const messages = await Promise.all(definitions.map(async (definition) => {
      const message = await createNewContainerJobMessage({
        definition,
      });
      jobIds.add(message.jobId);
      return message;
    }));


    const promises = messages.map((_) => (Promise.withResolvers<string>()));

    socket.onmessage = (message: MessageEvent) => {
      const messageString = message.data.toString();
      const possibleMessage: WebsocketMessageServerBroadcast =
        JSON.parse(messageString);
      switch (possibleMessage.type) {
        case WebsocketMessageTypeServerBroadcast.JobStates:
        case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
          const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
          if (!someJobsPayload) {
            break;
          }
          jobIds.forEach((jobId) => {
            const jobState = someJobsPayload.state.jobs[jobId];
            if (!jobState) {
              return;
            }
            if (jobState.state === DockerJobState.Finished) {
              const finishedState = jobState.value as StateChangeValueWorkerFinished;
              const lines :string = finishedState.result?.stdout?.[0]!;
              const i = messages.findIndex((m) => m.jobId === jobId);
              if (!jobIdsFinished.has(jobId)) {
                promises[i]?.resolve(lines.trim());
                jobIdsFinished.add(jobId);
              }
            }
          });
          break;
        default:
          //ignored
      }
    };

    
    console.log(`opening the socket to the API server...`)
    await open(socket);
    console.log(`...socket opened. Sending messages...`);
    for(const { message } of messages) {
      socket.send(JSON.stringify(message));
    }
    
    console.log(`...awaiting jobs to finish`);
    const results = await Promise.all(promises.map((p) => p.promise));
    results.forEach((result, i) => {
      assertEquals(result, definitions[i].command.replace("echo ", ""));
    });
  
    socket.close();
    await closed(socket);
  }
);

