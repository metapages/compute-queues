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
  type BroadcastJobStates,
  type BroadcastWorkers,
  type DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  isJobCacheAllowedToBeDeleted,
  type JobsStateMap,
  type JobStates,
  type JobStatusPayload,
  type PayloadClearJobCache,
  type PayloadQueryJob,
  type PayloadResubmitJob,
  type StateChange,
  type StateChangeValueFinished,
  type StateChangeValueQueued,
  type StateChangeValueReQueued,
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
import { resolveMostCorrectJob } from "/@/shared/util.ts";
// import LRU from 'https://deno.land/x/lru_cache@6.0.0-deno.4/mod.ts';
import { ms } from "ms";
import { createNanoEvents, type Emitter } from "nanoevents";
import { delay } from "std/async/delay";

import type { BroadcastChannelRedis } from "@metapages/deno-redis-broadcastchannel";

let CustomBroadcastChannel: typeof BroadcastChannel = BroadcastChannel;

// If Redis is configured, then dynamically import:
if (Deno.env.get("REDIS_URL") === "redis://redis:6379") {
  console.log("👀 Using redis broadcast channel");
  const { BroadcastChannelRedis } = await import(
    "@metapages/deno-redis-broadcastchannel"
  );
  CustomBroadcastChannel = BroadcastChannelRedis;
}

// 60 seconds
const MAX_TIME_FINISHED_JOB_IN_QUEUE = ms("60 seconds") as number;
const INTERVAL_UNTIL_WORKERS_ASSUMED_LOST = ms("30 seconds") as number;
const INTERVAL_WORKERS_BROADCAST = ms("10 seconds") as number;
const INTERVAL_JOB_STATES_MINIMAL_BROADCAST = ms("5 seconds") as number;
const INTERVAL_JOBS_BROADCAST = ms("10 seconds") as number;
const INTERVAL_CHECK_FOR_DUPLICATE_JOBS_SAME_SOURCE = ms(
  "10 seconds",
) as number;
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
      history: number; // length
    }
  >;
};
type BroadcastChannelDeleteCachedJob = {
  jobId: string;
};

type BroadcastChannelMessageType =
  | "job-states"
  | "job-states-minimal"
  | "job-logs"
  | "workers"
  | "status-request"
  | "status-response"
  | "delete-cached-job";
type BroadcastChannelMessage = {
  type: BroadcastChannelMessageType;
  value:
    | string[] // [jobId1, state1, jobId2, state2, ...]
    | JobStates
    | BroadcastChannelWorkersRegistration
    | BroadcastChannelStatusRequest
    | BroadcastChannelStatusResponse
    | BroadcastChannelDeleteCachedJob
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
  protected readonly serverId: string;
  protected readonly dataDirectory: string;
  protected readonly channel: BroadcastChannel;
  protected readonly channelEmitter: Emitter<BroadcastMessageEvents>;
  protected db!: DB;

  // intervals
  protected _intervalWorkerBroadcast: number | undefined;
  protected _intervalJobsStatesMinimalBroadcast: number | undefined;
  protected _intervalJobsBroadcast: number | undefined;
  protected _intervalCheckForDuplicateJobsSameSource: number | undefined;
  protected _intervalRemoveOldFinishedJobsFromQueue: number | undefined;

  constructor(opts: {
    serverId: string;
    address: string;
    dataDirectory?: string;
  }) {
    const { serverId, address, dataDirectory } = opts;
    console.log(`➕ 🎾 UserDockerJobQueue ${address}`);

    this.address = address;
    this.serverId = serverId;
    this.dataDirectory = dataDirectory || "/tmp/worker-metaframe";
    this.workers = {
      otherWorkers: new Map(),
      myWorkers: [],
    };
    this.clients = [];
    this.state = { jobs: {} };

    this.channel = new CustomBroadcastChannel(address);

    this.channelEmitter = createNanoEvents<BroadcastMessageEvents>();

    // When a new message comes in from other instances, add it
    this.channel.onmessage = (event: MessageEvent) => {
      const payload: BroadcastChannelMessage = event.data;
      let jobStates: JobStates | undefined;
      let jobs: JobsStateMap | undefined;
      // console.log(`🌘 recieved broadcast message ${payload.type}`, payload)
      switch (payload.type) {
        case "job-states-minimal": {
          // If any of the jobs are different, update them
          // console.log(`[${this.address.substring(0, 6)}] 📡 recieved job-states-minimal`, payload.value)
          const jobStatesMinimal: string[] = payload.value as string[];
          if (!jobStatesMinimal) {
            break;
          }

          for (let i = 0; i < jobStatesMinimal.length; i += 2) {
            const jobId = jobStatesMinimal[i];
            const state = jobStatesMinimal[i + 1];
            if (
              !this.state.jobs[jobId] ||
              this.state.jobs[jobId].state !== state
            ) {
              console.log(
                `[${
                  this.address.substring(
                    0,
                    6,
                  )
                }] 📡 found job [${jobId.substring(0, 6)}] state mismatch`,
              );

              (async () => {
                const mostCurrentLocalJobResult = await this.db.queueJobGet(
                  this.address,
                  jobId,
                );

                const resolvedJob = mostCurrentLocalJobResult
                  ? resolveMostCorrectJob(
                    this.state.jobs[jobId],
                    mostCurrentLocalJobResult,
                  )
                  : this.state.jobs[jobId];
                if (resolvedJob && resolvedJob !== this.state.jobs[jobId]) {
                  this.state.jobs[jobId] = resolvedJob;
                  console.log(
                    `[${
                      this.address.substring(
                        0,
                        6,
                      )
                    }] 📡 recieved job-states-minimal job different, broadcasting...`,
                    jobId,
                  );
                  this.broadcastJobStatesToChannel([jobId]);
                  this.broadcastJobStatesToWebsockets([jobId]);
                }
              })();
            }
          }
          break;
        }
        case "job-states": {
          // console.log('🌘job-state from broadcast, got to resolve and merge...');
          // get the updated job
          jobStates = payload.value as JobStates;
          jobs = jobStates?.jobs;
          if (!jobs) {
            break;
          }

          const jobIds: string[] = [];
          for (
            const [jobId, job] of Object.entries<DockerJobDefinitionRow>(
              jobs,
            )
          ) {
            if (!this.state.jobs[jobId]) {
              console.log(
                `🌘 ...from merge adding jobId=${jobId.substring(0, 6)}`,
              );
              this.state.jobs[jobId] = job;
              jobIds.push(jobId);
            } else {
              const resolvedJob = resolveMostCorrectJob(
                this.state.jobs[jobId],
                job,
              );
              if (resolvedJob && resolvedJob !== this.state.jobs[jobId]) {
                // console.log(
                //   `🌘 ...from merge updating jobId=${jobId.substring(
                //     0,
                //     6
                //   )} new \n${JSON.stringify(
                //     resolvedJob,
                //     null,
                //     2
                //   )} replaced:\n${JSON.stringify(
                //     this.state.jobs[jobId],
                //     null,
                //     2
                //   )}}`
                // );
                this.state.jobs[jobId] = resolvedJob;
                jobIds.push(jobId);
              }
            }
          }
          if (jobIds.length > 0) {
            console.log(
              `🌘 ...from merge complete, now broadcasting ${jobIds.length}`,
            );
            this.broadcastJobStatesToWebsockets(jobIds);
          } else {
            console.log(`🌘 ...from merge complete, no changes!`);
          }
          break;
        }

        case "workers": {
          const workersRegistration = payload
            .value as BroadcastChannelWorkersRegistration;
          this.otherWorkersHaveChanged(workersRegistration.workers);
          // combine with ours. if there is a difference to our known
          break;
        }

        case "status-request": {
          (async () => {
            const localWorkersResponse = await this.getStatusFromLocalWorkers();
            const response: BroadcastChannelStatusResponse = {
              id: this.serverId,
              workers: localWorkersResponse,
              jobs: Object.fromEntries(
                Object.entries<DockerJobDefinitionRow>(this.state.jobs).map(
                  ([id, v]) => {
                    return [
                      id,
                      {
                        state: v.state,
                        history: v?.history.length || 0,
                      },
                    ];
                  },
                ),
              ),
            };
            this.channel.postMessage({
              type: "status-response",
              value: response,
            } as BroadcastChannelMessage);
          })();
          break;
        }

        case "delete-cached-job": {
          const jobId = (payload.value as BroadcastChannelDeleteCachedJob)
            .jobId;
          this.deleteCachedJob(jobId);
          // No need to delete from the db, the server that triggered this
          // broadcast has already done that, we just need to remove it from
          // our cache
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

    this._intervalWorkerBroadcast = setInterval(() => {
      this.broadcastWorkersToChannel();
      this.requeueJobsFromMissingWorkers();
    }, INTERVAL_WORKERS_BROADCAST);

    this._intervalJobsStatesMinimalBroadcast = setInterval(() => {
      this.broadcastMinimalJobsStatesToChannel();
    }, INTERVAL_JOB_STATES_MINIMAL_BROADCAST);

    this._intervalJobsBroadcast = setInterval(() => {
      this.broadcastJobStatesToWebsockets();
      this.broadcastJobStatesToChannel();
    }, INTERVAL_JOBS_BROADCAST);

    this._intervalCheckForDuplicateJobsSameSource = setInterval(() => {
      this.checkForSourceConflicts();
    }, INTERVAL_CHECK_FOR_DUPLICATE_JOBS_SAME_SOURCE);

    this._intervalRemoveOldFinishedJobsFromQueue = setInterval(() => {
      this.removeOldFinishedJobsFromQueue();
    }, INTERVAL_REMOVE_OLD_FINISHED_JOBS_FROM_QUEUE);
  }

  /**
   * This is called by rest path /:queue/status
   */
  async status(): Promise<object> {
    // First attach listener to broadcast channel
    const remoteServersResponse = await this.getStatusFromRemoteWorkers();
    const localWorkersResponse = await this.getStatusFromLocalWorkers();

    return {
      jobs: Object.fromEntries(
        Object.entries<DockerJobDefinitionRow>(this.state.jobs).map(
          ([id, v]) => {
            return [
              id,
              {
                state: v.state,
                historyLength: v.history?.length || 0,
              },
            ];
          },
        ),
      ),
      otherServers: remoteServersResponse,
      localWorkers: localWorkersResponse,
      clientCount: this.clients.length,
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
          result[status.id] = status;
          //   for (const [id, worker] of Object.entries(status.workers)) {
          //     result[id] = worker;
          //   }
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

    return result;
  }

  /**
   * Delete CACHED locally, from the kvdb and broadcast to other API servers to also delete
   * This is NOT deleting any old job, this is only deleting a job that has been cached
   * @param jobId
   */
  async broadcastAndDeleteCachedJob(jobId: string): Promise<boolean> {
    if (!this.state.jobs[jobId]) {
      console.log(
        `[${
          this.address.substring(
            0,
            6,
          )
        }]🗑️ NOT broadcastAndDeleteCachedJob no job [${jobId.substring(0, 6)}]`,
      );
      return false;
    }

    const currentState =
      this.state.jobs[jobId].history[this.state.jobs[jobId].history.length - 1];
    if (!isJobCacheAllowedToBeDeleted(currentState)) {
      console.log(
        `[${
          this.address.substring(
            0,
            6,
          )
        }]🗑️ NOT broadcastAndDeleteCachedJob because it is in state ${
          this.state.jobs[jobId].state
        } [${jobId.substring(0, 6)}]`,
      );
      return false;
    }

    // Can only send the message to the workers with the whole definition
    // because the definition used to construct unique cache keys
    const jobDefinition = (
      this.state.jobs[jobId].history[0].value as StateChangeValueQueued
    ).definition;
    if (jobDefinition) {
      this.broadcastToLocalWorkers(
        JSON.stringify({
          type: WebsocketMessageTypeServerBroadcast.ClearJobCache,
          payload: {
            jobId,
            definition: jobDefinition,
          } as PayloadClearJobCache,
        } as WebsocketMessageServerBroadcast),
      );
    } else {
      jobDefinition;
    }

    await this.deleteJobFromDb(jobId).catch((err) => {
      console.log(`💥💥💥 ERROR deleting job: ${err}`, jobId);
    });
    await this.deleteCachedJob(jobId);

    this.channel.postMessage({
      type: "delete-cached-job",
      value: { jobId } as BroadcastChannelDeleteCachedJob,
    } as BroadcastChannelMessage);
    return true;
  }

  /**
   * Delete CACHED locally, from the kvdb
   * This is NOT deleting any old job, this is only deleting a job that has been cached
   * @param jobId
   */
  deleteCachedJob(jobId: string) {
    delete this.state.jobs[jobId];
    console.log(
      `[${this.address.substring(0, 6)}] deletedCachedJob [${
        jobId.substring(
          0,
          6,
        )
      }]`,
    );
  }

  protected async deleteJobFromDb(jobId: string) {
    await this.db.queueJobRemove(this.address, jobId);
    await this.db.resultCacheRemove(jobId);
    console.log(
      `[${this.address.substring(0, 6)}] deleted from db: [${
        jobId.substring(
          0,
          6,
        )
      }]`,
    );
  }

  async broadcastAndSendLogsToLocalClients(logs: JobStatusPayload) {
    this.channel.postMessage({
      type: "job-logs",
      value: logs,
    } as BroadcastChannelMessage);

    await this.sendLogsToLocalClients(logs);
  }

  async sendLogsToLocalClients(logs: JobStatusPayload) {
    // console.log(`⛈️ sendLogsToLocalClients`);
    const messageString = JSON.stringify({
      type: WebsocketMessageTypeServerBroadcast.JobStatusPayload,
      payload: logs,
    });
    await this.broadcastToLocalClients(messageString);
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
              `🌘 got status from worker ${status.id.substring(0, 6)}`,
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

    return result;
  }

  async setup() {
    // Initialize the db with the data directory
    this.db = await DB.initialize(this.dataDirectory);

    // For local development, use a redis broadcast channel
    if (Deno.env.get("REDIS_URL") === "redis://redis:6379") {
      await (this.channel as BroadcastChannelRedis).ready();
    }

    // TODO get only for this queue
    const allPersistedJobInTheQueue = await this.db.queueGetAll(this.address);
    allPersistedJobInTheQueue.forEach((j) => (this.state.jobs[j.hash] = j));
    console.log(
      `On startup, got ${allPersistedJobInTheQueue.length} jobs from the db`,
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
    const message: BroadcastChannelMessage = {
      type: "job-states",
      value: jobStates,
    };
    this.channel.postMessage(message);

    // Also notify the workers and browser
    // NB! This is a single job update not all jobs
    // as sending all jobs is declaring what jobs are in the queue
  }

  dispose() {
    this.channel.onmessage = null;
    this.channel.close();
    // https://github.com/ai/nanoevents?tab=readme-ov-file#remove-all-listeners
    this.channelEmitter.events = {};
    clearInterval(this._intervalWorkerBroadcast);
    clearInterval(this._intervalJobsStatesMinimalBroadcast);
    clearInterval(this._intervalJobsBroadcast);
    clearInterval(this._intervalCheckForDuplicateJobsSameSource);
    delete userJobQueues[this.address];
    console.log(`➖ 🗑️ 🎾 UserDockerJobQueue ${this.address}`);
  }

  // Mark methods that could be overridden as protected
  protected async stateChange(change: StateChange): Promise<void> {
    // console.log('🌘stateChange', JSON.stringify(change, null, '  ').substring(0, 300));
    // console.log('this.state.jobs', JSON.stringify(this.state.jobs, null, '  '));

    if (!change?.job) {
      console.log(`stateChange but bad state ${JSON.stringify(change)}`);
      return;
    }

    const jobId = change.job;

    if (change && change.state) {
      console.log(
        `${jobId.substring(0, 6)} stateChange ${
          this.state.jobs[jobId] ? this.state!.jobs![jobId]!.state : ""
        } => ${change.state} (existing job: ${!!this.state.jobs[jobId]})`,
      );
    }

    if (!this.state.jobs[jobId]) {
      // did we miss a job? or is this a job that was never queued?
      const possibleMissedJob = await this.db.queueJobGet(this.address, jobId);
      if (possibleMissedJob) {
        this.state.jobs[jobId] = possibleMissedJob;
      } else {
        // is this job already finished, but in the longer-term cache?
        const cachedJob: DockerJobDefinitionRow | undefined = await this.db
          .resultCacheGet(jobId);
        if (cachedJob) {
          this.state.jobs[jobId] = cachedJob;
        }
      }
    }

    let jobRow: DockerJobDefinitionRow | undefined = this.state.jobs[jobId];

    // create a big inline function to handle the details and
    // checks when actually making the state update
    const updateState = async (replace = false) => {
      if (!jobRow) {
        console.log(`💥 updateState but missing jobRow, maybe cache is bad?`);
        return;
      }
      if (change.state === DockerJobState.Queued) {
        jobRow!.history = [change];
        this.checkForSourceConflicts();
      } else {
        if (replace) {
          jobRow!.history[jobRow!.history.length - 1] = change;
        } else {
          jobRow!.history.push(change);
        }
      }

      jobRow!.state = change.state;
      jobRow!.value = change.value;
      // broadcast first
      this.broadcastJobStatesToChannel([jobId]);
      this.broadcastJobStatesToWebsockets([jobId]);
      // these are slower since they involve s3
      try {
        // Finished jobs are cached in the db
        if (change.state === DockerJobState.Finished) {
          console.log("cacheadd");
          await this.db.resultCacheAdd(jobId, jobRow);
          // remove from the persisted cache so that metrics will be accurate
          console.log("cacheremove");
          await this.db.queueJobRemove(this.address, jobId);
        } else if (change.state === DockerJobState.Queued) {
          console.log("queueadd");
          await this.db.queueJobAdd(this.address, jobRow!);
        } else {
          console.log("queueupdate");
          await this.db.queueJobUpdate(this.address, jobRow!);
        }
      } catch (err) {
        console.log(`💥💥💥 ERROR saving or updating job: ${err}`, jobRow);
      }

      // when a job finishes, check the queue a bit later
      // and remove old jobs from the queue. the results
      // have already been persisted in the db
      if (change.state === DockerJobState.Finished) {
        setTimeout(() => {
          this.removeOldFinishedJobsFromQueue();
        }, MAX_TIME_FINISHED_JOB_IN_QUEUE);
      }
    };

    const broadcastCurrentStateBecauseIDoubtStateIsSynced = async () => {
      this.broadcastJobStatesToChannel([jobId]);
      await this.broadcastJobStatesToWebsockets([jobId]);
    };

    try {
      switch (change.state) {
        // incoming state
        case DockerJobState.Finished:
          // previous state
          switch (this?.state?.jobs?.[jobId]?.state) {
            case DockerJobState.Queued:
            case DockerJobState.ReQueued:
            case DockerJobState.Running:
              console.log(`${jobId.substring(0, 6)} Job finished`);
              await updateState();
              break;
            case DockerJobState.Finished:
              console.log(`${jobId.substring(0, 6)} already finished?`);
              await broadcastCurrentStateBecauseIDoubtStateIsSynced();
              break;
          }
          break;
        // TODO: I haven't fully tested DockerJobState.ReQueued
        // incoming state
        case DockerJobState.ReQueued:
          // previous state
          switch (this.state.jobs[jobId].state) {
            case DockerJobState.Queued:
              console.log(
                `${
                  jobId.substring(
                    0,
                    6,
                  )
                } Queued -> ReQueued (this means the worker went missing)`,
              );
              await updateState();
              break;
            case DockerJobState.ReQueued: {
              console.log(`${jobId.substring(0, 6)} ReQueued -> ReQueued`);
              const currentStateReQueued = this.state.jobs[jobId]
                .value as StateChangeValueQueued;
              const incomingStateReQueued = change
                .value as StateChangeValueQueued;
              if (incomingStateReQueued.time < currentStateReQueued.time) {
                console.log(
                  `${
                    jobId.substring(
                      0,
                      6,
                    )
                  } REPLACING! because incoming time is earlier ReQueued -> ReQueued`,
                );
                // update via replacement
                await updateState(true);
              }
              break;
            }
            case DockerJobState.Running: {
              console.log(
                `${
                  jobId.substring(
                    0,
                    6,
                  )
                } Running -> ReQueued? ❗❗ I hope this is because the worker went missing ❗`,
              );
              await updateState(true);
              break;
            }
            case DockerJobState.Finished: {
              console.log(
                `${
                  jobId.substring(
                    0,
                    6,
                  )
                } Finished -> ReQueued? What ❓❓❓. Rebroadcasting state`,
              );
              await broadcastCurrentStateBecauseIDoubtStateIsSynced();
              break;
            }
          }
          break;

        // incoming state
        case DockerJobState.Queued: {
          console.log(`${jobId.substring(0, 6)} Job wanting to be Queued`);
          const valueQueued = change.value as StateChangeValueQueued;

          if (this.state.jobs[jobId]) {
            // previous state
            switch (this.state.jobs[jobId].state) {
              case DockerJobState.ReQueued:
              case DockerJobState.Queued:
              case DockerJobState.Running:
                console.log(
                  `${jobId.substring(0, 6)} Queued -> ${
                    this.state.jobs[jobId].state
                  } ignoring queue request, job already queued or running`,
                );
                // If this is a new submission
                // TODO: what is happening here? It could be a lost job
                //

                (
                  this.state.jobs[jobId].history[0]
                    .value as StateChangeValueQueued
                ).definition = valueQueued.definition;

                await broadcastCurrentStateBecauseIDoubtStateIsSynced();
                break;
              case DockerJobState.Finished: {
                const previousFinishedState: StateChangeValueFinished = this
                  .state.jobs[jobId].value as StateChangeValueFinished;
                switch (previousFinishedState.reason) {
                  case DockerJobFinishedReason.Cancelled:
                    console.log(
                      `${jobId.substring(0, 6)} restarting from user`,
                    );
                    await updateState(true);
                    break;
                  case DockerJobFinishedReason.WorkerLost:
                    console.log(
                      `!!!! BAD LOGIC ${
                        jobId.substring(
                          0,
                          6,
                        )
                      } restarting from worker lost`,
                    );
                    await updateState();
                    break;
                  case DockerJobFinishedReason.Success:
                  case DockerJobFinishedReason.Error:
                  case DockerJobFinishedReason.TimedOut:
                    console.log(
                      `[${
                        jobId.substring(
                          0,
                          6,
                        )
                      }] ignoring Queued request current state=[${
                        this.state.jobs[jobId].state
                      }] reason=[${previousFinishedState.reason}], job finished and not restartable`,
                    );
                    await broadcastCurrentStateBecauseIDoubtStateIsSynced();
                    break;
                }
                break;
              }
            }
            break;
          } else {
            // TODO: check for finished jobs in the db
            console.log(
              `[${
                jobId.substring(
                  0,
                  6,
                )
              }] adding new job row to local state as Queued`,
            );

            jobRow = {
              hash: jobId,
              state: DockerJobState.Queued,
              value: valueQueued,
              history: [change],
            };
            this.state.jobs[jobId] = jobRow;
            await updateState();
          }

          break;
        }
        // incoming state
        case DockerJobState.Running:
          console.log(
            `${jobId.substring(0, 6)} Job Running, previous job ${
              this.state.jobs[jobId].state
            }`,
          );

          // previous state
          switch (this.state.jobs[jobId].state) {
            case DockerJobState.Finished:
              // it can NEVER go from Finished to Running
              console.log(
                `${
                  jobId.substring(0, 6)
                } ignoring request state change ${change.state} !=> ${DockerJobState.Finished}`,
              );
              break;
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
              const valueRunningCurrent = this.state.jobs[jobId]
                .value as StateChangeValueRunning;
              const valueRunningIncoming = change
                .value as StateChangeValueRunning;

              if (valueRunningCurrent.worker !== valueRunningIncoming.worker) {
                const preferredWorker = resolvePreferredWorker(
                  valueRunningCurrent.worker,
                  valueRunningIncoming.worker,
                );
                const preferCurrentWorker =
                  preferredWorker === valueRunningCurrent.worker;
                console.log(
                  `${
                    jobId.substring(
                      0,
                      6,
                    )
                  } Running -> Running, but different worker, assigning to ${
                    preferredWorker.substring(
                      0,
                      6,
                    )
                  }`,
                );
                if (preferCurrentWorker) {
                  await broadcastCurrentStateBecauseIDoubtStateIsSynced();
                } else {
                  // overwrite the current state
                  await updateState(true);
                }
              } else {
                console.log(
                  `${
                    jobId.substring(
                      0,
                      6,
                    )
                  } 🇨🇭🇨🇭🇨🇭 Running -> Running, same worker, so doing nothing: [${
                    valueRunningCurrent.worker.substring(
                      0,
                      6,
                    )
                  }]`,
                );
                await broadcastCurrentStateBecauseIDoubtStateIsSynced();
              }
              break;
            }
            case DockerJobState.Queued:
            case DockerJobState.ReQueued:
              // queued to running is great
              await updateState();
              break;
          }
          break;
      }
    } catch (err) {
      console.log(`💥💥💥 ERROR ${err}`, (err as Error).stack);
    }

    // console.log(`stateChange(${change.state}) end `)
  }

  protected async removeOldFinishedJobsFromQueue() {
    // check for finished jobs around longer than a minute
    const now = Date.now();
    let sendBroadcast = false;
    for (
      const [jobId, job] of Object.entries<DockerJobDefinitionRow>(
        this.state.jobs,
      )
    ) {
      if (job?.state === DockerJobState.Finished) {
        const stateChange = this.state.jobs[jobId]
          ?.value as StateChangeValueFinished;
        if (
          stateChange &&
          now - stateChange.time > MAX_TIME_FINISHED_JOB_IN_QUEUE
        ) {
          console.log(
            `[${
              this.address.substring(
                0,
                15,
              )
            }] 🪓 removing finished job from queue id=${jobId.substring(0, 6)}`,
          );
          delete this.state.jobs[jobId];
          sendBroadcast = true;
          await this.db.queueJobRemove(this.address, jobId);
        }
      }
    }

    if (sendBroadcast) {
      await this.broadcastJobStatesToWebsockets();
    }
  }

  async connectWorker(connection: { socket: WebSocket }, queue: string) {
    console.log(
      `[${
        this.address.substring(
          0,
          15,
        )
      }] ➕ w 🔌 Connected a worker to queue [${queue.substring(0, 6)}]`,
    );

    let workerRegistration: WorkerRegistration;
    const emitter = createNanoEvents<NanoEventWorkerMessageEvents>();

    connection.socket.addEventListener("close", () => {
      console.log(
        `[${this.address.substring(0, 15)}] [${
          queue.substring(
            0,
            6,
          )
        }] ➖ w 🔌 ⏹️ Removing ${
          workerRegistration
            ? workerRegistration.id.substring(0, 6)
            : "unknown worker"
        }`,
      );
      // https://github.com/ai/nanoevents?tab=readme-ov-file#remove-all-listeners
      emitter.events = {};
      const index = this.workers.myWorkers.findIndex(
        (w) => w.connection === connection.socket,
      );
      if (index > -1) {
        if (workerRegistration !== this.workers.myWorkers[index].registration) {
          throw new Error("worker registration mismatch");
        }
        // console.log(`🌪 Removing ${this.workers.myWorkers[index].registration.id}`);
        this.workers.myWorkers.splice(index, 1);
        this.myWorkersHaveChanged();
      }
    });

    connection.socket.addEventListener("message", (event) => {
      try {
        const { data: message } = event;
        // console.log('message', message);
        const messageString = message.toString().trim();
        if (messageString === "PING") {
          // console.log(`PING FROM ${worker?.id}`)
          connection.socket.send("PONG");
          // To help with missing workers, send the current state of the unclaimed jobs
          // to the worker when it pings
          this.sendJobStatesToWebsocket(
            connection.socket,
            Object.keys(this.state.jobs).filter(
              (jobId) =>
                this.state.jobs[jobId].state !== DockerJobState.Finished,
            ),
          );

          return;
        }

        if (!messageString.startsWith("{")) {
          console.log(
            "worker message message not JSON",
            messageString.substr(0, 100),
          );
          return;
        }
        const possibleMessage: WebsocketMessageWorkerToServer = JSON.parse(
          messageString,
        );

        // Send to other internal listeners
        try {
          emitter.emit("message", possibleMessage);
        } catch (err) {
          console.log("emitter error", err);
        }

        // console.log('possibleMessage', possibleMessage);
        switch (possibleMessage.type) {
          case WebsocketMessageTypeWorkerToServer.StateChange: {
            const change: StateChange = possibleMessage.payload as StateChange;
            if (!change) {
              console.log({
                error: "Missing payload in message from worker",
                message: messageString.substring(0, 100),
              });
              break;
            }
            this.stateChange(change);
            break;
          }
          // from the workers
          case WebsocketMessageTypeWorkerToServer.WorkerRegistration: {
            const newWorkerRegistration = possibleMessage
              .payload as WorkerRegistration;

            if (!newWorkerRegistration) {
              console.log({
                error: "Missing payload in message from worker",
                message: messageString.substring(0, 100),
              });
              break;
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
                `[${
                  this.address.substring(
                    0,
                    15,
                  )
                }] 🔌 🔗 Worker registered (so broadcasting) ${
                  newWorkerRegistration.id.substring(
                    0,
                    6,
                  )
                }`,
              );
            } else {
              console.log(
                `[${
                  this.address.substring(
                    0,
                    15,
                  )
                }] ✨ 🔗 Worker RE-registering (so broadcasting) ${
                  newWorkerRegistration.id.substring(
                    0,
                    6,
                  )
                }`,
              );
              this.workers.myWorkers[indexOfCurrent].registration =
                newWorkerRegistration;
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
          default:
            //ignored
        }
      } catch (err) {
        console.log(err);
      }
    });

    await this.sendJobStatesToWebsocket(connection.socket);
  }

  async connectClient(connection: { socket: WebSocket }) {
    console.log(
      `[${this.address.substring(0, 15)}] ➕ c ⏯️ Connected a client`,
    );
    this.clients.push(connection.socket);
    connection.socket.addEventListener("close", () => {
      const index = this.clients.indexOf(connection.socket);
      if (index > -1) {
        console.log(
          `[${
            this.address.substring(
              0,
              15,
            )
          }] ➖ c ⏹️ close event: Removing client`,
        );
        this.clients.splice(index, 1);
      }
    });

    connection.socket.addEventListener("message", (event) => {
      try {
        const { data: message } = event;
        // console.log('⏯️ browser message', message);
        const messageString = message.toString();
        if (messageString === "PING") {
          console.log(`PING FROM browser`);
          connection.socket.send("PONG");
          return;
        }
        if (!messageString.startsWith("{")) {
          console.log(
            `[${this.address.substring(0, 15)}] browser message not JSON`,
            messageString.substr(0, 100),
          );
          return;
        }
        const possibleMessage: WebsocketMessageClientToServer = JSON.parse(
          messageString,
        );
        switch (possibleMessage.type) {
          case WebsocketMessageTypeClientToServer.StateChange: {
            const change: StateChange = possibleMessage.payload as StateChange;
            if (!change) {
              console.log({
                error: "Missing payload in message from browser",
                message: messageString.substr(0, 100),
              });
              break;
            }
            this.stateChange(change);
            break;
          }
          case WebsocketMessageTypeClientToServer.ClearJobCache: {
            (async () => {
              // Send a message to our local workers to clear their respective caches
              const jobId = (possibleMessage.payload as PayloadClearJobCache)
                .jobId;
              const isCleared = await this.broadcastAndDeleteCachedJob(jobId);
              if (isCleared) {
                // wait a bit for the other workers to clear their caches
                setTimeout(() => {
                  connection.socket.send(
                    JSON.stringify({
                      type: WebsocketMessageTypeServerBroadcast
                        .ClearJobCacheConfirm,
                      payload: possibleMessage.payload,
                    } as WebsocketMessageServerBroadcast),
                  );
                }, 100);
              }
            })();
            break;
          }
          case WebsocketMessageTypeClientToServer.ResubmitJob: {
            (async () => {
              // Send a message to our local workers to clear their respective caches
              const jobId = (possibleMessage.payload as PayloadResubmitJob)
                .jobId;
              const updatedDefinition = (
                possibleMessage.payload as PayloadResubmitJob
              ).definition;
              const job = this.state.jobs[jobId];
              const isCleared = await this.broadcastAndDeleteCachedJob(jobId);
              if (isCleared) {
                connection.socket.send(
                  JSON.stringify({
                    type:
                      WebsocketMessageTypeServerBroadcast.ClearJobCacheConfirm,
                    payload: possibleMessage.payload,
                  } as WebsocketMessageServerBroadcast),
                );
              }
              if (!job) {
                return;
              }
              // now submit the job
              const resubmitStateChange: StateChange = {
                tag: this.serverId,
                state: DockerJobState.Queued,
                job: jobId,
                value: {
                  ...job.history[0].value,
                  definition: updatedDefinition,
                  time: Date.now(),
                } as StateChangeValueQueued,
              };
              this.stateChange(resubmitStateChange);
            })();
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
    const jobStates: BroadcastJobStates = { state: { jobs: {} } };
    jobStates.isSubset = !isAll;
    const message: WebsocketMessageServerBroadcast = {
      // If you supply jobIds it's not the full set
      type: isAll
        ? WebsocketMessageTypeServerBroadcast.JobStates
        : WebsocketMessageTypeServerBroadcast.JobStateUpdates,
      payload: jobStates,
    };
    for (const jobId of jobIds) {
      if (this?.state.jobs[jobId]) {
        jobStates.state.jobs[jobId] = this.state.jobs[jobId];
      } else {
        const job = await this.db.resultCacheGet(jobId);
        if (job) {
          jobStates.state.jobs[jobId] = job;
        }
      }
    }

    if (Object.keys(jobStates.state.jobs).length === 0) {
      return "";
    }

    const messageString = JSON.stringify(message);
    return messageString;
  }

  protected broadcastToLocalWorkers(messageString: string) {
    if (!messageString) {
      return;
    }
    this.workers.myWorkers.forEach((worker) => {
      try {
        worker.connection.send(messageString);
      } catch (err) {
        console.log(
          `Failed to send broadcast to worker ${err}\nmessage=${messageString}`,
        );
      }
    });
  }

  protected broadcastToLocalClients(messageString: string) {
    if (!messageString) {
      return;
    }
    this.clients.forEach((connection) => {
      try {
        connection.send(messageString);
      } catch (err) {
        console.log(
          `Failed to send broadcast to client ${err}\nmessage=${messageString}`,
        );
      }
    });
  }

  async broadcastJobStatesToWebsockets(jobIds?: string[], isAll = false) {
    const messageString = jobIds
      ? await this.createWebsocketBroadcastMessageJobStatesInternal(
        jobIds,
        isAll,
      )
      : await this.createWebsocketBroadcastMessageJobStates();
    if (!messageString) {
      return;
    }
    this.broadcastToLocalWorkers(messageString);
    this.broadcastToLocalClients(messageString);
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
      }
    } catch (err) {
      console.log(`Failed sendJobStatesToWebsocket to connection ${err}`);
    }
  }

  sendWorkersListToWebsocket(connection: WebSocket) {
    const messageString = this
      .createWebsocketBroadcastWorkersRegistrationMessage();
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
    const messageString = this
      .createWebsocketBroadcastWorkersRegistrationMessage();
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
          `[${
            this.address.substring(
              0,
              15,
            )
          }] 🪓 removing worker ${
            workerId.substring(
              0,
              6,
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

  /** Just the job and the state enum */
  broadcastMinimalJobsStatesToChannel() {
    const message: BroadcastChannelMessage = {
      type: "job-states-minimal",
      value: Object.keys(this.state.jobs)
        .filter(
          (jobId) => this.state.jobs[jobId].state !== DockerJobState.Finished,
        )
        .map((jobId) => [jobId, this.state.jobs[jobId].state])
        .flat(),
    };
    // use the BroadcastChannel to notify other servers
    // console.log(`[${this.address.substring(0, 6)}] 📡 broadcastMinimalJobsStatesToChannel`, message.value)
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
    for (
      const [jobId, job] of Object.entries<DockerJobDefinitionRow>(
        this.state.jobs,
      )
    ) {
      if (job.state === DockerJobState.Running) {
        const valueRunning = job.value as StateChangeValueRunning;
        if (!workerIds.has(valueRunning.worker)) {
          console.log(
            `[${
              this.address.substring(
                0,
                15,
              )
            }] 🪓 requeueing job ${
              jobId.substring(
                0,
                6,
              )
            } because worker ${valueRunning.worker.substring(0, 6)} is missing`,
          );

          const reQueueStateChange: StateChange = {
            tag: this.serverId,
            state: DockerJobState.ReQueued,
            job: jobId,
            value: {
              time: now,
            } as StateChangeValueReQueued,
          };
          this.stateChange(reQueueStateChange);
        }
      }
    }
  }

  async otherWorkersHaveChanged(workers: ServerWorkersObject) {
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
      await this.broadcastWorkersToClientsAndWorkers();
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

  checkForSourceConflicts() {
    // check all the jobs
    const sourceJobs = new Map<string, string[]>(); // source -> [jobId, ...]
    for (
      const [jobId, job] of Object.entries<DockerJobDefinitionRow>(
        this.state.jobs,
      )
    ) {
      if (job.state === DockerJobState.Finished) {
        continue;
      }
      const namespace = (job.history[0].value as StateChangeValueQueued)
        .namespace;
      if (namespace) {
        sourceJobs.set(namespace, [
          ...(sourceJobs.get(namespace) || []),
          jobId,
        ]);
      }
    }
    const now = Date.now();
    for (const [source, jobIds] of sourceJobs.entries()) {
      if (jobIds.length > 1) {
        console.log(`🚨 source conflict for ${source}: ${jobIds}`);
        // what do I do? keep the newest job, and kill the others.
        // we should hesitate to kill long running jobs, but we also
        // don't want to end up with a lot of them, so we have to strike
        // a balance.
        // If a) the older jobs are less than a minute old, or b) the difference
        // between the newest job running time and the others is over a minute,
        // then we kill the older jobs.
        // Otherwise, we keep the newest job.
        // latest last
        const sortedJobIds = jobIds.toSorted((a, b) => {
          const aJobTime = (
            this.state.jobs[a]?.history[0].value as StateChangeValueQueued
          ).time;
          const bJobTime = (
            this.state.jobs[b]?.history[0].value as StateChangeValueQueued
          ).time;
          return aJobTime - bJobTime;
        });
        const newestJobId = sortedJobIds.pop()!;
        const newestJobTime = (
          this.state.jobs[newestJobId]?.history[0]
            .value as StateChangeValueQueued
        ).time;
        for (const jobId of sortedJobIds) {
          const job = this.state.jobs[jobId];
          const jobTime = (job.history[0].value as StateChangeValueQueued).time;
          const timeDifference = newestJobTime - jobTime;
          const jobAge = now - jobTime;
          if (jobAge < 60000 || timeDifference > 60000) {
            // kill it
            this.stateChange({
              state: DockerJobState.Finished,
              job: jobId,
              value: {
                reason: DockerJobFinishedReason.JobReplacedByClient,
                time: Date.now(),
              },
            } as StateChange);
          }
        }
      }
    }
  }
}
