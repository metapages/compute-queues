import {
  BroadcastJobStates,
  DockerJobDefinitionRow,
  DockerJobState,
  finishedJobOutputsToFiles,
  StateChangeValueWorkerFinished,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from '/@/shared';
import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';

import {
  closed,
  open,
} from '@korkje/wsi';

export const jobAwait = new Command()
  .arguments("<queue:string> <jobId:string>")
  .description("Wait for a job on a queue to finish")
  .option("-o, --outputs [outputs:string]", "Directory to copy output files (if any)", {
    default: "./outputs",
  })
  .action(
    async (
      options: {
        outputs?: string | undefined | boolean;
        apiServerAddress?: string | undefined;
      },
      queue: string,
      jobId: string
    ) => {
      const { apiServerAddress, outputs } = options;

      const address = apiServerAddress || globalThis.location.origin;
      const url = `${address}/${queue}/client`;
      
      let {
        promise: jobCompleteDeferred,
        resolve,
        reject,
      } = Promise.withResolvers<StateChangeValueWorkerFinished>();

      const socket = new WebSocket(`${url.replace("http", "ws")}`);
  
      let resolved = false;
      socket.onmessage = (message: MessageEvent) => {
        if (resolved) {
          return;
        }

        const messageString = message.data.toString();
        // console.log('messageString', messageString);
        const possibleMessage: WebsocketMessageServerBroadcast =
          JSON.parse(messageString);
        switch (possibleMessage.type) {
          case WebsocketMessageTypeServerBroadcast.JobStates:
          case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
            const someJobsPayload = possibleMessage.payload as BroadcastJobStates;
            if (!someJobsPayload) {
              break;
              }
            const jobState :DockerJobDefinitionRow = someJobsPayload.state.jobs[jobId];
            if (!jobState) {
              break;
            }

            if (jobState.state === DockerJobState.Finished) {
              if (jobState.state === DockerJobState.Finished) {
                const finishedState = jobState.value as StateChangeValueWorkerFinished;
                (async () => {
                  await finishedJobOutputsToFiles(finishedState, outputs as string, address);
                  resolved = true;
                  resolve(finishedState);
                })();
              }
            }
            break;
          default:
            //ignored
        }
      };
  
      // console.log("Opening socket...")
      await open(socket);
      // console.log("Opened socket ✅")
      const result = await jobCompleteDeferred;
      // console.log("Job complete ✅")
      socket.close();
      await closed(socket);
      // console.log("Socket closed ✅")
      console.log(JSON.stringify(result));
    }
  );
