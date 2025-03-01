import { resolvePreferredWorker } from "@metapages/compute-queues-shared";
import mod from "../../mod.json" with { type: "json" };
import { config } from "/@/config.ts";
import * as computeQueuesShared from "@metapages/compute-queues-shared";
import {
  type DockerJobArgs,
  dockerJobExecute,
  type DockerJobExecution,
  type Volume,
} from "/@/queue/DockerJob.ts";
import { convertIOToVolumeMounts, getOutputs } from "/@/queue/IO.ts";
import { convertStringToDockerCommand } from "/@/queue/utils.ts";
import { ensureIsolateNetwork } from "/@/docker/network.ts";

const Version: string = mod.version;

export interface DockerJobQueueArgs
  extends computeQueuesShared.WorkerRegistration {
  sender: computeQueuesShared.WebsocketMessageSenderWorker;
}

type WorkerJobQueueItem = {
  execution: DockerJobExecution | null;
  definition: computeQueuesShared.DockerJobDefinitionInputRefs;
  // We might have to send this multiple times, so keep it around
  runningMessageToServer: computeQueuesShared.WebsocketMessageWorkerToServer;
  gpuIndices?: number[];
};

// const UPDATE_WORKERS_INTERVAL = ms("5s");

export class DockerJobQueue {
  workerId: string;
  workerIdShort: string;
  cpus: number;
  gpus: number;
  // space in the value structure for local state
  // These are RUNNING jobs
  queue: { [hash in string]: WorkerJobQueueItem } = {};

  // If we finish a job but the server is unavailabe when we request a stateChange
  // then we persist (for some interval (1 week?)) the stateChange so that when the
  // server reconnects, we can send the results
  // cachedResults: any = {};
  // Tell the server our state change requests
  sender: computeQueuesShared.WebsocketMessageSenderWorker;

  // jobs: { [hash in string]: DockerJobDefinitionInputRefs } = {};

  constructor(args: DockerJobQueueArgs) {
    const { sender, cpus, gpus, id } = args;
    this.cpus = cpus;
    this.gpus = gpus;
    this.sender = sender;
    this.workerId = id;
    this.workerIdShort = this.workerId.substring(0, 6);
  }

  gpuDeviceIndicesUsed(): number[] {
    const gpuDeviceIndicesUsed: number[] = Object.values(this.queue)
      .filter((item: WorkerJobQueueItem) => item.gpuIndices)
      .reduce<number[]>((array, item) => {
        return item.gpuIndices ? array.concat(item.gpuIndices) : array;
      }, []);
    gpuDeviceIndicesUsed.sort();
    return gpuDeviceIndicesUsed;
    // return Object.entries(this.queue).filter(([_, item]) => item.definition.gpu).length;
  }

  gpuCapacity(): number {
    return this.gpus - this.gpuDeviceIndicesUsed().length;
  }

  isGPUCapacity(): boolean {
    return this.gpuCapacity() > 0;
  }

  // getGPUDeviceRequests() :{
  //     Driver:string,
  //     Count: number,
  //     DeviceIDs?: string[],
  //     Capabilities: string[][]
  //   }[] {
  //     if (!this.isGPUCapacity()) {
  //         throw `getGPUDeviceRequests but no capacity`;
  //     }
  //     const gpuDeviceIndicesUsed :number[] = Object.values(this.queue)
  //         .filter((item :WorkerJobQueueItem) => item.gpuIndices)
  //         .reduce<number[]>((array, item) => {
  //             return item.gpuIndices ? array.concat(item.gpuIndices) : array;
  //         }, []);

  //     gpuDeviceIndicesUsed.sort();
  //     // Now get thei first available GPU

  //     for (let gpuIndex = 0; gpuIndex < this.gpus; gpuIndex++) {
  //         if (!gpuDeviceIndicesUsed.includes(gpuIndex)) {
  //             return [{
  //                 Driver: 'nvidia',
  //                 Count: 1,
  //                 DeviceIDs: [`${gpuIndex}`],
  //                 Capabilities: [["gpu"]],
  //             }];
  //         }
  //     }

  //     throw `getGPUDeviceRequests but could not find an available GPU`;
  // }

  getGPUDeviceIndex(): number {
    if (!this.isGPUCapacity()) {
      throw `getGPUDeviceIndex but no capacity`;
    }
    const gpuDeviceIndicesUsed: number[] = Object.values(this.queue)
      .filter((item: WorkerJobQueueItem) => item.gpuIndices)
      .reduce<number[]>((array, item) => {
        return item.gpuIndices ? array.concat(item.gpuIndices) : array;
      }, []);

    gpuDeviceIndicesUsed.sort();
    // Now get thei first available GPU

    for (let gpuIndex = 0; gpuIndex < this.gpus; gpuIndex++) {
      if (!gpuDeviceIndicesUsed.includes(gpuIndex)) {
        return gpuIndex;
      }
    }

    throw `getGPUDeviceIndex but could not find an available GPU`;
  }

  status(): computeQueuesShared.WorkerStatusResponse {
    return {
      time: Date.now(),
      id: this.workerId,
      cpus: this.cpus,
      gpus: this.gpus,
      queue: Object.fromEntries(
        Object.entries(this.queue).map(([key, item]) => {
          return [
            key,
            {
              jobId: key,
              definition: item.definition,
              finished: !!item.execution,
            },
          ];
        }),
      ),
    };
  }

  register() {
    const registration: computeQueuesShared.WorkerRegistration = {
      time: Date.now(),
      version: Version,
      id: this.workerId,
      cpus: this.cpus,
      gpus: this.gpus,
    };
    this.sender({
      type: computeQueuesShared.WebsocketMessageTypeWorkerToServer
        .WorkerRegistration,
      payload: registration,
    });
    for (const runningQueueObject of Object.values(this.queue)) {
      this.sender(runningQueueObject.runningMessageToServer);
    }
  }

  onUpdateUpdateASubsetOfJobs(
    message: computeQueuesShared.BroadcastJobStates,
  ) {
    message.isSubset = true;
    this._checkRunningJobs(message);
    this._claimJobs(message);
  }

  onUpdateSetAllJobStates(message: computeQueuesShared.BroadcastJobStates) {
    this._checkRunningJobs(message);
    this._claimJobs(message);
  }

  _checkRunningJobs(message: computeQueuesShared.BroadcastJobStates) {
    const jobStates = message.state.jobs;
    // we get
    const isAllJobs = !message.isSubset;

    if (config.debug) {
      console.log(
        `🎳 _checkRunningJobs this.queue=[${
          Object.keys(this.queue).join(",")
        }] jobStates=[${Object.keys(jobStates).join(",")}]`,
      );
    }

    // make sure our local jobs should be running (according to the server state)
    for (const [locallyRunningJobId, _] of Object.entries(this.queue)) {
      // do we have local jobs the server doesn't even know about? This should never happen
      // Maybe it could be in the case where the browser disconnected and you want the jobs to keep going
      if (!jobStates[locallyRunningJobId]) {
        // we can only kill the job if we know it's not running on the server
        if (isAllJobs) {
          console.log(
            `[${this.workerIdShort}] Cannot find local job ${
              locallyRunningJobId.substring(0, 6)
            } in server state, killing and removing`,
          );
          this._killJobAndIgnore(locallyRunningJobId);
          continue;
        } else {
          // this job isn't in this update, but this update is not all jobs, so the server
          // hasn't changed our job state. so bail out
          continue;
        }
      }

      const serverJobState = jobStates[locallyRunningJobId];

      if (config.debug) {
        console.log(
          `🎳 _checkRunningJobs new [${locallyRunningJobId}]`,
          serverJobState,
        );
      }

      switch (serverJobState.state) {
        case computeQueuesShared.DockerJobState.Finished:
          // FINE it finished elsewhere, how rude
          console.log(
            `[${this.workerIdShort}] [${
              locallyRunningJobId.substring(0, 6)
            }] finished elsehwere, killing here`,
          );
          this._killJobAndIgnore(locallyRunningJobId);
          break;
        case computeQueuesShared.DockerJobState.ReQueued:
        case computeQueuesShared.DockerJobState.Queued:
          // server says queued, I say running, remind the server
          // this can easily happen if I submit Running, but then
          // the worker gets another update immediately
          // The server will ignore this if it gets multiple times
          console.log(
            `[${this.workerIdShort}] [${
              locallyRunningJobId.substring(0, 6)
            }] server says queued, I say running, sending running again`,
          );
          this.sender({
            type: computeQueuesShared.WebsocketMessageTypeWorkerToServer
              .StateChange,
            payload: {
              tag: this.workerId,
              job: locallyRunningJobId,
              state: computeQueuesShared.DockerJobState.Running,
              value: {
                worker: this.workerId,
                time: Date.now(),
              },
            },
          });
          break;
        case computeQueuesShared.DockerJobState.Running:
          // good!
          // except if another worker has taken it, then kill ours (server is dictator)
          if (
            (serverJobState
              .value as computeQueuesShared.StateChangeValueRunning).worker !==
              this.workerId
          ) {
            const preferredWorker = resolvePreferredWorker(
              this.workerId,
              (serverJobState
                .value as computeQueuesShared.StateChangeValueRunning).worker,
            );
            if (preferredWorker === this.workerId) {
              console.log(
                `[${this.workerIdShort}] [${
                  locallyRunningJobId.substring(0, 6)
                }] running, but elsewhere apparently. We are keeping ours since we are preferred`,
              );
            } else {
              console.log(
                `[${this.workerIdShort}] [${
                  locallyRunningJobId.substring(0, 6)
                }] running, but elsewhere also. Killing ours because preferred by ${
                  preferredWorker.substring(0, 6)
                }`,
              );
              this._killJobAndIgnore(locallyRunningJobId);
            }
          }
          break;
      }

      // are any jobs running locally actually killed by the server? or running
      if (
        serverJobState.state === computeQueuesShared.DockerJobState.Finished
      ) {
        console.log(
          `[${this.workerIdShort}] Cannot find local job ${
            locallyRunningJobId.substring(0, 6)
          } in server state, killing and removing`,
        );
        this._killJobAndIgnore(locallyRunningJobId);
      }
    }

    // Remove jobs not in the jobState update from our local store
    // Maybe in the future we keep around
    // for (const storedJobDefinitionId of Object.keys(this.jobss)) {
    //     if (!jobStates[storedJobDefinitionId]) {
    //         delete this.jobs[storedJobDefinitionId];
    //     }
    // }
  }

  private _isClaimingJobs: boolean = false;
  private _needsAnotherClaimJobs: boolean = false;
  _claimJobs(message: computeQueuesShared.BroadcastJobStates) {
    // If already running, set flag for another run and return

    if (config.debug) {
      console.log(
        `[${this.workerIdShort}] 🎳 _claimJobs this.queue=[${
          Object.keys(this.queue).join(",")
        }] jobStates=[${Object.keys(message.state.jobs).join(",")}]`,
      );
    }
    if (this._isClaimingJobs) {
      if (config.debug) {
        console.log(
          `[${this.workerIdShort}] [${message.state.jobs.length}] already running, setting flag for another run`,
        );
      }
      this._needsAnotherClaimJobs = true;
      return;
    }

    // Set running flag
    this._isClaimingJobs = true;
    try {
      do {
        this._needsAnotherClaimJobs = false;
        const jobStates = message.state.jobs;

        // Original _claimJobs logic here
        const jobsServerSaysAreRunningOnMe = Object.keys(jobStates).filter((
          key,
        ) =>
          jobStates[key].state === computeQueuesShared.DockerJobState.Running &&
          (jobStates[key].value as computeQueuesShared.StateChangeValueRunning)
              .worker === this.workerId
        );
        if (config.debug) {
          console.log(
            `[${this.workerIdShort}] 🎳 _claimJobs jobsServerSaysAreRunningOnMe=[${
              Object.keys(jobsServerSaysAreRunningOnMe).join(",")
            }]`,
          );
        }

        for (const runningJobId of jobsServerSaysAreRunningOnMe) {
          if (!this.queue[runningJobId]) {
            this._startJob(jobStates[runningJobId]);
          }
        }

        // only care about queued jobs
        const queuedJobKeys: string[] = Object.keys(jobStates)
          .filter((key) =>
            jobStates[key].state ===
              computeQueuesShared.DockerJobState.Queued ||
            jobStates[key].state === computeQueuesShared.DockerJobState.ReQueued
          );
        console.log("queuedJobKeys", queuedJobKeys);
        if (config.debug) {
          console.log(
            `[${this.workerIdShort}] 🎳 _claimJobs queuedJobKeys=[${
              queuedJobKeys.join(",")
            }]`,
          );
        }
        // So this is the core logic of claiming jobs is here, and currently, it's just FIFO
        // Go through the queued jobs and start them if we have capacity
        // let index = 0;
        while (queuedJobKeys.length > 0) {
          const jobKey = queuedJobKeys.pop()!;
          if (this.queue[jobKey]) {
            continue;
          }
          const job = jobStates[jobKey];
          const definition =
            (job.history[0].value as computeQueuesShared.StateChangeValueQueued)
              .definition;
          // Can I start this job?
          // This logic *could* be above in the while loop, but it's going to get
          // more complicated when we add more features, so make the check steps explicit
          // even if it's a bit more verbose
          const cpusOK = Object.keys(this.queue).length < this.cpus;

          if (cpusOK) {
            // cpu capacity is 👍
            // GPUs?
            if (definition.gpu) {
              if (!this.isGPUCapacity()) {
                // no gpu capacity but the job needs it
                // skip this job
                if (config.debug) {
                  console.log(
                    `[${this.workerIdShort}]  🎳 _claimJobs job=[${
                      jobKey.substring(0, 6)
                    }] no gpu capacity but definition.gpu=[${definition.gpu}]`,
                  );
                }
                continue;
              }
            }
            this._startJob(job);
          }
        }
      } while (this._needsAnotherClaimJobs);
    } finally {
      // Clear running flag when done
      this._isClaimingJobs = false;
    }
  }

  _startJob(jobBlob: computeQueuesShared.DockerJobDefinitionRow): void {
    console.log(
      `[${this.workerIdShort}] [${jobBlob.hash.substring(0, 6)}] starting...`,
    );
    const definition =
      (jobBlob.history[0].value as computeQueuesShared.StateChangeValueQueued)
        .definition;
    if (!definition) {
      console.log(
        `💥 [${this.workerIdShort}] _startJob but no this.jobs[${
          jobBlob.hash.substring(0, 6)
        }]`,
      );
      return;
    }

    // tell the server we've started the job
    const valueRunning: computeQueuesShared.StateChangeValueRunning = {
      worker: this.workerId,
      time: Date.now(),
    };
    const runningMessageToServer:
      computeQueuesShared.WebsocketMessageWorkerToServer = {
        type:
          computeQueuesShared.WebsocketMessageTypeWorkerToServer.StateChange,
        payload: {
          job: jobBlob.hash,
          tag: this.workerId,
          state: computeQueuesShared.DockerJobState.Running,
          value: valueRunning,
        },
      };

    // add a placeholder on the queue for this job
    this.queue[jobBlob.hash] = {
      execution: null,
      definition,
      runningMessageToServer,
    };
    let deviceRequests:
      | computeQueuesShared.DockerApiDeviceRequest[]
      | undefined;
    if (definition.gpu) {
      const deviceIndex = this.getGPUDeviceIndex();
      this.queue[jobBlob.hash].gpuIndices = [deviceIndex];
      deviceRequests = [{
        Driver: "nvidia",
        // Count: 1,
        DeviceIDs: [`${deviceIndex}`],
        Capabilities: [["gpu"]],
      }];
    }

    this.sender(runningMessageToServer);

    // after this it can all happen async

    (async () => {
      let volumes: Volume[];
      let outputsDir: string;
      try {
        const volumesResult = await convertIOToVolumeMounts(
          { id: jobBlob.hash, definition },
          config.server,
          this.workerId,
        );
        volumes = volumesResult.volumes;
        outputsDir = volumesResult.outputsDir;
      } catch (err) {
        console.error(`💥 [${this.workerIdShort}]`, err);
        // TODO too much code duplication here
        // Delete from our local queue before sending
        // TODO: cache locally before attempting to send
        delete this.queue[jobBlob.hash];

        const valueError: computeQueuesShared.StateChangeValueFinished = {
          reason: computeQueuesShared.DockerJobFinishedReason.Error,
          worker: this.workerId,
          time: Date.now(),
          result: ({
            error: `${err}`,
            logs: [[`💥 ${err}`, Date.now(), true]],
          } as computeQueuesShared.DockerRunResultWithOutputs),
        };

        this.sender({
          type:
            computeQueuesShared.WebsocketMessageTypeWorkerToServer.StateChange,
          payload: {
            job: jobBlob.hash,
            tag: this.workerId,
            state: computeQueuesShared.DockerJobState.Finished,
            value: valueError,
          },
        });
        return;
      }

      // TODO hook up the durationMax to a timeout
      // TODO add input mounts
      const executionArgs: DockerJobArgs = {
        sender: this.sender,
        id: jobBlob.hash,
        image: definition.image,
        build: definition.build,
        command: definition.command
          ? convertStringToDockerCommand(definition.command, definition.env)
          : undefined,
        entrypoint: definition.entrypoint
          ? convertStringToDockerCommand(definition.entrypoint, definition.env)
          : undefined,
        workdir: definition.workdir,
        env: definition.env,
        shmSize: definition.shmSize,
        volumes,
        outputsDir,
        deviceRequests,
        durationMax: definition.durationMax,
      };

      // Not awaiting, it should have already been created, but let's
      // check on every job anyway, but out of band
      ensureIsolateNetwork(false);

      const dockerExecution: DockerJobExecution = dockerJobExecute(
        executionArgs,
      );
      if (!this.queue[jobBlob.hash]) {
        console.log(
          `[${this.workerIdShort}] [${
            jobBlob.hash.substring(0, 6)
          }] after await jobBlob.hash no job in queue so killing`,
        );
        // what happened? the job was removed from the queue by someone else?
        try {
          dockerExecution.kill();
        } catch (err) {
          console.log(
            `[${this.workerIdShort}] [${
              jobBlob.hash.substring(0, 6)
            }] ❗ dockerExecution.kill() errored but could be expeced`,
            err,
          );
        }

        return;
      }
      this.queue[jobBlob.hash].execution = dockerExecution;

      dockerExecution.finish.then(
        async (result: computeQueuesShared.DockerRunResult) => {
          console.log(
            `[${jobBlob.hash.substring(0, 6)}] result ${
              JSON.stringify(result).substring(0, 100)
            }`,
          );
          result.logs = result.logs || [];
          if (result.StatusCode !== 0) {
            result.logs.push([
              `💥 StatusCode: ${result.StatusCode}`,
              Date.now(),
              true,
            ]);
            console.log(
              `[${this.workerIdShort}] [${
                jobBlob.hash.substring(0, 6)
              }] 💥 StatusCode: ${result.StatusCode}`,
            );
            console.log(
              `[${this.workerIdShort}] [${
                jobBlob.hash.substring(0, 6)
              }] 💥 stderr: ${result.logs?.join("\n")?.substring(0, 200)}`,
            );
          }
          if (result.error) {
            result.logs.push([`💥 ${result.error}`, Date.now(), true]);
            result.error = "Error";
            console.log(
              `[${this.workerIdShort}] [${
                jobBlob.hash.substring(0, 6)
              }] 💥 error: ${result.error}`,
            );
          }

          const resultWithOutputs:
            computeQueuesShared.DockerRunResultWithOutputs =
              result as computeQueuesShared.DockerRunResultWithOutputs;
          resultWithOutputs.outputs = {};

          let valueFinished:
            | computeQueuesShared.StateChangeValueFinished
            | undefined;
          if (result.error) {
            valueFinished = {
              reason: computeQueuesShared.DockerJobFinishedReason.Error,
              worker: this.workerId,
              time: Date.now(),
              result: resultWithOutputs,
            };
          } else {
            // get outputs
            try {
              // console.log(
              //   `[${this.workerIdShort}] [${
              //     jobBlob.hash.substring(0, 6)
              //   }] uploading outputs`,
              // );
              const outputs = await getOutputs(jobBlob, this.workerId);
              valueFinished = {
                reason: computeQueuesShared.DockerJobFinishedReason.Success,
                worker: this.workerId,
                time: Date.now(),
                result: { ...result, outputs },
              };
            } catch (err) {
              console.log(
                `[${this.workerIdShort}] [${
                  jobBlob.hash.substring(0, 6)
                }] 💥 failed to upload outputs ${err}`,
              );
              resultWithOutputs.logs = resultWithOutputs.logs || [];
              console.error(err);
              resultWithOutputs.logs.push([
                `💥 failed to get job outputs`,
                Date.now(),
                true,
              ], [`err=${err}`, Date.now(), true]);
              valueFinished = {
                reason: computeQueuesShared.DockerJobFinishedReason.Error,
                worker: this.workerId,
                time: Date.now(),
                result: { ...resultWithOutputs, error: `${err}` },
              };
            }
          }

          // Delete from our local queue first
          // TODO: cache locally before attempting to send
          delete this.queue[jobBlob.hash];

          this.sender({
            type: computeQueuesShared.WebsocketMessageTypeWorkerToServer
              .StateChange,
            payload: {
              job: jobBlob.hash,
              tag: this.workerId,
              state: computeQueuesShared.DockerJobState.Finished,
              value: valueFinished,
            },
          });
        },
      ).catch((err) => {
        console.log(
          `[${this.workerIdShort}] [${
            jobBlob.hash.substring(0, 6)
          }] 💥 errored ${err}`,
        );

        // Delete from our local queue before sending
        // TODO: cache locally before attempting to send
        delete this.queue[jobBlob.hash];

        const valueError: computeQueuesShared.StateChangeValueFinished = {
          reason: computeQueuesShared.DockerJobFinishedReason.Error,
          worker: this.workerId,
          time: Date.now(),
          result: ({
            error: err,
            logs: [[`💥 Job Error`, Date.now(), true], [
              `${err}`,
              Date.now(),
              true,
            ]],
          } as computeQueuesShared.DockerRunResultWithOutputs),
        };

        this.sender({
          type:
            computeQueuesShared.WebsocketMessageTypeWorkerToServer.StateChange,
          payload: {
            job: jobBlob.hash,
            tag: this.workerId,
            state: computeQueuesShared.DockerJobState.Finished,
            value: valueError,
          },
        });
      }).finally(() => {
        // I had the queue removal here initially but I wanted
        // to remove the element from the queue before sending to server
        // in case server send fails and throws an error
      });
    })();
  }

  _killJobAndIgnore(locallyRunningJobId: string) {
    console.log(
      `[${this.workerIdShort}] Killing job ${
        locallyRunningJobId.substring(0, 6)
      }`,
    );
    const localJob = this.queue[locallyRunningJobId];
    delete this.queue[locallyRunningJobId];
    localJob?.execution?.kill();
  }
}
