import {
  type BroadcastJobStates,
  type DockerJobDefinitionRow,
  DockerJobState,
  finishedJobOutputsToFiles,
  type StateChangeValueFinished,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "@metapages/compute-queues-shared";
import { Command } from "@cliffy/command";
import { closed, open } from "@korkje/wsi";

export const jobAwait = new Command()
  .arguments("<queue:string> <jobId:string>")
  .description("Wait for a job on a queue to finish")
  .option(
    "-o, --outputs [outputs:string]",
    "Directory to copy output files (if any)",
    {
      default: "./outputs",
    },
  )
  .action(
    async (
      options: {
        outputs?: string | undefined | boolean;
        apiServerAddress?: string | undefined;
      },
      queue: string,
      jobId: string,
    ) => {
      const { apiServerAddress, outputs } = options;

      const address = apiServerAddress || globalThis.location.origin;
      const url = `${address}/${queue}/client`;

      const {
        promise: jobCompleteDeferred,
        resolve,
        /* reject, */
      } = Promise.withResolvers<StateChangeValueFinished>();

      const socket = new WebSocket(`${url.replace("http", "ws")}`);

      let resolved = false;
      socket.onmessage = (message: MessageEvent) => {
        if (resolved) {
          return;
        }

        const messageString = message.data.toString();
        // console.log('messageString', messageString);
        const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
          messageString,
        );
        switch (possibleMessage.type) {
          case WebsocketMessageTypeServerBroadcast.JobStates:
          case WebsocketMessageTypeServerBroadcast.JobStateUpdates: {
            const someJobsPayload = possibleMessage
              .payload as BroadcastJobStates;
            if (!someJobsPayload) {
              break;
            }
            const jobState: DockerJobDefinitionRow =
              someJobsPayload.state.jobs[jobId];
            if (!jobState) {
              break;
            }

            if (jobState.state === DockerJobState.Finished) {
              const finishedState = jobState.value as StateChangeValueFinished;
              (async () => {
                await finishedJobOutputsToFiles(
                  finishedState,
                  outputs as string,
                  address,
                );
                resolved = true;
                resolve(finishedState);
              })();
            }

            break;
          }
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
    },
  );
