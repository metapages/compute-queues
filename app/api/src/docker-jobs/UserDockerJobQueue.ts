/**
 * Each unique user has their own queue of jobs and registered workers.
 * The browser will send jobs down to this queue, and the workers will
 * get and return jobs.
 *
 * Data model: finite state machines. jobs go through states.
 * Workers take jobs off the queue and have some time to get it done.
 *
 * Finished jobs stay in the state list for a few minutes before getting
 * removed. The results are cached tho
 *
 */


// eventually this should be persisted but for now it's just in memory
// import { EventEmitter } from 'events';
// import StrictEventEmitter from 'strict-event-emitter-types';

import { db } from '../db/kv/mod.ts';
import {
  BroadcastState,
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  State,
  StateChange,
  StateChangeValueQueued,
  StateChangeValueRunning,
  StateChangeValueWorkerFinished,
  WebsocketMessage,
  WebsocketMessageType,
  WorkerRegistration,
} from '../shared/mod.ts';
import { SERVER_INSTANCE_ID } from '../util/id.ts';

// 60 seconds
const MAX_TIME_FINISHED_JOB_IN_QUEUE = 60 * 1000;

// define your events
// interface Events {
//     state: (s: State) => void;
// }

// type UserDockerJobQueueEmitter = StrictEventEmitter<EventEmitter, Events>;

type BroadCastMessageType = "job-state";
type BroadCastMessage = {
    instanceId: string;
    type: BroadCastMessageType;
    value: State;
};

/**
 * Each user has their own personal docker job queue
 * The UserDockerJobQueue handled browser and worker websocket connections
 * and communications and tracking state.
 */
export class UserDockerJobQueue //extends (EventEmitter as { new(): UserDockerJobQueueEmitter }) 
{
    state: State;
    readonly workers: { connection: WebSocket, registration: WorkerRegistration }[];
    readonly browsers: WebSocket[];
    readonly address:string;
    // A BroadcastChannel used by all isolates
    // https://docs.deno.com/deploy/api/runtime-broadcast-channel#example-update-an-in-memory-cache-across-instances
    readonly channel :BroadcastChannel;

    constructor(address:string) {
        // super();
        
        this.address = address;
        this.workers = [];
        this.browsers = [];
        this.state = { jobs: {} };
        this.channel = new BroadcastChannel(address);

        // TODO get only for this queue
        (async () => {
            const allPersistedJobInTheQueue = await db.queueGetAll(address);
            allPersistedJobInTheQueue.forEach(j => this.state.jobs[j.hash] = j)
            this.broadcastStateToChannel();
        })();

        // When a new message comes in from other instances, add it
        this.channel.onmessage = (event: MessageEvent) => {
            const payload :BroadCastMessage = event.data;
            if (payload.instanceId === SERVER_INSTANCE_ID) {
                return;
            }
            switch (payload.type) {
                case "job-state":
                    console.log('🌘job-state from broadcase, got to resolve and merge');

                    break;
                default:
                    break;
            }
        };
    }

    broadcastStateToChannel() {
        const message :BroadCastMessage = {
            instanceId: SERVER_INSTANCE_ID,
            type: "job-state",
            value: this.state,
        }
        this.channel.postMessage(message);
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
            this.broadcastStateToChannel();
        }

        // console.log(`🌗jobId=${jobId} jobRow=${JSON.stringify(jobRow, null, "  ")}`)
        try {
            switch (change.state) {
                // incoming state
                case DockerJobState.Finished:
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
                    console.log('nocache', nocache);

                    if (this.state.jobs[jobId]) {
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
                        const definition = valueQueued.definition;
                        // TODO hash job on the backend? Otherwise users can submit jobs with up jobIds that collide
                        // const hashId = shaJobDefinition(definition);
                        // if (jobId !== hashId) {
                        //     const valueFinished: StateChangeValueWorkerFinished = {
                        //         reason: DockerJobFinishedReason.Error,
                        //         result: {
                        //             error: `jobId(${jobId} !== hashId(${hashId}) from ${JSON.stringify(definition)}`,
                        //         },
                        //         time: new Date(),
                        //     }
                        //     jobRow = {
                        //         hash: jobId,
                        //         definition,
                        //         state: DockerJobState.Finished,
                        //         value: valueFinished,
                        //         history: [change],
                        //     };
                        //     this.state.jobs[jobId] = jobRow!;
                        //     sendBroadcast = true;
                        //     break;
                        // }
                        jobRow = {
                            hash: jobId,
                            definition,
                            state: DockerJobState.Queued,
                            value: valueQueued,
                            history: [],
                        };
                        this.state.jobs[jobId] = jobRow;
                        await updateState();
                        sendBroadcast = true;
                    }

                    break;
                // incoming state
                case DockerJobState.Running:
                    console.log(`${jobId} Job Running, previous job ${this.state.jobs[jobId].state}`)

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

        console.log(`stateChange(${change.state}) end `)
        if (sendBroadcast) {
            // save to disk
            // resultCacheAdd

            console.log('sending broadcast')
            this.broadcast();
            if (change.state === DockerJobState.Queued) {
                await db.queueJobAdd(this.address, jobRow);
            } else {
                await db.queueJobUpdate(this.address, jobRow);
            }

            // when a job finishes, check the queue a bit later
            // and remove old jobs from the queue. the results
            // have already been persisted in the db
            if (change.state === DockerJobState.Finished) {
                setTimeout(() => {
                    this.removeOldFinishedJobsFromQueue();
                }, 60000);
            }
        }
        // needed?
        // this.emit('state', this.state);
    }

    async removeOldFinishedJobsFromQueue() {
        // check for finished jobs around longer than a minute
        const now = Date.now();
        let sendBroadcast = false;
        for (const [jobId, job] of Object.entries(this.state.jobs))  {

            if (this.state.jobs[jobId].state === DockerJobState.Finished) {
                
                const stateChange = this.state.jobs[jobId].value as StateChangeValueWorkerFinished;
                // console.log('typeof(stateChange.time)', typeof(stateChange.time));
                if (typeof(stateChange.time) !== 'object') {
                    stateChange.time = new Date(stateChange.time);
                }
                if ((now - stateChange.time.getTime()) > MAX_TIME_FINISHED_JOB_IN_QUEUE) {
                    console.log(`🪓 removing finished job from queue id=${jobId}`);
                    delete this.state.jobs[jobId];
                    sendBroadcast = true;
                    await db.queueJobRemove(this.address, jobId);
                }
            }
        }
        
        if (sendBroadcast) {
            await this.broadcast();
        }
    }

    async connectWorker(connection: { socket: WebSocket }) {
        console.log('⏯️ 🔌 Connected a worker');

        let worker: WorkerRegistration;

        connection.socket.addEventListener('close', () => {
            console.log(`⏹️ 🔌 Removing ${worker ? worker.id : "unknown worker"}`);
            var index = this.workers.findIndex(w => w.connection === connection.socket);
            if (index > -1) {
                if (worker !== this.workers[index].registration) {
                    throw new Error('worker registration mismatch');
                }
                console.log(`🌪 Removing ${this.workers[index].registration.id}`);
                this.workers.splice(index, 1);
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
                const possibleMessage: WebsocketMessage = JSON.parse(messageString);
                switch (possibleMessage.type) {
                    case WebsocketMessageType.StateChange:
                        const change: StateChange = possibleMessage.payload as StateChange;
                        if (!change) {
                            console.log({ error: 'Missing payload in message', message: messageString.substring(0, 100) });
                            break;
                        }
                        this.stateChange(change);
                        break;
                    case WebsocketMessageType.WorkerRegistration:
                        worker = possibleMessage.payload as WorkerRegistration;
                        if (!worker) {
                            console.log({ error: 'Missing payload in message', message: messageString.substring(0, 100) });
                            break;
                        }
                        console.log(`🔌🔗 Worker registered (so broadcasting) ${worker.id}`);
                        this.workers.push({ registration: worker, connection: connection.socket });
                        this.broadcast();
                        break;
                    default:
                    //ignored
                }
            } catch (err) {
                console.log(err);
            }
        });

        await this.broadcast();

        // const messageString = this.createBroadcastMessage();
        // connection.socket.send(messageString);
    }

    async connectBrowser(connection: { socket: WebSocket }) {
        console.log('⏯️ 👁️ Connected a browser');
        this.browsers.push(connection.socket);
        connection.socket.addEventListener('close', () => {
            var index = this.browsers.indexOf(connection.socket);
            if (index > -1) {
                console.log(`⏹️ 🔌 Removing browser`);
                this.browsers.splice(index, 1);
            }
        });
        await this.broadcast();

        connection.socket.addEventListener('message', event => {
            try {
                const {data:message} = event;
                const messageString = message.toString();
                if (messageString === 'PING') {
                    console.log(`PING FROM browser`)
                    connection.socket.send('PONG');
                    return;
                }
                if (!messageString.startsWith('{')) {
                    console.log('browser message not JSON', messageString.substr(0, 100))
                    return;
                }
                const possibleMessage: WebsocketMessage = JSON.parse(messageString);
                switch (possibleMessage.type) {
                    case WebsocketMessageType.StateChange:
                        const change: StateChange = possibleMessage.payload as StateChange;
                        if (!change) {
                            console.log({ error: 'Missing payload in message', message: messageString.substr(0, 100) });
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
    }

    createBroadcastMessage(): string {
        const state: BroadcastState = {
            state: this.state,
            workers: this.workers.map(w => w.registration),
            browsers: this.browsers.length,
            version: -1,
        };
        const message: WebsocketMessage = {
            type: WebsocketMessageType.State,
            payload: state,
        }
        const messageString = JSON.stringify(message);
        return messageString;
    }

    async broadcast() {
        const messageString = this.createBroadcastMessage();
        this.workers.forEach(worker => {
            try {
                worker.connection.send(messageString);
            } catch (err) {
                console.log(`Failed to send broadcase to worker ${err}`);
            }
        });
        this.browsers.forEach(connection => {
            try {
                connection.send(messageString);
            } catch (err) {
                console.log(`Failed to send broadcase to worker ${err}`);
            }
        });
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

const cacheDisabled = (job :DockerJobDefinitionRow) => {
    return (job.history[0].value as StateChangeValueQueued).nocache === true;
}
