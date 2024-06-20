import {
  BroadcastJobStates,
  createNewContainerJobMessage,
  DockerJobDefinitionInputRefs,
  DockerJobDefinitionRow,
  DockerJobState,
  fileToDataref,
  finishedJobOutputsToFiles,
  StateChangeValueWorkerFinished,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from '/@/shared';
import { exists } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import { basename } from 'https://deno.land/std@0.224.0/path/mod.ts';
import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';
import { readAll } from 'jsr:@std/io/read-all';

import {
  closed,
  open,
} from '@korkje/wsi';

export const jobAdd = new Command()
  .arguments("<queue:string> [stdin:string]")
  .description("Add a job to a queue")
  .option("-m, --image [image:string]", "Docker image", {
    default: "alpine:latest",
    conflicts: ["git"],
  })
  .option("-f, --file [file:string]", "Input files", { collect: true })
  .option("-r, --git [git:string]", "Git repo source")
  .option("-c, --command [command:string]", "Container command")
  .option(
    "-w, --wait [wait:boolean]",
    "Wait until job is finished before returning"
  )
  .option(
    "-o, --outputs [outputs:string]",
    "Directory to copy output files (if any)",
    {
      default: "./outputs",
    }
  )
  .option("--no-cache", "Disable cache")

  // .option("-g, --gpu [gpu:boolean]", "Enable GPU access", { default: false })
  .action(
    async (
      options: {
        image?: string | undefined | boolean;
        command?: string | undefined | boolean;
        git?: string | undefined | boolean;
        cache?: string | undefined | boolean;
        wait?: string | undefined | boolean;
        outputs?: string | undefined | boolean;
        file?: (string | boolean)[] | undefined;
        apiServerAddress?: string | undefined;
      },
      queue: string,
      stdin?: string
    ) => {
      const {
        image,
        command,
        git,
        apiServerAddress,
        file: files,
        wait,
        outputs,
      } = options;
      // console.log("options", options);
      // console.log("queue", queue);

      const address = apiServerAddress || globalThis.location.origin;
      const url = `${address}/client/${queue}`;
      const nocache = options.cache === true ? undefined : true;

      const imageOrGit: string =
        (git as string) || (image as string) || "alpine:latest";
      let definition: DockerJobDefinitionInputRefs = {
        image: imageOrGit,
        command: command as string,
        inputs: {},
      };

      if (stdin === "-") {
        const decoder = new TextDecoder();
        const input = decoder.decode(await readAll(Deno.stdin));
        definition = JSON.parse(input);
      }

      // handle input files
      if (files) {
        for (const file of files) {
          if (typeof file !== "string") {
            continue;
          }
          const fileExists = await exists(file);
          if (!fileExists) {
            throw `File does not exist: ${file}`;
          }
          // TODO: handle BIG blobs
          const ref = await fileToDataref(file, address);
          const fileName = basename(file);
          if (!definition.inputs) {
            definition.inputs = {};
          }
          definition.inputs[fileName] = ref;
        }
      }

      const { message, jobId, stageChange } =
        await createNewContainerJobMessage({
          definition,
          nocache,
        });

      let {
        promise: jobQueuedOrCompleteDeferred,
        resolve,
        reject,
      } = Promise.withResolvers<DockerJobDefinitionRow>();

      // console.log('url', url);
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
            const someJobsPayload =
              possibleMessage.payload as BroadcastJobStates;
            if (!someJobsPayload) {
              break;
            }
            const jobDefinitionRow :DockerJobDefinitionRow = someJobsPayload.state.jobs[jobId];
            if (!jobDefinitionRow) {
              break;
            }

            // if we are NOT waiting, return on ANY job state change
            // since that means the job is AT LEAST submitted
            // TODO: question: error states?
            if (!wait) {
              resolve(jobDefinitionRow);
              resolved = true;
              return;
            }
            if (jobDefinitionRow.state === DockerJobState.Finished) {
              const finishedState =
              jobDefinitionRow.value as StateChangeValueWorkerFinished;
              (async () => {
                await finishedJobOutputsToFiles(
                  finishedState,
                  outputs as string,
                  address
                );
                resolved = true;
                resolve(jobDefinitionRow);
              })();
            }
            break;
          default:
          //ignored
        }
      };

      // console.log("Opening socket...")
      await open(socket);
      // console.log("Opened socket ✅")
      socket.send(JSON.stringify(message));
      // console.log("Sent message ✅")

      const result = await jobQueuedOrCompleteDeferred;
      // console.log("Job complete ✅")
      socket.close();
      await closed(socket);
      // console.log("Socket closed ✅")
      console.log(JSON.stringify(result));
    }
  );
