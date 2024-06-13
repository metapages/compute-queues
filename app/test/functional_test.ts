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

Deno.test(
  "pretend to be a client: submit job and get expected results",
  async () => {
    const socket = new WebSocket("ws://api1:8081/client/local1");

    const definition = {
      image: "alpine:3.18.5",
      command: "ls -la",
      // env?: Env;
      // entrypoint?: string[];
      // entrypoint?: string;
      // workdir?:string;
      // inputs?: InputsBase64String;
      // durationMax?: number;
      // gpu?: boolean;
    };
    const { message, jobId, stageChange } = await createNewContainerJobMessage({
      definition,
    });

    let {
      promise: jobCompleteDeferred,
      resolve,
      reject,
    } = Promise.withResolvers<string>();

    console.log('jobId', jobId);
    // const jobCompleteDeferred = deferred<boolean>();

    

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
      //
    };

  
    await open(socket);
    socket.send(JSON.stringify(message));
    const result = await jobCompleteDeferred;
    assertEquals(result, "total 64\ndrwxr-xr-x    1 root     root          4096 Jun 13 09:06 .\ndrwxr-xr-x    1 root     root          4096 Jun 13 09:06 ..\n-rwxr-xr-x    1 root     root             0 Jun 13 09:06 .dockerenv\ndrwxr-xr-x    2 root     root          4096 Nov 30  2023 bin\ndrwxr-xr-x    5 root     root           340 Jun 13 09:06 dev\ndrwxr-xr-x    1 root     root          4096 Jun 13 09:06 etc\ndrwxr-xr-x    2 root     root          4096 Nov 30  2023 home\ndrwxrwxrwx    2 root     root            64 Jun 13 09:06 inputs\ndrwxr-xr-x    7 root     root          4096 Nov 30  2023 lib\ndrwxr-xr-x    5 root     root          4096 Nov 30  2023 media\ndrwxr-xr-x    2 root     root          4096 Nov 30  2023 mnt\ndrwxr-xr-x    2 root     root          4096 Nov 30  2023 opt\ndrwxrwxrwx    2 root     root            64 Jun 13 09:06 outputs\ndr-xr-xr-x  241 root     root             0 Jun 13 09:06 proc\ndrwx------    2 root     root          4096 Nov 30  2023 root\ndrwxr-xr-x    2 root     root          4096 Nov 30  2023 run\ndrwxr-xr-x    2 root     root          4096 Nov 30  2023 sbin\ndrwxr-xr-x    2 root     root          4096 Nov 30  2023 srv\ndr-xr-xr-x   11 root     root             0 Jun 13 09:06 sys\ndrwxrwxrwt    2 root     root          4096 Nov 30  2023 tmp\ndrwxr-xr-x    7 root     root          4096 Nov 30  2023 usr\ndrwxr-xr-x   12 root     root          4096 Nov 30  2023 var\n");
  
    socket.close();
    await closed(socket);
  }
);
