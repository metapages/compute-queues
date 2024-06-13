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
 *
 */

// import LRU from 'https://deno.land/x/lru_cache@6.0.0-deno.4/mod.ts';
import { ms } from 'https://raw.githubusercontent.com/denolib/ms/master/ms.ts';

import { BroadcastChannelRedis } from '@metapages/deno-redis-broadcastchannel';

import { db } from '../db/kv/mod.ts';
import {
  BroadcastJobStates,
  BroadcastWorkers,
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  JobsStateMap,
  JobStates,
  StateChange,
  StateChangeValueQueued,
  StateChangeValueRunning,
  StateChangeValueWorkerFinished,
  WebsocketMessageClientToServer,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeClientToServer,
  WebsocketMessageTypeServerBroadcast,
  WebsocketMessageTypeWorkerToServer,
  WebsocketMessageWorkerToServer,
  WorkerRegistration,
} from '../shared/mod.ts';

// 60 seconds
const MAX_TIME_FINISHED_JOB_IN_QUEUE = ms('60 seconds') as number;

type ServerWorkersObject = {[key:string]:WorkerRegistration[]};

type BroadcastChannelWorkersRegistration = {
    // this is sorted
    workers: ServerWorkersObject;
    // workers :WorkerRegistration[];
}

type BroadcastChannelMessageType = "job-states" | "workers"; // | "job-state"
type BroadcastChannelMessage<T> = {
    type: BroadcastChannelMessageType;
    value: JobStates | BroadcastChannelWorkersRegistration;
};

/**
 * servers broadcast this to other servers
 */
// export interface BroadcastWorkersRegistration {
//     workers: Map<string, WorkerRegistration[]>;
    
//     // workers: WorkerRegistrationWithServerId[];
// }



/**
 * servers collate workers from all servers
 * (and send this collapsed to clients)
 */
export interface CollectedWorkersRegistration {
    otherWorkers: Map<string, WorkerRegistration[]>;
    myWorkers: {connection: WebSocket, registration: WorkerRegistration}[];
}

// const jobDefinitionCache = new LRU<string, DockerJobDefinitionInputRefs>({
//     max: 500,
//     // length: (value:DockerJobDefinitionInputRefs, key:string) => n * 2 + key!.length,
//     maxAge: ms('1 hour')
//   });

/**
 * Each user has their own personal docker job queue
 * The UserDockerJobQueue handled browser and worker websocket connections
 * and communications and tracking state.
 */
export class UserDockerJobQueue //extends (EventEmitter as { new(): UserDockerJobQueueEmitter }) 
{
    state: JobStates;
    readonly workers : CollectedWorkersRegistration;
    readonly clients: WebSocket[];
    readonly address:string;
    readonly serverId:string;
    // A BroadcastChannel used by all isolates
    // https://docs.deno.com/deploy/api/runtime-broadcast-channel#example-update-an-in-memory-cache-across-instances
    readonly channel :BroadcastChannel;

    constructor(opts: {serverId:string, address:string}) {
        // super();
        const {serverId, address} = opts;
        console.log(`➕ 🎾 UserDockerJobQueue ${address}`)
        
        this.address = address;
        this.serverId = serverId;
        this.workers = {
            otherWorkers: new Map(),
            myWorkers: [],
        };
        this.clients = [];
        this.state = { jobs: {} };
        // this.cacheJobDefinitionsSentToWorkers = new Map();

        // For local development, use a redis broadcast channel
        if (Deno.env.get('REDIS_URL') === 'redis://redis:6379') {
            console.log('👀 Using redis broadcast channel');
            this.channel = new BroadcastChannelRedis(address);
            (this.channel as BroadcastChannelRedis).ready();
        } else {
            this.channel = new BroadcastChannel(address);
        }

        // TODO get only for this queue
        const updateAll = async () => {
            const allPersistedJobInTheQueue = await db.queueGetAll(address);
            allPersistedJobInTheQueue.forEach(j => this.state.jobs[j.hash] = j);
            // Why broadcase here? New UserDockerJobQueue instances will get their
            // own state from the db
            // this.broadcastJobStateToChannel();
            this.broadcastJobStatesToWebsockets();
        }
        (async () => {
            await updateAll();
        })();

        // When a new message comes in from other instances, add it
        this.channel.onmessage = (event: MessageEvent) => {
            const payload :BroadcastChannelMessage<any> = event.data;
            let jobStates:JobStates | undefined;
            let jobs :JobsStateMap | undefined;
            // console.log(`🌘 recieved broadcast message ${payload.type}`, payload)
            switch (payload.type) {
                case "job-states":
                    
                    // console.log('🌘job-state from broadcast, got to resolve and merge...');
                    // get the updated job
                    jobStates = payload.value as JobStates;
                    jobs = jobStates?.jobs;
                    if (!jobs) {
                        return;
                    }
                    
                    const jobIds :string[] = [];
                    for (const [jobId, job] of Object.entries(jobs)) {
                        if (!this.state.jobs[jobId] || this.state.jobs[jobId].history.length < job.history.length) {
                            console.log(`🌘 ...from merge updating jobId=${jobId}`);
                            this.state.jobs[jobId] = job;
                            jobIds.push(jobId);
                        }
                    }
                    if (jobIds.length > 0) {
                        console.log(`🌘 ...from merge complete, now broadcasting ${jobIds.length}`);
                        this.broadcastJobStatesToWebsockets(jobIds);
                    } else {
                        console.log(`🌘 ...from merge complete, no changes!`);
                    }
                    break;
                case "workers":
                    const workersRegistration = payload.value as BroadcastChannelWorkersRegistration;
                    this.otherWorkersHaveChanged(workersRegistration.workers);
                    // combine with ours. if there is a difference to our known
                    break;
                default:
                    break;
            }
        };
    }

    broadcastJobStateToChannel(jobId:string) {

        const stateWithOneJob :JobStates = {
            jobs: {
                [jobId]: this.state.jobs[jobId],
            }
        }
        const message :BroadcastChannelMessage<JobStates> = {
            type: "job-states",
            value: stateWithOneJob,
        }
        this.channel.postMessage(message);

        // Also notify the workers and browser
        // NB! This is a single job update not all jobs
        // as sending all jobs is declaring what jobs are in the queue
    }

    dispose() {
        this.channel.onmessage = null;
        this.channel.close();
    }

    async stateChange(change: StateChange) {

        // console.log('🌘stateChange', JSON.stringify(change, null, '  ').substring(0, 300));
        // console.log('this.state.jobs', JSON.stringify(this.state.jobs, null, '  '));

        let sendBroadcast = false;
        const jobId = change.job;
        // const definition = this.state

        if (change && change.state) {
            console.log(`${jobId} stateChange(${change.state}) current=${this.state.jobs[jobId] ? this.state!.jobs![jobId]!.state : ''}`)
        }

        if (change.state !== DockerJobState.Queued && !this.state.jobs[jobId]) {
            console.log(`jobId=${jobId} ignoring because not queued but there's no existing job`);
            return;
        }


        let jobRow: DockerJobDefinitionRow | undefined = this.state.jobs[jobId];

        const updateState = async () => {
            jobRow!.history.push(change);
            jobRow!.state = change.state;
            jobRow!.value = change.value;
            sendBroadcast = true;
            if (change.state === DockerJobState.Queued) {
                await db.queueJobAdd(this.address, jobRow!);
            } else {
                await db.queueJobUpdate(this.address, jobRow!);
            }
            this.broadcastJobStateToChannel(jobId);
            this.broadcastJobStatesToWebsockets([jobId]);

            // when a job finishes, check the queue a bit later
            // and remove old jobs from the queue. the results
            // have already been persisted in the db
            if (change.state === DockerJobState.Finished) {
                setTimeout(() => {
                    this.removeOldFinishedJobsFromQueue();
                }, MAX_TIME_FINISHED_JOB_IN_QUEUE);
            }
        }

        // console.log(`🌗jobId=${jobId} jobRow=${JSON.stringify(jobRow, null, "  ")}`)
        try {
            switch (change.state) {
                // incoming state
                case DockerJobState.Finished:
                    // previous state
                    switch (this.state.jobs[jobId].state) {
                        case DockerJobState.Queued:
                        case DockerJobState.ReQueued:
                        case DockerJobState.Running:
                            console.log(`${jobId} Job finished`)
                            await updateState();
                            break;
                        case DockerJobState.Finished:
                            console.log(`${jobId} already finished?`)
                            break;
                    }
                    break;
                // incoming state
                case DockerJobState.Queued:
                    console.log(`${jobId} Job Queued`)
                    const changeStateQueued = (change.value as StateChangeValueQueued);
                    const nocache = !!changeStateQueued.nocache;

                    if (this.state.jobs[jobId]) {
                        // previous state
                        switch (this.state.jobs[jobId].state) {
                            case DockerJobState.Queued: // cached don't matter here
                            case DockerJobState.Running: // cached don't matter here
                                console.log('ignoring queue request, job already queued or running');
                                break;
                            case DockerJobState.Finished:
                                const valueFinishedPrev :StateChangeValueWorkerFinished = this.state.jobs[jobId].value as StateChangeValueWorkerFinished;
                                switch(valueFinishedPrev.reason) {
                                    case DockerJobFinishedReason.Cancelled:
                                        console.log(`${jobId} restarting from user`)
                                        await updateState();
                                    case DockerJobFinishedReason.Success:
                                    case DockerJobFinishedReason.Error:
                                    case DockerJobFinishedReason.TimedOut:
                                    case DockerJobFinishedReason.WorkerLost:
                                        if (changeStateQueued.nocache) {
                                            console.log('adding to queue because nocache=1');
                                            // cache busting so wipe out the previous history
                                            await updateState();
                                        } else {
                                            console.log('ignoring queue request, job pending restart or finished and not restartable');
                                        }
                                }
                                break;
                        }
                        break;
                    } else {
                        const valueQueued = change.value as StateChangeValueQueued;
                        jobRow = {
                            hash: jobId,
                            state: DockerJobState.Queued,
                            value: valueQueued,
                            history: [],
                        };
                        this.state.jobs[jobId] = jobRow;
                        await updateState();
                    }

                    break;
                // incoming state
                case DockerJobState.Running:
                    console.log(`${jobId} Job Running, previous job ${this.state.jobs[jobId].state}`)

                    // previous state
                    switch (this.state.jobs[jobId].state) {
                        case DockerJobState.Finished:
                            // it can NEVER go from Finished to Running
                            console.log(`${jobId} ignoring request state change ${change.state} !=> ${DockerJobState.Finished}`)
                            break;
                        // yeah running can be set again, e.g. updated the value to include sub-states
                        case DockerJobState.Running:
                            // TODO: check the worker
                            // update the value if changed, that's a sub-state
                            const valueRunningCurrent = this.state.jobs[jobId].value as StateChangeValueRunning;
                            const valueRunningIncoming = change.value as StateChangeValueRunning;
                            if (jobRow.value !== change.value && valueRunningCurrent.worker === valueRunningIncoming.worker) {
                                await updateState();
                            }
                            break;
                        case DockerJobState.Queued:
                            // queued to running is great
                            // ok some other worker, or the same one, is saying it's running again
                            await updateState();
                            break;
                    }
                    break;
            }
        } catch (err) {
            console.log(`💥💥💥 ERROR ${err}`);
        }

        // console.log(`stateChange(${change.state}) end `)
    }

    async removeOldFinishedJobsFromQueue() {
        // check for finished jobs around longer than a minute
        const now = Date.now();
        let sendBroadcast = false;
        for (const [jobId, job] of Object.entries(this.state.jobs))  {

            if (this.state.jobs?.[jobId]?.state === DockerJobState.Finished) {
                
                const stateChange = this.state.jobs[jobId].value as StateChangeValueWorkerFinished;
                // console.log('typeof(stateChange.time)', typeof(stateChange.time));
                if (typeof(stateChange.time) !== 'object') {
                    stateChange.time = new Date(stateChange.time);
                }
                if ((now - stateChange.time.getTime()) > MAX_TIME_FINISHED_JOB_IN_QUEUE) {
                    console.log(`[${this.address.substring(0, 15)}] 🪓 removing finished job from queue id=${jobId}`);
                    delete this.state.jobs[jobId];
                    sendBroadcast = true;
                    await db.queueJobRemove(this.address, jobId);
                }
            }
        }
        
        if (sendBroadcast) {
            await this.broadcastJobStatesToWebsockets();
        }
    }

    async connectWorker(connection: { socket: WebSocket }) {
        console.log(`[${this.address.substring(0, 15)}] ➕ w 🔌 Connected a worker`);

        let worker: WorkerRegistration;

        connection.socket.addEventListener('close', () => {
            console.log(`[${this.address.substring(0, 15)}] ➖ w 🔌 ⏹️ Removing ${worker ? worker.id.substring(0, 8) : "unknown worker"}`);
            var index = this.workers.myWorkers.findIndex(w => w.connection === connection.socket);
            if (index > -1) {
                if (worker !== this.workers.myWorkers[index].registration) {
                    throw new Error('worker registration mismatch');
                }
                // console.log(`🌪 Removing ${this.workers.myWorkers[index].registration.id}`);
                this.workers.myWorkers.splice(index, 1);
                this.myWorkersHaveChanged();
            }
        });

        connection.socket.addEventListener('message', event => {
            try {
                const {data:message} = event;
                // console.log('message', message);
                const messageString = message.toString().trim();
                if (messageString === 'PING') {
                    // console.log(`PING FROM ${worker?.id}`)
                    connection.socket.send('PONG');
                    return;
                }

                if (!messageString.startsWith('{')) {
                    console.log('worker message message not JSON', messageString.substr(0, 100))
                    return;
                }
                const possibleMessage: WebsocketMessageWorkerToServer = JSON.parse(messageString);
                // console.log('possibleMessage', possibleMessage);
                switch (possibleMessage.type) {
                    
                    case WebsocketMessageTypeWorkerToServer.StateChange:
                        const change: StateChange = possibleMessage.payload as StateChange;
                        if (!change) {
                            console.log({ error: 'Missing payload in message from worker', message: messageString.substring(0, 100) });
                            break;
                        }
                        this.stateChange(change);
                        break;
                    // from the workers
                    case WebsocketMessageTypeWorkerToServer.WorkerRegistration:
                        const registrationFromWorker = possibleMessage.payload as WorkerRegistration;
                        worker = registrationFromWorker;
                        if (!worker) {
                            console.log({ error: 'Missing payload in message from worker', message: messageString.substring(0, 100) });
                            break;
                        }
                        console.log(`[${this.address.substring(0, 15)}] 🔌 🔗 Worker registered (so broadcasting) ${worker.id.substring(0, 8)}`);
                        // worker = registrationFromWorker;//{...registrationFromWorker, serverId: this.address};
                        this.workers.myWorkers.push({ registration: worker, connection: connection.socket });
                        this.myWorkersHaveChanged();
                        break;
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
        console.log(`[${this.address.substring(0, 15)}] ➕ c ⏯️ Connected a client`);
        this.clients.push(connection.socket);
        connection.socket.addEventListener('close', () => {
            var index = this.clients.indexOf(connection.socket);
            if (index > -1) {
                console.log(`[${this.address.substring(0, 15)}] ➖ c ⏹️ Removing client`);
                this.clients.splice(index, 1);
            }
        });

        connection.socket.addEventListener('message', event => {
            try {
                const {data:message} = event;
                // console.log('⏯️ browser message', message);
                const messageString = message.toString();
                if (messageString === 'PING') {
                    console.log(`PING FROM browser`)
                    connection.socket.send('PONG');
                    return;
                }
                if (!messageString.startsWith('{')) {
                    console.log(`[${this.address.substring(0, 15)}] browser message not JSON`, messageString.substr(0, 100))
                    return;
                }
                const possibleMessage: WebsocketMessageClientToServer = JSON.parse(messageString);
                switch (possibleMessage.type) {
                    case WebsocketMessageTypeClientToServer.StateChange:
                        const change: StateChange = possibleMessage.payload as StateChange;
                        if (!change) {
                            console.log({ error: 'Missing payload in message from browser', message: messageString.substr(0, 100) });
                            break;
                        }
                        this.stateChange(change);
                        break;
                    default:
                    //ignored
                }
            } catch (err) {
                console.log(err);
            }
        });

        await this.sendWorkersListToWebsocket(connection.socket);
        await this.sendJobStatesToWebsocket(connection.socket);
    }

    createWebsocketBroadcastMessageJobStates(jobIds?:string[]): string {
        
        const jobStates: BroadcastJobStates = {state:{jobs: {}}};
        jobStates.isSubset = !!jobIds;
        const message :WebsocketMessageServerBroadcast = {
            // If you supply jobIds it's not the full set
            type: jobIds ? WebsocketMessageTypeServerBroadcast.JobStateUpdates : WebsocketMessageTypeServerBroadcast.JobStates,
            payload: jobStates,
        };

        if (jobIds) {
            jobIds.forEach(jobId => {
                if (this.state.jobs[jobId]) {
                    jobStates.state.jobs[jobId] = this.state.jobs[jobId];
                }
            });
        } else {
            jobStates.state.jobs = this.state.jobs;
        }

        const messageString = JSON.stringify(message);
        return messageString;
    }

    async broadcastJobStatesToWebsockets(jobIds?:string[]) {
        const messageString = this.createWebsocketBroadcastMessageJobStates(jobIds);
        if (!messageString) {
            return;
        }
        this.workers.myWorkers.forEach(worker => {
            try {
                worker.connection.send(messageString);
            } catch (err) {
                console.log(`Failed to send broadcast to worker ${err}`);
            }
        });
        this.clients.forEach(connection => {
            try {
                connection.send(messageString);
            } catch (err) {
                console.log(`Failed to send broadcast to worker ${err}`);
            }
        });
    }

    async sendJobStatesToWebsocket(connection: WebSocket, jobIds?:string[]) {
        const messageString = this.createWebsocketBroadcastMessageJobStates(jobIds);
        if (!messageString) {
            return;
        }
        try {
            connection.send(messageString);
        } catch (err) {
            console.log(`Failed sendJobStatesToWebsocket to connection ${err}`);
        }
    }

    async sendWorkersListToWebsocket(connection: WebSocket) {
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
    async broadcastWorkersToClientsAndWorkers() {
        
        // create a message for broadcasting to other servers
        // this only contains our workers   
        const messageString = this.createWebsocketBroadcastWorkersRegistrationMessage();
        // console.log(`❔ broadcastWorkersToClientsAndWorkers`, messageString)
        this.clients.forEach(connection => {
            try {
                connection.send(messageString);
            } catch (err) {
                console.log(`Failed to send broadcast to browser ${err}`);
            }
        });
        // We don't actually NEED to update the workers yet, but in the future
        // they can use this information to make better decisions
        this.workers.myWorkers.forEach(worker => {
            try {
                worker.connection.send(messageString);
            } catch (err) {
                console.log(`Failed to send broadcast to worker ${err}`);
            }
        });
    }

    /**
     * Tell everyone else that our workers have changed
     */
    myWorkersHaveChanged() {
        // create a message for broadcasting to other servers
        const message :BroadcastChannelMessage<BroadcastChannelWorkersRegistration> = {
            type: "workers",
            value: {
                workers: {[this.serverId]:this.workers.myWorkers.map(w => w.registration)},
            }
        };
        // use the BroadcastChannel to notify other servers
        this.channel.postMessage(message);

        // update the other workers and (browser) clients
        this.broadcastWorkersToClientsAndWorkers();
    }

    async otherWorkersHaveChanged(workers :ServerWorkersObject) {
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

    createWebsocketBroadcastWorkersRegistrationMessage() : string {
        const workersRegistration: BroadcastWorkers = {workers:[]};
        const message :WebsocketMessageServerBroadcast = {
            type: WebsocketMessageTypeServerBroadcast.Workers,
            payload: workersRegistration,
        };
        // console.log('createWebsocketBroadcastWorkersRegistrationMessage this.workers', this.workers);
        workersRegistration.workers = workersRegistration.workers.concat(this.workers.myWorkers.map(w => w.registration));
        
        for (const [_, workerRegistrations] of this.workers.otherWorkers.entries()) {
            workersRegistration.workers = workersRegistration.workers.concat(workerRegistrations);
        }
        const messageString = JSON.stringify(message);
        return messageString;
    }

    // utility method used for testing and poking, not actually used normally,
    // all modifications are state change requests
    // async appendJob(definition: DockerJobDefinitionInputsBase64) {
    //     const hash = shaJobDefinition(definition);
    //     // only add to the queue if no existing job
    //     console.log(`${hash} appendJob`);
    //     // TODO: convert DockerJobDefinitionInputsBase64 to DockerJobDefinitionInputRefs
    //     const inputsDataRefs = await inputsBase64ToInputsDataRefs(definition.inputs);
    //     const definitionInputRefs :DockerJobDefinitionInputRefs = {...definition, inputs:inputsDataRefs};
    //     if (!this.state.jobs[hash]) {
    //         const stateChange :StateChangeValueQueued = {
    //             definition: definitionInputRefs,
    //             time: new Date(),
    //         }
    //         this.stateChange({
    //             tag: '',
    //             state: DockerJobState.Queued,
    //             job: hash,
    //             value: stateChange,
    //         });
    //     }
    // }
}