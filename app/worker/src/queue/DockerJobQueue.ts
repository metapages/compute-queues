import { ms } from 'https://deno.land/x/ms@v0.1.0/ms.ts';

import { resolvePreferredWorker } from '../../../shared/src/mod.ts';
import mod from '../../mod.json' with { type: 'json' };
import { config } from '../config.ts';
import {
  BroadcastJobStates,
  DockerApiDeviceRequest,
  DockerJobDefinitionInputRefs,
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  DockerRunResult,
  DockerRunResultWithOutputs,
  StateChangeValueQueued,
  StateChangeValueRunning,
  StateChangeValueWorkerFinished,
  WebsocketMessageSenderWorker,
  WebsocketMessageTypeWorkerToServer,
  WebsocketMessageWorkerToServer,
  WorkerRegistration,
  WorkerStatusResponse,
} from '../shared/mod.ts';
import {
  DockerJobArgs,
  dockerJobExecute,
  DockerJobExecution,
  Volume,
} from './DockerJob.ts';
import {
  convertIOToVolumeMounts,
  getOutputs,
} from './IO.ts';
import { convertStringToDockerCommand } from './utils.ts';

const Version :string = mod.version;

export interface DockerJobQueueArgs extends WorkerRegistration {
    sender: WebsocketMessageSenderWorker;
}

type WorkerJobQueueItem = {
    execution: DockerJobExecution | null;
    definition: DockerJobDefinitionInputRefs;
    // We might have to send this multiple times, so keep it around
    runningMessageToServer: WebsocketMessageWorkerToServer;
    gpuIndices?: number[];
    
}

const UPDATE_WORKERS_INTERVAL = ms("5s")

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
    sender: WebsocketMessageSenderWorker;

    // jobs: { [hash in string]: DockerJobDefinitionInputRefs } = {};

    constructor(args: DockerJobQueueArgs) {
        const { sender, cpus, gpus, id } = args;
        this.cpus = cpus;
        this.gpus = gpus;
        this.sender = sender;
        this.workerId = id;
        this.workerIdShort = this.workerId.substring(0,6);
    }

    gpuDeviceIndicesUsed() :number[] {
        const gpuDeviceIndicesUsed :number[] = Object.values(this.queue)
            .filter((item :WorkerJobQueueItem) => item.gpuIndices)
            .reduce<number[]>((array, item) => {
                return item.gpuIndices ? array.concat(item.gpuIndices) : array;
            }, []);
            gpuDeviceIndicesUsed.sort();
        return gpuDeviceIndicesUsed;
        // return Object.entries(this.queue).filter(([_, item]) => item.definition.gpu).length;
    }

    gpuCapacity() :number {
        return this.gpus - this.gpuDeviceIndicesUsed().length;
    }

    isGPUCapacity() :boolean {
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

    getGPUDeviceIndex() :number {
        if (!this.isGPUCapacity()) {
            throw `getGPUDeviceIndex but no capacity`;
        }
        const gpuDeviceIndicesUsed :number[] = Object.values(this.queue)
            .filter((item :WorkerJobQueueItem) => item.gpuIndices)
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

    status() :WorkerStatusResponse {
        return {
            time: Date.now(),
            id: this.workerId,
            cpus: this.cpus,
            gpus: this.gpus,
            queue: Object.fromEntries(Object.entries(this.queue).map(([key, item]) => {
                return [
                    key,
                    {
                        jobId: key,
                        definition: item.definition,
                        finished: !!item.execution
                    }

                ]
            })),
        }
    }

    register() {
        const registration: WorkerRegistration = {
            time: Date.now(),
            version: Version,
            id: this.workerId,
            cpus: this.cpus,
            gpus: this.gpus,
        };
        this.sender({
            type: WebsocketMessageTypeWorkerToServer.WorkerRegistration,
            payload: registration,
        });
        for (const runningQueueObject of Object.values(this.queue)) {
            this.sender(runningQueueObject.runningMessageToServer);
        }
    }


    // take jobs off the queue
    // kill jobs the server says to kill
    // onState(state: BroadcastState) {
    //     // console.log(`workerState ${JSON.stringify(state, null, '  ')}`)
    //     this._checkRunningJobs(state);
    //     this._claimJobs(state);
    // }

    async onUpdateUpdateASubsetOfJobs(message: BroadcastJobStates) {
        message.isSubset = true;
        this._checkRunningJobs(message);
        await this._claimJobs(message);
    }

    onUpdateSetAllJobStates(message: BroadcastJobStates) {
        // console.log(`workerState ${JSON.stringify(state, null, '  ')}`)
        this._checkRunningJobs(message);
        this._claimJobs(message);
    }

    _checkRunningJobs(message: BroadcastJobStates) {
        const jobStates = message.state.jobs;
        // we get 
        const isAllJobs = !message.isSubset;

        // make sure our local jobs should be running (according to the server state)
        for (const [locallyRunningJobId, _] of Object.entries(this.queue)) {
            // do we have local jobs the server doesn't even know about? This should never happen
            // Maybe it could be in the case where the browser disconnected and you want the jobs to keep going
            if (!jobStates[locallyRunningJobId]) {
                // we can only kill the job if we know it's not running on the server
                if (isAllJobs) { 
                    console.log(`[${this.workerIdShort}] Cannot find local job ${locallyRunningJobId.substring(0,6)} in server state, killing and removing`);
                    this._killJobAndIgnore(locallyRunningJobId);
                    return;
                } else {
                    // this job isn't in this update, but this update is not all jobs, so the server
                    // hasn't changed our job state. so bail out
                    return;
                }
            }

            const serverJobState = jobStates[locallyRunningJobId];

            switch (serverJobState.state) {
                case DockerJobState.Finished:
                    // FINE it finished elsewhere, how rude
                    console.log(`[${this.workerIdShort}] [${locallyRunningJobId.substring(0,6)}] finished elsehwere, killing here`);
                    this._killJobAndIgnore(locallyRunningJobId);
                    break;
                case DockerJobState.ReQueued:
                case DockerJobState.Queued:
                    // server says queued, I say running, remind the server
                    // this can easily happen if I submit Running, but then
                    // the worker gets another update immediately
                    // The server will ignore this if it gets multiple times
                    console.log(`[${this.workerIdShort}] [${locallyRunningJobId.substring(0,6)}] server says queued, I say running, sending running again`);
                    this.sender({
                        type: WebsocketMessageTypeWorkerToServer.StateChange,
                        payload: {
                            tag: this.workerId,
                            job: locallyRunningJobId,
                            state: DockerJobState.Running,
                            value: {
                                worker: this.workerId,
                                time: Date.now(),
                            },
                        }
                    });
                    break;
                case DockerJobState.Running:
                    // good!
                    // except if another worker has taken it, then kill ours (server is dictator)
                    if ((serverJobState.value as StateChangeValueRunning).worker !== this.workerId) {
                        
                        const preferredWorker = resolvePreferredWorker(this.workerId, (serverJobState.value as StateChangeValueRunning).worker);
                        if (preferredWorker === this.workerId) {
                            console.log(`[${this.workerIdShort}] [${locallyRunningJobId.substring(0,6)}] running, but elsewhere apparently. We are keeping ours since we are preferred`);
                        } else {
                            console.log(`[${this.workerIdShort}] [${locallyRunningJobId.substring(0,6)}] running, but elsewhere also. Killing ours because preferred by ${preferredWorker.substring(0,6)}`);
                            this._killJobAndIgnore(locallyRunningJobId);
                        }
                    }
                    break;
            }

            // are any jobs running locally actually killed by the server? or running
            if (serverJobState.state === DockerJobState.Finished) {
                console.log(`[${this.workerIdShort}] Cannot find local job ${locallyRunningJobId.substring(0,6)} in server state, killing and removing`);
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

    async _claimJobs(message: BroadcastJobStates) {
        const jobStates = message.state.jobs;
        // check if the server says I have a job running (that I told it)
        // but I don't have it running now (I restarted?) and didn't reconnect
        // to the running container

        const jobsServerSaysAreRunningOnMe = Object.keys(jobStates).filter(key => jobStates[key].state === DockerJobState.Running && (jobStates[key].value as StateChangeValueRunning).worker === this.workerId);
        for (const runningJobId of jobsServerSaysAreRunningOnMe) {
            if (!this.queue[runningJobId]) {
                await this._startJob(jobStates[runningJobId]);
            }
        }

        // only care about queued jobs
        const queuedJobKeys: string[] = Object.keys(jobStates)
            .filter(key => jobStates[key].state === DockerJobState.Queued || jobStates[key].state === DockerJobState.ReQueued);
        // So this is the core logic of claiming jobs is here, and currently, it's just FIFO
        // Go through the queued jobs and start them if we have capacity
        // let index = 0;
        while (queuedJobKeys.length > 0) {
            const jobKey = queuedJobKeys.pop()!;
            const job = jobStates[jobKey];
            const definition = (job.history[0].value as StateChangeValueQueued).definition;
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
                        continue;
                    }
                }
                // console.log(`[${job.hash}] about to claim ${JSON.stringify(job)}`)
                await this._startJob(job);
            }
        }
    }
    

    async _startJob(jobBlob: DockerJobDefinitionRow): Promise<void> {
        console.log(`[${this.workerIdShort}] [${jobBlob.hash.substring(0,6)}] starting...`)
        const definition = (jobBlob.history[0].value as StateChangeValueQueued).definition;
        if (!definition) {
            console.log(`💥 [${this.workerIdShort}] _startJob but no this.jobs[${jobBlob.hash.substring(0, 6)}]`);
            return;
        }

        

        // tell the server we've started the job
        const valueRunning: StateChangeValueRunning = {
            worker: this.workerId,
            time: Date.now(),
        };
        const runningMessageToServer: WebsocketMessageWorkerToServer = {
            type: WebsocketMessageTypeWorkerToServer.StateChange,
            payload: {
                job: jobBlob.hash,
                tag: this.workerId,
                state: DockerJobState.Running,
                value: valueRunning,
            }
        }

        // add a placeholder on the queue for this job
        this.queue[jobBlob.hash] = { execution: null, definition, runningMessageToServer };
        let deviceRequests: DockerApiDeviceRequest[] | undefined;
        if (definition.gpu) {
            const deviceIndex = this.getGPUDeviceIndex();
            this.queue[jobBlob.hash].gpuIndices = [deviceIndex];
            deviceRequests = [{
                                Driver: 'nvidia',
                                // Count: 1,
                                DeviceIDs: [`${deviceIndex}`],
                                Capabilities: [["gpu"]],
                            }]
        }


        this.sender(runningMessageToServer);

        // after this it can all happen async

        (async () => {
        
            let volumes: Volume[];
            try {
                volumes = await convertIOToVolumeMounts({id:jobBlob.hash, definition}, config.server, this.workerId);
            } catch (err) {
                console.error(`💥 [${this.workerIdShort}]`, err);
                // TODO too much code duplication here
                // Delete from our local queue before sending
                // TODO: cache locally before attempting to send
                delete this.queue[jobBlob.hash];

                const valueError: StateChangeValueWorkerFinished = {
                    reason: DockerJobFinishedReason.Error,
                    worker: this.workerId,
                    time: Date.now(),
                    result: ({
                        error: `${err}`,
                        logs: [[`💥 ${err}`, Date.now(), true]],
                    } as DockerRunResultWithOutputs),
                };

                this.sender({
                    type: WebsocketMessageTypeWorkerToServer.StateChange,
                    payload: {
                        job: jobBlob.hash,
                        tag: this.workerId,
                        state: DockerJobState.Finished,
                        value: valueError,
                    }
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
                command: definition.command ? convertStringToDockerCommand(definition.command, definition.env) : undefined,
                entrypoint: definition.entrypoint ? convertStringToDockerCommand(definition.entrypoint, definition.env) : undefined,
                workdir: definition.workdir,
                env: definition.env,
                volumes,
                deviceRequests,
                durationMax: definition.durationMax,
                // outStream?: Writable;
                // errStream?: Writable;
            }

            const dockerExecution: DockerJobExecution = await dockerJobExecute(executionArgs);
            if (!this.queue[jobBlob.hash]) {
                console.log(`[${this.workerIdShort}] [${jobBlob.hash.substring(0,6)}] after await jobBlob.hash no job in queue so killing`);
                // what happened? the job was removed from the queue by someone else?
                try {
                    dockerExecution.kill();

                } catch(err) {
                    console.log(`[${this.workerIdShort}] [${jobBlob.hash.substring(0,6)}] ❗ dockerExecution.kill() errored but could be expeced`, err);
                }

                return;
            }
            this.queue[jobBlob.hash].execution = dockerExecution;

            dockerExecution.finish.then(async (result: DockerRunResult) => {
                console.log(`[${jobBlob.hash.substring(0, 6)}] result ${JSON.stringify(result, null, '  ').substring(0, 200)}`);
                result.logs = result.logs || [];
                if (result.StatusCode !== 0) {
                    result.logs.push([`💥 StatusCode: ${result.StatusCode}`, Date.now(), true]);
                    console.log(`[${this.workerIdShort}] [${jobBlob.hash.substring(0, 6)}] 💥 StatusCode: ${result.StatusCode}`);
                    console.log(`[${this.workerIdShort}] [${jobBlob.hash.substring(0, 6)}] 💥 stderr: ${result.logs?.join("\n")?.substring(0, 200)}`);
                }
                if (result.error) {
                    result.logs.push([`💥 ${result.error}`, Date.now(), true]);
                    result.error = "Error"
                    console.log(`[${this.workerIdShort}] [${jobBlob.hash.substring(0, 6)}] 💥 error: ${result.error}`);
                }
                
                const resultWithOutputs: DockerRunResultWithOutputs = result as DockerRunResultWithOutputs;
                resultWithOutputs.outputs = {};

                let valueFinished: StateChangeValueWorkerFinished | undefined;
                if (result.error) {
                    valueFinished = {
                        reason: DockerJobFinishedReason.Error,
                        worker: this.workerId,
                        time: Date.now(),
                        result: resultWithOutputs,
                    };

                } else {
                    // get outputs
                    try {
                        console.log(`[${this.workerIdShort}] [${jobBlob.hash.substring(0,6)}] uploading outputs`);
                        const outputs = await getOutputs(jobBlob, this.workerId);
                        valueFinished = {
                            reason: DockerJobFinishedReason.Success,
                            worker: this.workerId,
                            time: Date.now(),
                            result: { ...result, outputs },
                        };
                    } catch (err) {
                        console.log(`[${this.workerIdShort}] [${jobBlob.hash.substring(0,6)}] 💥 failed to upload outputs ${err}`);
                        resultWithOutputs.logs = resultWithOutputs.logs || [];
                        console.error(err);
                        resultWithOutputs.logs.push([`💥 failed to get job outputs`, Date.now(), true], [`err=${err}`, Date.now(), true]);
                        valueFinished = {
                            reason: DockerJobFinishedReason.Error,
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
                    type: WebsocketMessageTypeWorkerToServer.StateChange,
                    payload: {
                        job: jobBlob.hash,
                        tag: this.workerId,
                        state: DockerJobState.Finished,
                        value: valueFinished,
                    }
                });
            }).catch(err => {
                console.log(`[${this.workerIdShort}] [${jobBlob.hash.substring(0,6)}] 💥 errored ${err}`);


                // Delete from our local queue before sending
                // TODO: cache locally before attempting to send
                delete this.queue[jobBlob.hash];

                const valueError: StateChangeValueWorkerFinished = {
                    reason: DockerJobFinishedReason.Error,
                    worker: this.workerId,
                    time: Date.now(),
                    result: ({
                        error: err,
                        logs: [[`💥 Job Error`, Date.now(), true], [`${err}`, Date.now(), true]],
                    } as DockerRunResultWithOutputs),
                };

                this.sender({
                    type: WebsocketMessageTypeWorkerToServer.StateChange,
                    payload: {
                        job: jobBlob.hash,
                        tag: this.workerId,
                        state: DockerJobState.Finished,
                        value: valueError,
                    }
                });

            }).finally(() => {
                // I had the queue removal here initially but I wanted
                // to remove the element from the queue before sending to server
                // in case server send fails and throws an error
            })

        })();


    }

    _killJobAndIgnore(locallyRunningJobId: string) {
        console.log(`[${this.workerIdShort}] Killing job ${locallyRunningJobId.substring(0,6)}`);
        const localJob = this.queue[locallyRunningJobId];
        delete this.queue[locallyRunningJobId];
        localJob?.execution?.kill();
    }
}
