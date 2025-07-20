/**
 * Each unique queue has their jobs and registered workers.
 * The clients (browsers usually but not limited to) will send
 * jobs down to this queue, and the workers will get and return jobs.
 *
 * Data model: finite state machines. jobs go through states.
 * Workers take jobs off the queue and have some time to get it done.
 *
 * Finished jobs stay in the state list for a few minutes before getting
 * removed. The results are cached tho
 */

import { DB } from "/@/shared/db.ts";
import { resolvePreferredWorker } from "/@/shared/jobtools.ts";
import {
  type BroadcastJobDefinitions,
  type BroadcastJobStates,
  type BroadcastWorkers,
  DefaultNamespace,
  type DockerJobDefinitionInputRefs,
  DockerJobFinishedReason,
  DockerJobState,
  type EnqueueJob,
  type InMemoryDockerJob,
  type JobsStateMap,
  type JobStates,
  type JobStatusPayload,
  type PayloadClearJobCache,
  type PayloadQueryJob,
  type RequestJobDefinitions,
  type StateChange,
  type StateChangeValueFinished,
  type StateChangeValueQueued,
  type StateChangeValueRunning,
  type WebsocketMessageClientToServer,
  type WebsocketMessageServerBroadcast,
  WebsocketMessageTypeClientToServer,
  WebsocketMessageTypeServerBroadcast,
  WebsocketMessageTypeWorkerToServer,
  type WebsocketMessageWorkerToServer,
  type WorkerRegistration,
  type WorkerStatusResponse,
} from "/@/shared/types.ts";
import {
  getJobColorizedString,
  getQueueColorizedString,
  getWorkerColorizedString,
  isJobOkForSending,
  resolveMostCorrectJob,
  setJobStateRemoved,
  setJobStateRunning,
} from "/@/shared/util.ts";
import equal from "fast-deep-equal/es6";
import { diffString } from "json-diff";
import { ms } from "ms";
import { createNanoEvents, type Emitter } from "nanoevents";
import { delay } from "std/async/delay";

import type { BroadcastChannelRedis } from "@metapages/deno-redis-broadcastchannel";

let CustomBroadcastChannel: typeof BroadcastChannel = BroadcastChannel;

// If Redis is configured, then dynamically import:
if (Deno.env.get("DENO_BROADCAST_REDIS_URL") === "redis://redis:6379") {
  // console.log("👀 Using redis broadcast channel");
  const { BroadcastChannelRedis } = await import(
    "@metapages/deno-redis-broadcastchannel"
  );
  CustomBroadcastChannel = BroadcastChannelRedis;
}

export const MAX_TIME_FINISHED_JOB_IN_QUEUE = ms("60 seconds") as number;
const INTERVAL_UNTIL_WORKERS_ASSUMED_LOST = ms("30 seconds") as number;
const INTERVAL_WORKERS_BROADCAST = ms("5 seconds") as number;
const INTERVAL_JOBS_BROADCAST = ms("10 seconds") as number;
const INTERVAL_CHECK_FOR_DUPLICATE_JOBS_SAME_SOURCE = ms(
  "10 seconds",
) as number;

//https://github.com/metapages/compute-queues/issues/242
// When multiple jobs with the same namespace exist we delete all except the newest
// but if we have a long running valuable job we don't want to delete it
// and the churn on a new metapage as the inputs arrive can resubmit a new job
// that will be subsequently replaced by the actually current. So we need to pause
// on deleting long-running jobs for a bit at least. There is no overall harm to this
// except if a machine is bottlenecked. If it is, you can always delete the job in the queue
// (and we need to show the job age)
// returns the setInterval to check again
// let NAMESPACE_MULTIPLE_JOB_DELETION_PAUSE = ms("10 seconds") as number;
const getDeletionDelayForNamespaceSupersededJob = (
  jobAge: number,
): number => {
  // if it's older than a minute let's slow down killing it for the replacement
  if (jobAge > 60000) {
    // we can wait 8s bit before killing it
    return 8000;
  } else if (jobAge > 20000) { //if it's older than 20s
    return 4000; // wait 4 seconds
  }
  return 0; // default:kill it immediately
};

const INTERVAL_REMOVE_OLD_FINISHED_JOBS_FROM_QUEUE = ms("10 seconds") as number;

type ServerWorkersObject = { [key: string]: WorkerRegistration[] };

type BroadcastChannelWorkersRegistration = {
  // this is sorted
  workers: ServerWorkersObject;
  time: number;
};

type BroadcastChannelStatusRequest = Record<string | number | symbol, never>;
type BroadcastChannelStatusResponse = {
  id: string;
  workers: Record<string, WorkerStatusResponse>;
  jobs: Record<
    string,
    {
      state: string;
    }
  >;
};
type BroadcastChannelDeleteCachedJob = {
  jobId: string;
  namespace: string;
};

// https://github.com/metapages/compute-queues/issues/242
type BroadcastChannelRemoveJob = {
  jobId: string;
  namespace?: string;
};

type BroadcastChannelMessageType =
  | "job-states"
  | "job-logs"
  | "workers"
  | "status-request"
  | "status-response"
  | "delete-cached-job";
type BroadcastChannelMessage = {
  type: BroadcastChannelMessageType;
  origin: string;
  value:
    | string[] // [jobId1, state1, jobId2, state2, ...]
    | JobStates
    | BroadcastChannelWorkersRegistration
    | BroadcastChannelStatusRequest
    | BroadcastChannelStatusResponse
    | BroadcastChannelDeleteCachedJob
    // https://github.com/metapages/compute-queues/issues/242
    | BroadcastChannelRemoveJob
    | JobStatusPayload;
};

// in memory active queue of jobs. they're persisted to the db
// only to make this in-memory queue durable
export const userJobQueues: { [id in string]: BaseDockerJobQueue } = {};

interface NanoEventWorkerMessageEvents {
  message: (m: WebsocketMessageWorkerToServer) => void;
}

interface BroadcastMessageEvents {
  message: (m: BroadcastChannelMessage) => void;
}

interface WorkerMessageEvents {
  message: (m: WebsocketMessageWorkerToServer) => void;
}
/**
 * servers collate workers from all servers
 * (and send this collapsed to clients)
 */
export interface CollectedWorkersRegistration {
  otherWorkers: Map<string, WorkerRegistration[]>;
  myWorkers: {
    connection: WebSocket;
    registration: WorkerRegistration;
    emitter: Emitter<WorkerMessageEvents>;
  }[];
}

/**
 * Base class for docker job queues with default implementations
 */
export class BaseDockerJobQueue {
  protected state: JobStates;
  protected readonly workers: CollectedWorkersRegistration;
  protected readonly clients: WebSocket[];
  protected readonly address: string;
  protected readonly addressShortString: string;
  protected readonly serverId: string;
  protected readonly dataDirectory: string;
  protected readonly channel: BroadcastChannel;
  protected readonly channelEmitter: Emitter<BroadcastMessageEvents>;
  public db!: DB;
  protected readonly debug: boolean;

  // intervals
  protected _intervalWorkerBroadcast: number | undefined;
  protected _intervalJobsBroadcast: number | undefined;
  protected _intervalCheckForDuplicateJobsSameSource: number | undefined;
  protected _intervalRemoveOldFinishedJobsFromQueue: number | undefined;

  constructor(opts: {
    serverId: string;
    address: string;
    dataDirectory?: string;
  }) {
    const { serverId, address, dataDirectory } = opts;

    this.address = address;
    this.addressShortString = getQueueColorizedString(address);
    console.log(`${this.addressShortString} ➕ 🎾 UserDockerJobQueue`);
    this.serverId = serverId;
    this.dataDirectory = dataDirectory || "/tmp/worker-metaframe";
    // console.log("⚠️💥 HARDCODING debug=true, REMOVE ME BEFORE MERGE", debug);
    this.debug = false;
    this.workers = {
      otherWorkers: new Map(),
      myWorkers: [],
    };
    this.clients = [];
    this.state = { jobs: {} };

    this.channel = new CustomBroadcastChannel(address);

    this.channelEmitter = createNanoEvents<BroadcastMessageEvents>();

    // Add broadcast channel error handling
    this.channel.addEventListener("error", (event) => {
      console.error(`🚨 Broadcast channel error:`, event);
    });

    this.channel.addEventListener("close", () => {
      console.log(`🚨 Broadcast channel closed`);
    });

    this._intervalWorkerBroadcast = setInterval(() => {
      this.broadcastWorkersToChannel();
      this.requeueJobsFromMissingWorkers();
    }, INTERVAL_WORKERS_BROADCAST);

    this._intervalJobsBroadcast = setInterval(() => {
      this.broadcastJobStatesToWebsockets();
      this.broadcastJobStatesToChannel();
      // console.log(
      //   `📡 Periodic full job state sync sent to ${this.workers.myWorkers.length} workers | ${
      //     Object.keys(this.state.jobs).filter((jobId) => isJobOkForSending(this.state.jobs[jobId])).length
      //   } jobs`,
      // );
    }, INTERVAL_JOBS_BROADCAST);

    this._intervalCheckForDuplicateJobsSameSource = setInterval(() => {
      this.checkForSourceConflicts();
      this.checkForBadJobs();
    }, INTERVAL_CHECK_FOR_DUPLICATE_JOBS_SAME_SOURCE);

    this._intervalRemoveOldFinishedJobsFromQueue = setInterval(() => {
      this.removeOldFinishedJobsFromQueue();
    }, INTERVAL_REMOVE_OLD_FINISHED_JOBS_FROM_QUEUE);

    // channel listener
    // When a new message comes in from other instances, add it
    this.channel.onmessage = async (event: MessageEvent) => {
      const payload: BroadcastChannelMessage = event.data;
      let jobStatesFromBroadcast: JobStates | undefined;
      let jobsFromBroadcast: JobsStateMap | undefined;

      switch (payload.type) {
        case "job-states": {
          // get the updated job
          if (payload.origin === this.serverId) {
            break;
          }
          jobStatesFromBroadcast = payload.value as JobStates;
          jobsFromBroadcast = jobStatesFromBroadcast?.jobs;
          if (!jobsFromBroadcast) {
            break;
          }

          // console.log(
          //   `${this.addressShortString} 📡 GOT broadcasting from channel:[ ${
          //     Object.entries(jobsFromBroadcast).map(([jobId, job]) =>
          //       `${getJobColorizedString(jobId)}=${
          //         job.state === DockerJobState.Finished ? job.finishedReason : job.state
          //       }`
          //     ).join(",")
          //   } ]`,
          // );

          const jobIds: string[] = [];
          for (
            const [jobId, jobFromBroadcast] of Object.entries<InMemoryDockerJob>(
              jobsFromBroadcast,
            )
          ) {
            if (jobFromBroadcast.state === DockerJobState.Removed) {
              // placeholder, but are we updating ours to be Removed?
              if (this.state.jobs[jobId].state !== DockerJobState.Removed) {
                console.log(
                  `${this.addressShortString} 🌘 ...api broadcast merge: ${jobId} state=${
                    this.state.jobs[jobId].state
                  } => Removed`,
                );
              }
              continue;
            }

            // we don't have this job
            if (!this.state.jobs[jobId]) {
              // so get it from the db
              const jobFromDb = await this.db.queueJobGet({ queue: this.address, jobId });
              if (jobFromDb) {
                const isRemovable = isJobRemovableFromQueue(jobFromDb);
                if (isRemovable) {
                  continue;
                }
                // Add to our state, but don't broadcast it to other servers,
                // we will broadcast it to clients soon enough
                this.state.jobs[jobId] = jobFromDb;
                jobIds.push(jobId);
              }
            } else {
              const resolvedJob = resolveMostCorrectJob(
                this.state.jobs[jobId],
                jobFromBroadcast,
              );
              const namespacesDifferent = !equal(jobFromBroadcast?.namespaces, this.state.jobs[jobId]?.namespaces);
              if (namespacesDifferent || (resolvedJob && resolvedJob !== this.state.jobs[jobId])) {
                const jobFromDb = await this.db.queueJobGet({ queue: this.address, jobId });

                if (jobFromDb) {
                  const isRemovable = isJobRemovableFromQueue(jobFromDb);
                  if (isRemovable) {
                    continue;
                  }
                  const diff = diffString(this.state.jobs[jobId], jobFromDb);
                  if (!diff) {
                    continue;
                  }

                  this.state.jobs[jobId] = jobFromDb;
                }

                jobIds.push(jobId);
              }
            }
          }

          // console.log(
          //   `${this.addressShortString} 📡 after broadcasting from channel, broadcastJobStatesToWebsockets:[ ${
          //     Object.entries(this.state.jobs).map(([jobId, job]) =>
          //       `${getJobColorizedString(jobId)}=${
          //         job.state === DockerJobState.Finished ? job.finishedReason : job.state
          //       }`
          //     ).join(",")
          //   } ]`,
          // );

          if (jobIds.length > 0) {
            console.log(
              `${this.addressShortString} 🌘 ...api broadcast merge: ${jobIds.length} jobs`,
            );
            this.broadcastJobStatesToWebsockets(jobIds);
          }
          break;
        }

        case "workers": {
          const workersRegistration = payload.value as BroadcastChannelWorkersRegistration;
          this.otherWorkersHaveChanged(workersRegistration.workers);
          // combine with ours. if there is a difference to our known
          break;
        }

        case "status-request": {
          (async () => {
            console.log(
              `🌘 Received status request, collecting local worker status...`,
            );
            const localWorkersResponse = await this.getStatusFromLocalWorkers();
            const response: BroadcastChannelStatusResponse = {
              id: this.serverId,
              workers: localWorkersResponse,
              jobs: Object.fromEntries(
                Object.entries<InMemoryDockerJob>(this.state.jobs).map(
                  ([id, v]) => {
                    return [
                      id,
                      {
                        state: v.state,
                      },
                    ];
                  },
                ),
              ),
            };
            console.log(
              `🌘 Sending status response: ${Object.keys(localWorkersResponse).length} workers, ${
                Object.keys(response.jobs).length
              } jobs`,
            );
            this.channel.postMessage({
              type: "status-response",
              value: response,
            } as BroadcastChannelMessage);
          })();
          break;
        }

        case "delete-cached-job": {
          const { jobId, namespace } = payload.value as BroadcastChannelDeleteCachedJob;
          console.log(
            `🌘 BROADCAST received delete-cached-job for ${getJobColorizedString(jobId)} namespace=${namespace}`,
          );
          // No need to delete from the db, the server that triggered this
          // broadcast has already done that, we just need to remove it from
          // our cache
          this.broadcastToLocalWorkers(
            JSON.stringify({
              type: WebsocketMessageTypeServerBroadcast.ClearJobCache,
              payload: (payload.value as BroadcastChannelDeleteCachedJob),
            } as WebsocketMessageServerBroadcast),
          );
          break;
        }

        case "job-logs": {
          // console.log(`⛈️ got job-logs from broadcast`);
          const logs = payload.value as JobStatusPayload;
          this.sendLogsToLocalClients(logs);
          break;
        }

        default: {
          break;
        }
      }

      try {
        this.channelEmitter.emit("message", payload);
      } catch (err) {
        console.error(`🌘 channelEmitter error`, err);
      }
    };
  }

  /**
   * This is called by rest path /:queue/status
   */
  async status(): Promise<object> {
    // First attach listener to broadcast channel
    const remoteServersResponse = await this.getStatusFromRemoteWorkers();
    const localWorkersResponse = await this.getStatusFromLocalWorkers();

    const jobCount = Object.keys(this.state.jobs).length;
    const localWorkerCount = this.workers.myWorkers.length;
    const otherWorkerCount = Array.from(
      this.workers.otherWorkers.values(),
    ).flat().length;
    const clientCount = this.clients.length;

    console.log(
      `📊 Queue ${this.address} status: ${jobCount} jobs, ${localWorkerCount} local workers, ${otherWorkerCount} other workers, ${clientCount} clients`,
    );

    // Log job states for debugging
    const jobStates = Object.entries(this.state.jobs).map(([id, job]) => ({
      id: id.substring(0, 6),
      state: job.state,
      worker: job.state === DockerJobState.Running ? job?.worker?.substring(0, 6) : "none",
    }));
    console.log(`${this.addressShortString} job states:`, jobStates);

    return {
      jobs: Object.fromEntries(
        Object.entries<InMemoryDockerJob>(this.state.jobs).filter(([_, job]) => isJobOkForSending(job)).map(
          ([id, v]) => {
            return [
              id,
              {
                state: v.state,
                finishedReason: v.finished?.reason,
              },
            ];
          },
        ),
      ),
      otherServers: remoteServersResponse,
      localWorkers: localWorkersResponse,
      clientCount: this.clients.length,
      queueInfo: {
        address: this.address,
        serverId: this.serverId,
        jobCount,
        localWorkerCount,
        otherWorkerCount,
        clientCount,
        jobStates,
      },
    };
  }

  async getStatusFromRemoteWorkers(): Promise<
    Record<string, BroadcastChannelStatusResponse>
  > {
    // First attach a listener to the broadcast channel
    // Then send a status request
    // Then wait a bit to collect the responses
    // Then remove the listener
    // Then return the response

    const result: Record<string, BroadcastChannelStatusResponse> = {};

    // First attach a listener to the broadcast channel
    const unbindChannelListener = this.channelEmitter.on(
      "message",
      (payload: BroadcastChannelMessage) => {
        if (payload.type === "status-response") {
          const status = payload.value as BroadcastChannelStatusResponse;
          console.log(
            `🌘 got remote status from server ${status.id} with ${Object.keys(status.workers).length} workers and ${
              Object.keys(status.jobs).length
            } jobs`,
          );
          result[status.id] = status;
        }
      },
    );
    // Then send a status request
    this.channel.postMessage({
      type: "status-request",
      value: {},
    } as BroadcastChannelMessage);
    // Then wait a bit to collect the responses
    await delay(ms("3 seconds") as number);
    // Then remove the listener
    unbindChannelListener();

    console.log(
      `🌘 Collected status from ${Object.keys(result).length} remote servers`,
    );
    return result;
  }

  broadcastAndSendLogsToLocalClients(logs: JobStatusPayload) {
    this.channel.postMessage({
      type: "job-logs",
      value: logs,
    } as BroadcastChannelMessage);

    this.sendLogsToLocalClients(logs);
  }

  sendLogsToLocalClients(logs: JobStatusPayload) {
    // console.log(`⛈️ sendLogsToLocalClients`);
    const messageString = JSON.stringify({
      type: WebsocketMessageTypeServerBroadcast.JobStatusPayload,
      payload: logs,
    });
    this.broadcastToLocalClients(messageString);
  }

  async getStatusFromLocalWorkers(): Promise<
    Record<string, WorkerStatusResponse>
  > {
    // First attach listeners to all the workers
    // Then send a status request
    // Then wait a bit to collect the responses
    // Then remove the listeners
    // Then return the responses

    const result: Record<string, WorkerStatusResponse> = {};

    // First attach listeners to all the workers
    const eventUnbinds: (() => void)[] = [];
    this.workers.myWorkers.forEach((w) => {
      const unbind = w.emitter.on(
        "message",
        (message: WebsocketMessageWorkerToServer) => {
          if (
            message.type ===
              WebsocketMessageTypeWorkerToServer.WorkerStatusResponse
          ) {
            const status = message.payload as WorkerStatusResponse;
            console.log(
              `🌘 got status from worker ${
                getWorkerColorizedString(
                  status.id,
                )
              } with ${Object.keys(status.queue).length} running jobs`,
            );

            // Log what jobs the worker reports as running
            const runningJobs = Object.entries(status.queue).map(
              ([jobId, job]) => ({
                jobId: jobId.substring(0, 6),
                finished: job.finished,
              }),
            );
            console.log(
              `🌘 Worker ${getWorkerColorizedString(status.id)} running jobs:`,
              runningJobs,
            );

            result[status.id] = status;
          }
        },
      );
      eventUnbinds.push(unbind);
    });

    // Then send a status request
    this.broadcastToLocalWorkers(
      JSON.stringify({
        // If you supply jobIds it's not the full set
        type: WebsocketMessageTypeServerBroadcast.StatusRequest,
        payload: undefined,
      } as WebsocketMessageServerBroadcast),
    );

    // Then wait a bit to collect the responses
    await delay(ms("2 seconds") as number);

    // Then remove the listeners
    while (eventUnbinds.length > 0) {
      eventUnbinds.pop()!();
    }

    console.log(
      `🌘 Collected status from ${Object.keys(result).length} local workers`,
    );
    return result;
  }

  /**
   * Initialize the db and the broadcast channel
   */
  async setup() {
    // Initialize the db with the data directory
    this.db = await DB.initialize(this.dataDirectory);

    // For local development, use a redis broadcast channel
    if (Deno.env.get("DENO_BROADCAST_REDIS_URL") === "redis://redis:6379") {
      await (this.channel as BroadcastChannelRedis).connect();
    }

    const allPersistedJobInTheQueue = await this.db.queueGetAll(this.address);
    const jobIds = Object.keys(allPersistedJobInTheQueue);
    const now = Date.now();
    for (const jobId of jobIds) {
      const job = allPersistedJobInTheQueue[jobId];
      if (job.state === DockerJobState.Removed) {
        delete allPersistedJobInTheQueue[jobId];
      } else if (job.state === DockerJobState.Finished) {
        const time = allPersistedJobInTheQueue[jobId].time;
        if (now - time > MAX_TIME_FINISHED_JOB_IN_QUEUE) {
          delete allPersistedJobInTheQueue[jobId];
        }
      }
    }
    this.state.jobs = allPersistedJobInTheQueue;
    console.log(
      `${this.addressShortString} On startup got ${Object.keys(allPersistedJobInTheQueue).length} jobs from the db`,
    );
    // Why broadcast here? New UserDockerJobQueue instances will get their
    // own state from the db. Probably race conditions, it won't hurt at all
    // since correct job state always wins
    this.broadcastJobStatesToChannel();
    this.broadcastJobStatesToWebsockets();
  }

  broadcastJobStatesToChannel(jobIds?: string[]) {
    if (!jobIds) {
      jobIds = Object.keys(this.state.jobs);
    }
    const jobStates: JobStates = {
      jobs: Object.fromEntries(
        jobIds
          .filter((jobId) => this.state.jobs[jobId])
          .map((jobId) => [jobId, this.state.jobs[jobId]]),
      ),
    };
    if (Object.keys(jobStates.jobs).length > 0) {
      const message: BroadcastChannelMessage = {
        origin: this.serverId,
        type: "job-states",
        value: jobStates,
      };
      console.log(
        `${this.addressShortString} 📡 Broadcasting to channel:[ ${
          Object.entries(jobStates.jobs).map(([jobId, job]) =>
            `${getJobColorizedString(jobId)}=${job.state === DockerJobState.Finished ? job.finishedReason : job.state}`
          ).join(",")
        } ]`,
      );
      this.channel.postMessage(message);
    }
  }

  dispose() {
    this.channel.onmessage = null;
    this.channel.close();
    // https://github.com/ai/nanoevents?tab=readme-ov-file#remove-all-listeners
    this.channelEmitter.events = {};
    clearInterval(this._intervalWorkerBroadcast);
    clearInterval(this._intervalJobsBroadcast);
    // clearInterval(this._intervalFullJobSync);
    clearInterval(this._intervalCheckForDuplicateJobsSameSource);
    delete userJobQueues[this.address];
    console.log(`${this.addressShortString} ➖ 🗑️ 🎾 UserDockerJobQueue `);
  }

  jobsStateChangesInternalQueue: Map<string, StateChange[]> = new Map();
  public async stateChange(change: StateChange): Promise<void> {
    // Ensure we have a queue for this job
    if (!this.jobsStateChangesInternalQueue.has(change.job)) {
      this.jobsStateChangesInternalQueue.set(change.job, []);
    }

    const jobQueue = this.jobsStateChangesInternalQueue.get(change.job)!;

    // Add the change to the queue
    jobQueue.push(change);

    // If this is the first change in the queue, process it immediately
    if (jobQueue.length === 1) {
      await this.processJobStateChangeQueue(change.job);
    }
  }

  private async processJobStateChangeQueue(jobId: string): Promise<void> {
    const jobQueue = this.jobsStateChangesInternalQueue.get(jobId);
    if (!jobQueue || jobQueue.length === 0) {
      return;
    }

    // Process the first change in the queue
    const change = jobQueue[0];

    try {
      // Process the state change using the internal function
      // console.log(
      //   `${this.addressShortString} ${getJobColorizedString(jobId)} 🤡 stateChangeInternal length: ${jobQueue.length}`,
      // );
      await this._stateChangeInternal(change);
    } catch (error) {
      console.error(`Error processing state change for job ${jobId}:`, error);
    } finally {
      // Remove the processed change from the queue
      jobQueue.shift();

      // If there are more changes in the queue, process the next one
      if (jobQueue.length > 0) {
        // Use setTimeout to ensure this runs in the next tick, preventing stack overflow
        setTimeout(() => {
          this.processJobStateChangeQueue(jobId);
        }, 0);
      } else {
        // No more changes for this job, remove the queue
        this.jobsStateChangesInternalQueue.delete(jobId);
      }
    }
  }

  // Mark methods that could be overridden as protected
  public async _stateChangeInternal(change: StateChange): Promise<void> {
    // console.log(`${this.addressShortString} ${getJobColorizedString(change.job)} stateChange`, change);
    // console.log(
    //   `${this.addressShortString} ${getJobColorizedString(change.job)} current state`,
    //   this.state.jobs[change.job],
    // );
    if (change.state === DockerJobState.Queued) {
      await this.stateChangeJobEnqueue(
        (change.value as StateChangeValueQueued).enqueued,
      );
      return;
    } else if (change.state === DockerJobState.Running) {
      await this.stateChangeJobRunning(
        change.job,
        change.value as StateChangeValueRunning,
      );
      return;
    } else if (change.state === DockerJobState.Finished) {
      await this.stateChangeJobFinished(
        change.job,
        change.value as StateChangeValueFinished,
      );
      return;
    } else if (change.state === DockerJobState.Removed) {
      if (this.state.jobs[change.job]) {
        this.state.jobs[change.job] = setJobStateRemoved(this.state.jobs[change.job]);
      }
      return;
    }
  }

  protected async broadcastCurrentStateBecauseIDoubtStateIsSynced(
    jobId: string,
  ): Promise<void> {
    await this.broadcastJobStatesToWebsockets([jobId]);
    this.broadcastJobStatesToChannel([jobId]);
  }

  // public async stateChangeJobRequeued(
  //   jobId: string,
  //   change: StateChangeValueReQueued,
  // ): Promise<void> {
  //   if (!this.state.jobs[jobId]) {
  //     // be robust, assume very little.
  //     const possibleMissedJob = await this.db.queueJobGet({
  //       queue: this.address,
  //       jobId,
  //     });
  //     if (possibleMissedJob) {
  //       this.state.jobs[jobId] = possibleMissedJob;
  //     }
  //   }

  //   const jobString = getJobColorizedString(jobId);
  //   if (!this.state.jobs[jobId]) {
  //     console.log(`${jobString} ❗ ignoring StateChangeValueReQueued because no job in db or memory`, change);
  //     return;
  //   }

  //   // previous state
  //   switch (this.state.jobs[jobId].state) {
  //     case DockerJobState.Queued:
  //       console.log(
  //         `${jobString} Queued -> ReQueued (maybe worker went missing or job was lost) no change`,
  //       );
  //       break;
  //     case DockerJobState.Running: {
  //       console.log(
  //         `${jobString} Running -> ReQueued? ❗❗ I hope this is because the worker went missing ❗`,
  //       );
  //       // await updateState(true);
  //       break;
  //     }
  //     case DockerJobState.Finished: {
  //       console.log(
  //         `${jobString} Finished -> ReQueued? What ❓❓❓. Rebroadcasting state`,
  //       );

  //       break;
  //     }
  //   }

  //   await this.broadcastCurrentStateBecauseIDoubtStateIsSynced(jobId);
  // }

  public async stateChangeJobFinished(
    jobId: string,
    change: StateChangeValueFinished,
  ): Promise<void> {
    const namespace = change.namespace || DefaultNamespace;
    if (!this.state.jobs[jobId]) {
      // be robust, assume very little.
      const possibleMissedJob = await this.db.queueJobGet({
        queue: this.address,
        jobId,
      });
      if (possibleMissedJob) {
        this.state.jobs[jobId] = possibleMissedJob;
      }
    }

    if (!this.state.jobs[jobId]) {
      console.log(
        `${this.addressShortString} ${
          getJobColorizedString(jobId)
        } ❗ ignoring stateChangeJobFinished because no job in db or memory`,
        change,
      );
      return;
    }

    // console.log(`${this.addressShortString} ${getJobColorizedString(jobId)} 🤡 stateChangeJobFinished`, change);
    // console.log(`${this.addressShortString} ${getJobColorizedString(jobId)} 🤡 currentState`, this.state.jobs[jobId]);

    const { updatedInMemoryJob, subsequentStateChange } = await this.db.setJobFinished({
      queue: this.address,
      jobId,
      change,
      job: this.state.jobs[jobId],
    });
    // console.log(
    //   `${this.addressShortString} ${getJobColorizedString(jobId)} 🤡🤡🤡🤡 updatedInMemoryJob`,
    //   updatedInMemoryJob,
    // );

    if (updatedInMemoryJob?.finished?.reason === DockerJobFinishedReason.Deleted) {
      // tell workers to delete the job from their cache

      this.broadcastToLocalWorkers(
        JSON.stringify({
          type: WebsocketMessageTypeServerBroadcast.ClearJobCache,
          payload: {
            jobId,
            namespace,
          } as PayloadClearJobCache,
        } as WebsocketMessageServerBroadcast),
      );
      // broadcast so all servers tell workers to delete the job from their cache
      this.channel.postMessage({
        type: "delete-cached-job",
        value: { jobId, namespace } as BroadcastChannelDeleteCachedJob,
      } as BroadcastChannelMessage);
    }

    if (updatedInMemoryJob) {
      this.state.jobs[jobId] = updatedInMemoryJob;
      await this.broadcastCurrentStateBecauseIDoubtStateIsSynced(jobId);
    }

    if (subsequentStateChange) {
      await this.stateChange(subsequentStateChange);
      return;
    }

    // when a job finishes, check the queue a bit later
    // and remove old jobs from the queue. the results
    // have already been persisted in the db
    setTimeout(() => {
      this.removeOldFinishedJobsFromQueue();
    }, MAX_TIME_FINISHED_JOB_IN_QUEUE);
  }

  public async stateChangeJobRunning(
    jobId: string,
    change: StateChangeValueRunning,
  ): Promise<void> {
    if (!this.state.jobs[jobId]) {
      // be robust, assume very little.
      const possibleMissedJob = await this.db.queueJobGet({
        queue: this.address,
        jobId,
      });
      if (possibleMissedJob) {
        this.state.jobs[jobId] = possibleMissedJob;
      }
    }
    const jobString = getJobColorizedString(jobId);
    if (!this.state.jobs[jobId]) {
      console.log(`${jobString} ❗ ignoring stateChangeJobRunning because no job in db or memory`, change);
      return;
    }

    console.log(`${this.addressShortString} ${getJobColorizedString(jobId)} 🤡 stateChangeJobRunning`, change);

    try {
      let updateState = false;
      switch (this.state.jobs[jobId].state) { // previous state
        case DockerJobState.Finished: {
          // it can NEVER go from Finished to Running, it has to be re-queued
          console.log(
            `${jobString} ignoring request state change ${DockerJobState.Running} !=> ${DockerJobState.Finished}\ncurrent job: ${
              JSON.stringify(this.state.jobs[jobId])
            }\nchange: ${JSON.stringify(change)}`,
          );
          break;
        }
        // yeah running can be set again, e.g. updated the value to include sub-states
        case DockerJobState.Running: {
          // ok some other worker, or the same one, is saying it's running again
          // If the worker is the same, then it's just an update
          // If the worker is different, then possibly two have claimed the
          // same job. This is possible because claiming a job is not a transaction
          // so that jobs are worked on as fast as possible, but this means that
          // a duplicate job might be started. The duplicate job will be very quickly
          // removed by overwriting, and the worker will see that another worker
          // claimed the job they are working on and kill it's unneeded job.
          // We need to blast the job state again to all workers and api servers
          // so they can overwrite.

          // TODO: check the worker
          // update the value if changed, that's a sub-state
          const currentRunningWorker = this.state.jobs[jobId].worker;
          const incomingWorker = change.worker;

          if (currentRunningWorker !== incomingWorker) {
            const preferredWorker = resolvePreferredWorker(
              currentRunningWorker,
              incomingWorker,
            );
            const preferCurrentWorker = preferredWorker === currentRunningWorker;
            console.log(
              `${jobString}] Running -> Running, but different worker, assigning to ${
                getWorkerColorizedString(preferredWorker)
              }`,
            );
            if (!preferCurrentWorker) {
              // overwrite the current state
              updateState = true;
            }
          } else {
            console.log(
              `${jobString} 🇨🇭🇨🇭🇨🇭 Running -> Running, same worker, so doing nothing: ${
                getWorkerColorizedString(change.worker)
              }`,
            );
          }
          break;
        }
        case DockerJobState.Queued: {
          // queued to running is great
          updateState = true;
          break;
        }
        default:
          break;
      }
      if (updateState && this.state.jobs[jobId].state === DockerJobState.Queued) {
        this.state.jobs[jobId] = setJobStateRunning(this.state.jobs[jobId], {
          worker: change.worker,
          time: change.time,
        });

        await this.db.setJobRunning({
          jobId,
          worker: change.worker,
          time: change.time,
        });
      }
      await this.broadcastCurrentStateBecauseIDoubtStateIsSynced(jobId);
    } catch (err) {
      console.log(`💥💥💥 ERROR ${err}`, (err as Error).stack);
    }
  }

  // Mark methods that could be overridden as protected
  public async stateChangeJobEnqueue(enqueued: EnqueueJob): Promise<void> {
    if (!enqueued?.definition) {
      console.log(`enqueueJob but bad state ${JSON.stringify(enqueued)}`);
      return;
    }

    console.log(`${this.addressShortString} ${getJobColorizedString(enqueued.id)} 🤡 stateChangeJobEnqueue`, enqueued);

    const jobId = enqueued.id;
    const namespace = enqueued?.control?.namespace || DefaultNamespace;

    let okToEnqueue = false;
    if (this.state.jobs[jobId]) {
      // previous state
      switch (this.state.jobs[jobId].state) {
        case DockerJobState.Queued:
        case DockerJobState.Running: {
          console.log(
            `${getJobColorizedString(jobId)} Queued -> ${
              this.state.jobs[jobId].state
            } ignoring queue request, job already queued or running`,
          );

          this.db.queueJobAddNamespace({
            queue: this.address,
            jobId,
            namespace,
          });
          const namespaces = await this.db.queueJobGetNamespaces({ queue: this.address, jobId });
          this.state.jobs[jobId].namespaces = namespaces;

          this.checkForSourceConflicts();
          await this.broadcastCurrentStateBecauseIDoubtStateIsSynced(jobId);
          break;
        }
        case DockerJobState.Finished: {
          const finishedReason = this.state.jobs[jobId].finishedReason || DockerJobFinishedReason.Error;

          switch (finishedReason) {
            case DockerJobFinishedReason.Cancelled:
            case DockerJobFinishedReason.Deleted:
            case DockerJobFinishedReason.JobReplacedByClient:
              console.log(
                `${getJobColorizedString(jobId)} restarting from user`,
              );
              okToEnqueue = true;
              // await updateState(true);
              break;
            case DockerJobFinishedReason.WorkerLost:
              console.log(
                `!!!! BAD LOGIC ${
                  getJobColorizedString(
                    jobId,
                  )
                } restarting from worker lost`,
              );
              okToEnqueue = true;
              // await updateState();
              break;
            case DockerJobFinishedReason.Success:
            case DockerJobFinishedReason.Error:
            case DockerJobFinishedReason.TimedOut:
              console.log(
                `${
                  getJobColorizedString(
                    jobId,
                  )
                } ignoring Queued request current state=[${
                  this.state.jobs[jobId].state
                }] reason=[${finishedReason}], job finished and not restartable`,
              );
              await this.broadcastCurrentStateBecauseIDoubtStateIsSynced(jobId);
              break;
          }
          break;
        }
      }
    } else {
      // TODO: check for finished jobs in the db
      console.log(
        `${this.addressShortString} ${
          getJobColorizedString(
            jobId,
          )
        } adding new job row to local state as Queued`,
      );
      okToEnqueue = true;
    }
    if (!okToEnqueue) {
      return;
    }

    // save to db
    const inMemoryJob = await this.db.queueJobAdd({
      queue: this.address,
      job: enqueued,
    });
    if (inMemoryJob) {
      this.state.jobs[jobId] = inMemoryJob;
    } else {
      // if no job is return by queueJobAdd it means the job no longer exists
      return;
    }
    this.checkForSourceConflicts();

    // broadcast first
    // this.broadcastJobStatesToChannel([jobId]);
    // this.broadcastJobStatesToWebsockets([jobId]);
    // enqueueing a job should broadcast the whole queue
    this.broadcastJobStatesToChannel();
    this.broadcastJobStatesToWebsockets();
  }

  protected async removeOldFinishedJobsFromQueue() {
    // check for finished jobs around longer than a minute

    let sendBroadcast = false;
    for (
      const [jobId, job] of Object.entries<InMemoryDockerJob>(
        this.state.jobs,
      )
    ) {
      const isRemovable = isJobRemovableFromQueue(job);
      if (isRemovable) {
        if (job?.namespaces) {
          for (const namespace of job?.namespaces) {
            this.db.queueJobRemove({ queue: this.address, jobId, namespace });
          }
        }
        delete this.state.jobs[jobId];
        sendBroadcast = true;
      }
    }

    if (sendBroadcast) {
      await this.broadcastJobStatesToWebsockets();
    }
  }

  async connectWorker(connection: { socket: WebSocket }) {
    console.log(`${this.addressShortString} ➕ w ⏯️ Connected a worker`);

    let workerRegistration: WorkerRegistration | undefined;
    let workerIdColorized: string | undefined;
    const emitter = createNanoEvents<NanoEventWorkerMessageEvents>();
    let lastPingTime = Date.now();
    const connectionStartTime = Date.now();
    let messageCount = 0;

    connection.socket.addEventListener("close", () => {
      const uptime = Date.now() - connectionStartTime;
      console.log(
        `[${this.addressShortString} ${workerIdColorized}] ➖ w 🔌 ⏹️ removing worker after ${
          Math.round(
            uptime / 1000,
          )
        }s uptime, ${messageCount} messages sent`,
      );
      // https://github.com/ai/nanoevents?tab=readme-ov-file#remove-all-listeners
      emitter.events = {};
      const index = this.workers.myWorkers.findIndex(
        (w) => w.connection === connection.socket,
      );
      if (index > -1) {
        console.log(
          `${this.addressShortString} ➖ w ⏹️ close event: Removing worker ${
            getWorkerColorizedString(
              this.workers.myWorkers[index].registration.id,
            )
          }`,
        );
        this.workers.myWorkers.splice(index, 1);
        this.myWorkersHaveChanged();
      }
    });

    connection.socket.addEventListener("message", (event) => {
      try {
        messageCount++;
        const { data: message } = event;
        if (this.debug) {
          console.log(`➡️ 📧 from worker `, message);
        }
        if (typeof message !== "string" || !message) {
          // we currently do not support binary
          if (this.debug) {
            console.log(
              `➡️ 📧 from worker ${workerIdColorized || "unknown"} is not a string rather:`,
              typeof message,
            );
          }
          return;
        }

        const messageString = message;
        if (!messageString || messageString === "undefined") {
          return;
        }

        if (messageString === "PING") {
          lastPingTime = Date.now();
          connection.socket.send(
            "PONG " + (workerRegistration?.id || "unknown"),
          );
          // To help with missing workers, send the current state of the unclaimed jobs
          // to the worker when it pings
          this.sendJobStatesToWebsocket(
            connection.socket,
            Object.keys(this.state.jobs).filter(
              (jobId) => this.state.jobs[jobId].state !== DockerJobState.Finished,
            ),
          );

          return;
        }

        if (!messageString.startsWith("{")) {
          console.log(
            "worker message message not JSON",
            messageString.substring(0, 100),
          );
          return;
        }
        const possibleMessage: WebsocketMessageWorkerToServer = JSON.parse(messageString);

        // Send to other internal listeners
        try {
          emitter.emit("message", possibleMessage);
        } catch (err) {
          console.log("emitter error", err);
        }

        switch (possibleMessage.type) {
          case WebsocketMessageTypeWorkerToServer.StateChange: {
            const change: StateChange = possibleMessage.payload as StateChange;
            if (!change) {
              console.log({
                error: `Missing payload in message from worker ${workerIdColorized || "unknown"}`,
                message: messageString.substring(0, 100),
              });
              break;
            }
            this.stateChange(change);
            break;
          }
          // from the workers
          case WebsocketMessageTypeWorkerToServer.WorkerRegistration: {
            const newWorkerRegistration = possibleMessage.payload as WorkerRegistration;

            if (!newWorkerRegistration) {
              console.log({
                error: "Missing payload in message from worker",
                message: messageString.substring(0, 100),
              });
              break;
            }

            workerIdColorized = getWorkerColorizedString(
              newWorkerRegistration.id,
            );

            if (this.debug) {
              console.log(
                `🔍 [DEBUG] Server received worker registration:`,
                JSON.stringify(newWorkerRegistration, null, 2),
              );
            }

            const indexOfCurrent = this.workers.myWorkers.findIndex(
              (w) => w.registration.id === newWorkerRegistration.id,
            );
            // If there is nothing
            if (indexOfCurrent < 0) {
              this.workers.myWorkers.push({
                registration: newWorkerRegistration,
                connection: connection.socket,
                emitter,
              });
              console.log(
                `${this.addressShortString} 🔌 🔗 Worker registered (so broadcasting) ${
                  workerIdColorized || "unknown"
                }`,
              );
              if (this.debug) {
                console.log(`🔍 [DEBUG] Server worker ${workerIdColorized} added to workers list`);
                console.log(`🔍 [DEBUG] Server total workers: ${this.workers.myWorkers.length}`);
              }
            } else {
              console.log(
                `${this.addressShortString} ${
                  workerIdColorized || "unknown"
                } ✨ 🔗 Worker RE-registering (so broadcasting) `,
              );
              this.workers.myWorkers[indexOfCurrent].registration = newWorkerRegistration;
              if (this.debug) {
                console.log(`🔍 [DEBUG] Server worker ${workerIdColorized} re-registered`);
              }
            }
            workerRegistration = newWorkerRegistration;

            this.myWorkersHaveChanged();
            break;
          }
          case WebsocketMessageTypeWorkerToServer.WorkerStatusResponse: {
            // const statusFromWorker = possibleMessage
            //   .payload as WorkerStatusResponse;

            break;
          }
          case WebsocketMessageTypeWorkerToServer.JobStatusLogs: {
            const logsFromWorker = possibleMessage.payload as JobStatusPayload;
            // Send to all clients
            this.broadcastAndSendLogsToLocalClients(logsFromWorker);
            break;
          }
          case WebsocketMessageTypeWorkerToServer.RequestJobDefinitions: {
            const requestJobDefinitions = possibleMessage.payload as RequestJobDefinitions;
            const jobIds = requestJobDefinitions.jobIds;
            const jobDefinitions: Record<string, DockerJobDefinitionInputRefs> = {};
            (async () => {
              for (const jobId of jobIds) {
                const def = await this.db.getJobDefinition(jobId);
                if (def) {
                  jobDefinitions[jobId] = def;
                }
              }
              if (Object.keys(jobDefinitions).length > 0) {
                this.broadcastJobDefinitionsToLocalWorkers(jobDefinitions);
              }
            })();

            break;
          }
          default:
            //ignored
        }
      } catch (err) {
        console.log(err);
      }
    });

    if (this.debug) {
      console.log(
        `⬅️ 📧 w sendJobStatesToWebsocket worker ${workerIdColorized || "unknown"}`,
      );
    }
    await this.sendJobStatesToWebsocket(connection.socket);

    // Monitor worker connection health
    const healthCheckInterval = setInterval(() => {
      const timeSinceLastPing = Date.now() - lastPingTime;
      const uptime = Date.now() - connectionStartTime;

      if (timeSinceLastPing > 30000) {
        // 30 seconds
        console.log(
          `🚨 Worker ${workerIdColorized || "unknown"} hasn't pinged for ${
            Math.round(
              timeSinceLastPing / 1000,
            )
          }s (uptime: ${Math.round(uptime / 1000)}s)`,
        );
      }

      // Log health every 5 minutes
      if (uptime % 300000 < 5000) {
        // Every 5 minutes
        console.log(
          `${workerIdColorized || "unknown"} health: ` +
            `uptime=${Math.round(uptime / 1000)}s, ` +
            `lastPing=${Math.round(timeSinceLastPing / 1000)}s ago, ` +
            `messages=${messageCount}`,
        );
      }
    }, 10000); // Check every 10 seconds

    // Clean up interval when connection closes
    connection.socket.addEventListener("close", () => {
      clearInterval(healthCheckInterval);
    });
  }

  async connectClient(connection: { socket: WebSocket }) {
    console.log(`${this.addressShortString} ➕ c ⏯️ Connected a client`);
    this.clients.push(connection.socket);
    connection.socket.addEventListener("close", () => {
      const index = this.clients.indexOf(connection.socket);
      if (index > -1) {
        console.log(
          `${this.addressShortString} ➖ c ⏹️ close event: Removing client`,
        );
        this.clients.splice(index, 1);
      }
    });

    connection.socket.addEventListener("message", (event) => {
      try {
        const { data: message } = event;
        if (typeof message !== "string" || !message) {
          // we currently do not support binary
          return;
        }

        const messageString = message.toString();
        if (!messageString || messageString === "undefined") {
          return;
        }
        if (messageString === "PING") {
          connection.socket.send("PONG");
          return;
        }
        if (!messageString.startsWith("{")) {
          console.log(
            `${this.addressShortString} browser message not JSON`,
            messageString,
          );
          console.log(
            `${this.addressShortString} browser message not JSON`,
            typeof messageString,
          );

          return;
        }
        const possibleMessage: WebsocketMessageClientToServer = JSON.parse(messageString);
        switch (possibleMessage.type) {
          case WebsocketMessageTypeClientToServer.StateChange: {
            const change: StateChange = possibleMessage.payload as StateChange;
            if (!change) {
              console.log({
                error: "Missing payload in message from browser",
                message: messageString.substring(0, 100),
              });
              break;
            }
            this.stateChange(change);
            break;
          }

          case WebsocketMessageTypeClientToServer.QueryJob: {
            (() => {
              // Send a message to our local workers to clear their respective caches
              const jobId = (possibleMessage.payload as PayloadQueryJob).jobId;
              if (!jobId) {
                return;
              }
              // send the job state to the client
              this.sendJobStatesToWebsocket(connection.socket, [jobId]);
            })();
            break;
          }

          case WebsocketMessageTypeClientToServer.QueryJobStates: {
            this.broadcastJobStatesToWebsockets();
            break;
          }

          default: {
            //ignored
          }
        }
      } catch (err) {
        console.log(err);
      }
    });

    this.sendWorkersListToWebsocket(connection.socket);
    await this.sendJobStatesToWebsocket(connection.socket);
  }

  createWebsocketBroadcastMessageJobStates(jobIds?: string[]): Promise<string> {
    const sendingJobIds = jobIds || Object.keys(this.state.jobs);
    return this.createWebsocketBroadcastMessageJobStatesInternal(
      sendingJobIds,
      jobIds ? false : true,
    );
  }

  async createWebsocketBroadcastMessageJobStatesInternal(
    jobIds: string[],
    isAll = false,
  ): Promise<string> {
    if (this.debug) {
      console.log(`🔍 [DEBUG] Server createWebsocketBroadcastMessageJobStatesInternal called:`);
      console.log(`  - jobIds: ${jobIds.join(", ")}`);
      console.log(`  - isAll: ${isAll}`);
    }

    const jobStatesToSend: BroadcastJobStates = { state: { jobs: {} } };
    jobStatesToSend.isSubset = !isAll;
    const message: WebsocketMessageServerBroadcast = {
      // If you supply jobIds it's not the full set
      type: isAll ? WebsocketMessageTypeServerBroadcast.JobStates : WebsocketMessageTypeServerBroadcast.JobStateUpdates,
      payload: jobStatesToSend,
    };
    for (const jobId of jobIds) {
      let job: InMemoryDockerJob | undefined | null = this.state.jobs[jobId];
      if (!job) {
        job = await this.db.queueJobGet({ queue: this.address, jobId });
      }

      if (!job) {
        continue;
      }

      if (!isJobOkForSending(job)) {
        continue;
      }

      jobStatesToSend.state.jobs[jobId] = job;
    }

    const messageString = JSON.stringify(message);

    if (this.debug) {
      const jobCount = Object.keys(jobStatesToSend.state.jobs).length;
      const stateCounts = Object.values(jobStatesToSend.state.jobs).reduce((acc, job) => {
        acc[job.state] = (acc[job.state] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`🔍 [DEBUG] Server created message with ${jobCount} jobs:`, stateCounts);
    }

    return messageString;
  }

  protected broadcastToLocalWorkers(messageString: string) {
    if (!messageString) {
      return;
    }
    const failedWorkers: string[] = [];

    if (this.debug) {
      console.log(
        `🔍 [DEBUG] Server broadcasting to ${this.workers.myWorkers.length} workers:`,
        messageString.substring(0, 200),
      );
    }

    this.workers.myWorkers.forEach((worker) => {
      try {
        if (worker.connection.readyState === WebSocket.OPEN) {
          worker.connection.send(messageString);
          if (this.debug) {
            console.log(`🔍 [DEBUG] Server sent message to worker ${getWorkerColorizedString(worker.registration.id)}`);
          }
        } else {
          console.log(
            `🚨 Worker ${
              getWorkerColorizedString(
                worker.registration.id,
              )
            } websocket not open (state: ${worker.connection.readyState})`,
          );
          failedWorkers.push(worker.registration.id);
        }
      } catch (err) {
        console.log(
          `🚨 Failed to send message to worker ${
            getWorkerColorizedString(
              worker.registration.id,
            )
          }: ${err}`,
        );
        failedWorkers.push(worker.registration.id);
      }
    });

    // Remove failed workers
    if (failedWorkers.length > 0) {
      console.log(
        `🚨 Removing ${failedWorkers.length} failed workers: ${
          failedWorkers
            .map((id) => getWorkerColorizedString(id))
            .join(", ")
        }`,
      );
      this.workers.myWorkers = this.workers.myWorkers.filter(
        (worker) => !failedWorkers.includes(worker.registration.id),
      );
      this.myWorkersHaveChanged();
    }
  }

  protected broadcastToLocalClients(messageString: string) {
    if (!messageString) {
      return;
    }
    const failedClients: number[] = [];

    this.clients.forEach((connection, index) => {
      try {
        if (connection.readyState === WebSocket.OPEN) {
          connection.send(messageString);
        } else {
          failedClients.push(index);
        }
      } catch (err) {
        console.log(`Failed to send broadcast to browser ${err}`);
        failedClients.push(index);
      }
    });

    // Remove failed clients (in reverse order to maintain indices)
    failedClients.reverse().forEach((index) => {
      this.clients.splice(index, 1);
    });
  }

  async broadcastJobStatesToWebsockets(jobIds?: string[]) {
    const messageString = await this.createWebsocketBroadcastMessageJobStates(jobIds);
    if (!messageString) {
      return;
    }

    this.broadcastToLocalWorkers(messageString);
    this.broadcastToLocalClients(messageString);
  }

  broadcastJobDefinitionsToLocalWorkers(definitions: Record<string, DockerJobDefinitionInputRefs>) {
    const payload: BroadcastJobDefinitions = {
      definitions,
    };
    const message: WebsocketMessageServerBroadcast = {
      type: WebsocketMessageTypeServerBroadcast.BroadcastJobDefinitions,
      payload,
    };
    const messageString = JSON.stringify(message);
    this.broadcastToLocalWorkers(messageString);
  }

  async sendJobStatesToWebsocket(connection: WebSocket, jobIds?: string[]) {
    const messageString = await this.createWebsocketBroadcastMessageJobStates(
      jobIds,
    );
    if (!messageString) {
      return;
    }
    try {
      if (connection.readyState === WebSocket.OPEN) {
        connection.send(messageString);
        if (this.debug) {
          console.log(
            `📤 Sent job states to websocket (${jobIds?.length || "all"} jobs)`,
          );
        }
      } else {
        console.log(
          `🚨 Cannot send job states: websocket not open (state: ${connection.readyState})`,
        );
      }
    } catch (err) {
      console.log(`🚨 Failed sendJobStatesToWebsocket to connection ${err}`);

      // Retry once after a short delay
      setTimeout(() => {
        try {
          if (connection.readyState === WebSocket.OPEN) {
            connection.send(messageString);
            console.log(`📤 Retry successful: sent job states to websocket`);
          }
        } catch (retryErr) {
          console.log(`🚨 Retry failed sendJobStatesToWebsocket: ${retryErr}`);
        }
      }, 1000);
    }
  }

  sendWorkersListToWebsocket(connection: WebSocket) {
    const messageString = this.createWebsocketBroadcastWorkersRegistrationMessage();
    // console.log(`❔ sending workers to browser: `, messageString)
    if (!messageString) {
      return;
    }
    try {
      connection.send(messageString);
    } catch (err) {
      console.log(`Failed sendWorkersListToWebsocket to connection ${err}`);
    }
  }

  /**
   * Tell all this queues (browser) clients and workers about all
   * the workers. These are basically all the websocket connections.
   */
  broadcastWorkersToClientsAndWorkers() {
    // create a message for broadcasting to other servers
    // this only contains our workers
    const messageString = this.createWebsocketBroadcastWorkersRegistrationMessage();
    // console.log(`❔ broadcastWorkersToClientsAndWorkers`, messageString)
    this.clients.forEach((connection) => {
      try {
        connection.send(messageString);
      } catch (err) {
        console.log(`Failed to send broadcast to browser ${err}`);
      }
    });
    // We don't actually NEED to update the workers yet, but in the future
    // they can use this information to make better decisions
    this.workers.myWorkers.forEach((worker) => {
      try {
        worker.connection.send(messageString);
      } catch (err) {
        console.log(`Failed to send broadcast to worker ${err}`);
      }
    });
  }

  checkForMissingWorkers() {
    const now = Date.now();
    // check all the local workers
    let isMyWorkersChanged = false;

    for (const [workerId, worker] of Object.entries(this.workers.myWorkers)) {
      if (
        now - worker.registration.time >
          INTERVAL_UNTIL_WORKERS_ASSUMED_LOST
      ) {
        console.log(
          `${this.addressShortString} 🪓 removing worker ${
            getWorkerColorizedString(
              workerId,
            )
          } because it's missing`,
        );

        let index = 0;
        while (index > -1) {
          index = this.workers.myWorkers.indexOf(worker);
          this.workers.myWorkers.splice(index, 1);
        }

        isMyWorkersChanged = true;
      }
    }
    if (isMyWorkersChanged) {
      this.myWorkersHaveChanged();
    }
  }

  broadcastWorkersToChannel() {
    // create a message for broadcasting to other servers
    const time = Date.now() + INTERVAL_UNTIL_WORKERS_ASSUMED_LOST;
    const message: BroadcastChannelMessage = {
      origin: this.serverId,
      type: "workers",
      value: {
        workers: {
          [this.serverId]: this.workers.myWorkers.map((w) => w.registration),
        },
        time,
      },
    };
    // use the BroadcastChannel to notify other servers
    this.channel.postMessage(message);
  }

  /**
   * Tell everyone else that our workers have changed
   */
  myWorkersHaveChanged() {
    this.broadcastWorkersToChannel();
    // update the other workers and (browser) clients
    this.broadcastWorkersToClientsAndWorkers();
  }

  requeueJobsFromMissingWorkers() {
    // check for finished jobs around longer than a minute
    const now = Date.now();
    // create a set of worker ids
    const workerIds = new Set();
    for (const serverId of this.workers.otherWorkers.keys()) {
      this.workers.otherWorkers
        .get(serverId)
        ?.forEach((w) => workerIds.add(w.id));
    }

    this.workers.myWorkers.forEach((w) => workerIds.add(w.registration.id));

    // check all the jobs
    let requeuedCount = 0;
    for (
      const [jobId, job] of Object.entries<InMemoryDockerJob>(
        this.state.jobs,
      )
    ) {
      if (job.state === DockerJobState.Running) {
        if (!workerIds.has(job.worker)) {
          console.log(
            `${this.addressShortString} ${getJobColorizedString(jobId)} 🚨 requeuing job because worker ${
              getWorkerColorizedString(job.worker)
            } is missing (last seen: ${
              Math.round(
                (now - job.time) / 1000,
              )
            }s ago)`,
          );

          const reQueueStateChange: StateChange = {
            tag: this.serverId,
            state: DockerJobState.Finished,
            job: jobId,
            value: {
              time: now,
              // this will set the job back to queued
              reason: DockerJobFinishedReason.WorkerLost,
            } as StateChangeValueFinished,
          };
          this.stateChange(reQueueStateChange);
          requeuedCount++;
        }
      }
    }

    if (requeuedCount > 0) {
      console.log(
        `${this.addressShortString} 🚨 Requeued ${requeuedCount} jobs from missing workers in queue`,
      );
    }
  }

  otherWorkersHaveChanged(workers: ServerWorkersObject) {
    // for our local records: filter out workers that no longer exist on other servers
    // console.log(`otherWorkersHaveChanged`, workers)
    let updated = false;
    for (const [otherServerId, workersList] of Object.entries(workers)) {
      if (otherServerId === this.serverId) {
        // ignore, and should not happen
      } else {
        this.workers.otherWorkers.set(otherServerId, workersList);
        updated = true;
      }
    }
    if (updated) {
      this.broadcastWorkersToClientsAndWorkers();
    }
  }

  createWebsocketBroadcastWorkersRegistrationMessage(): string {
    const workers: WorkerRegistration[] = [];
    const workersRegistration: BroadcastWorkers = { workers };
    const message: WebsocketMessageServerBroadcast = {
      type: WebsocketMessageTypeServerBroadcast.Workers,
      payload: workersRegistration,
    };

    const alreadyAdded = new Set<string>();
    this.workers.myWorkers.forEach((w) => {
      if (alreadyAdded.has(w.registration.id)) {
        return;
      }
      workers.push(w.registration);
      alreadyAdded.add(w.registration.id);
    });

    for (
      const [
        _,
        otherWorkerRegistrations,
      ] of this.workers.otherWorkers.entries()
    ) {
      otherWorkerRegistrations.forEach((w: WorkerRegistration) => {
        if (alreadyAdded.has(w.id)) {
          return;
        }
        workers.push(w);
        alreadyAdded.add(w.id);
      });
    }
    const messageString = JSON.stringify(message);
    return messageString;
  }

  async checkForBadJobs() {
    // an upgrade shaped the data structure,
    // obsolete jobs we just ignore and wait for them to naturally expire
    /* namespace -> jobId[] */

    for (const [jobId, job] of Object.entries<InMemoryDockerJob>(this.state.jobs)) {
      if ((job as unknown as { type: string }).type) {
        await this.db.queueJobRemove({ queue: this.address, jobId, namespace: "*" });
        delete this.state.jobs[jobId];
      }
    }
  }

  /**
   * Jobs can be submitted with a namespace, and there can only be a single
   * job for a given namespace. This is e.g. a job submitted by the metaframe
   * client inside a metapage.
   * There are some complicating factors:
   *   - jobs can be rapidly submitted with different ids, and the job at
   *     a given namespace should "settle", as inputs arrive. This means
   *     that we cannot be too strict, and should only kill conflicting jobs
   *     after some time interval that has allowed the client to finalize its
   *     inputs and thus unique jobId
   */
  async checkForSourceConflicts() {
    // https://github.com/metapages/compute-queues/issues/242

    // check all the jobs

    const now = Date.now();

    /* namespace -> jobId[] */
    const namespaces: Record<string, string[]> = {};
    for (const [jobId, job] of Object.entries<InMemoryDockerJob>(this.state.jobs)) {
      if (!job.namespaces || job.namespaces.length === 0) {
        const namespaces = await this.db.queueJobGetNamespaces({ queue: this.address, jobId });
        job.namespaces = namespaces;
      }
      // Still ?
      if (
        job.namespaces.length === 0 && (job.state === DockerJobState.Queued || job.state === DockerJobState.Running)
      ) {
        console.log(`${this.addressShortString} ${getJobColorizedString(jobId)} 👺 has empty namespace, cancelling`);
        const finishedStateChange: StateChangeValueFinished = {
          type: DockerJobState.Finished,
          reason: DockerJobFinishedReason.Cancelled,
          message: "Job cancelled because it has no namespace",
          namespace: DefaultNamespace,
          time: Date.now(),
        };

        await this.stateChangeJobFinished(
          jobId,
          finishedStateChange,
        );
        continue;
      }

      for (const namespace of job.namespaces) {
        if (!namespaces[namespace]) {
          namespaces[namespace] = [];
        }
        namespaces[namespace]!.push(jobId);
      }
    }

    // console.log(`👺 checkForSourceConflicts namespaces: `, namespaces);

    // for (const [namespace, jobIds] of Object.entries(this.state.namespaces)) {
    for (const [namespace, jobIds] of Object.entries<string[]>(namespaces)) {
      // console.log(`👺 ??? namespace=${namespace} :  ${jobIds}`);
      if (namespace === DefaultNamespace) {
        continue;
      }
      if (jobIds.length > 1) {
        console.log(
          `👺 🚨 source conflict for ${namespace}: ${jobIds.map((id) => getJobColorizedString(id)).join(", ")}`,
        );
        // what do I do? keep the newest job, and kill the others.
        // we should hesitate to kill long running jobs, but we also
        // don't want to end up with a lot of them, so we have to strike
        // a balance.
        // If a) the older jobs are less than a minute old, or b) the difference
        // between the newest job running time and the others is over a minute,
        // then we kill the older jobs.
        // Otherwise, we keep the newest job.
        // latest last
        // Plot twist: the same job can be started by multiple userspaces and be in different queues
        // so finishing the job in one queue doesn't mean it's finished in all queues

        // console.log(
        //   `👺 namespace=[${namespace}] jobTimes: ` +
        //     jobIds.map((id) => "[" + id.substring(0, 6) + "=" + this.state.jobs[id].queuedTime + "]").join(", "),
        // );
        const sortedJobIds = jobIds.toSorted((a, b) => {
          if (!this.state.jobs[a]) {
            return 1;
          }
          if (!this.state.jobs[b]) {
            return -1;
          }
          const aJobTime = this.state.jobs[a].queuedTime;
          const bJobTime = this.state.jobs[b].queuedTime;
          return aJobTime - bJobTime;
        });
        console.log(
          `👺 namespace=[${namespace}] sortedJobIds: ` + sortedJobIds.map((id) => id.substring(0, 6)).join(", "),
        );
        sortedJobIds.pop(); // keep the newest job
        for (const jobId of sortedJobIds) {
          const job = this.state.jobs[jobId];
          if (!job) {
            continue;
          }
          const jobTime = job.queuedTime;
          const jobAge = now - jobTime;
          const deletionDelay = getDeletionDelayForNamespaceSupersededJob(
            jobAge,
          );
          if (deletionDelay > 0) {
            // check again in a bit
            setTimeout(() => {
              this.checkForSourceConflicts();
            }, deletionDelay);
            continue;
          }
          // kill it
          // TODO: plot twist: but not if it's in other queues, but this queue
          // should definitely remove it from its own queue
          console.log(
            `${
              getJobColorizedString(jobId)
            } 👺 🚨 source conflict for ${namespace}: DockerJobFinishedReason.JobReplacedByClient`,
          );

          // console.log(`👺 checkForSourceConflicts namespaces: `, namespaces);

          const finishedStateChange: StateChangeValueFinished = {
            type: DockerJobState.Finished,
            reason: DockerJobFinishedReason.JobReplacedByClient,
            namespace,
            time: Date.now(),
          };

          await this.stateChangeJobFinished(
            jobId,
            finishedStateChange,
          );
        }
      }
    }
  }
}

const isJobRemovableFromQueue = (job: InMemoryDockerJob): boolean => {
  const now = Date.now();
  return job.state === DockerJobState.Finished && now - job.time > MAX_TIME_FINISHED_JOB_IN_QUEUE;
};
