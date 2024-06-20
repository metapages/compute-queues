import mod from '../../mod.json' with { type: 'json' };
import { config } from '../config.ts';
import {
  BroadcastJobStates,
  DockerJobDefinitionInputRefs,
  DockerJobDefinitionRow,
  DockerJobFinishedReason,
  DockerJobState,
  DockerRunResultWithOutputs,
  StateChangeValueQueued,
  StateChangeValueRunning,
  StateChangeValueWorkerFinished,
  WebsocketMessageSenderWorker,
  WebsocketMessageTypeWorkerToServer,
  WorkerRegistration,
} from '../shared/mod.ts';
import {
  DockerJobArgs,
  dockerJobExecute,
  DockerJobExecution,
  DockerRunResult,
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
    // TODO: put local state
}



export class DockerJobQueue {
    workerId: string;
    cpus: number;
    // space in the value structure for local state
    queue: { [hash in string]: WorkerJobQueueItem } = {};

    // If we finish a job but the server is unavailabe when we request a stateChange
    // then we persist (for some interval (1 week?)) the stateChange so that when the
    // server reconnects, we can send the results
    // cachedResults: any = {};
    // Tell the server our state change requests
    sender: WebsocketMessageSenderWorker;

    // jobs: { [hash in string]: DockerJobDefinitionInputRefs } = {};

    constructor(args: DockerJobQueueArgs) {
        const { sender, cpus, id } = args;
        this.cpus = cpus;
        this.sender = sender;
        this.workerId = id;
    }

    register() {
        const registration: WorkerRegistration = {
            version: Version,
            id: this.workerId,
            cpus: this.cpus,
        };
        this.sender({
            type: WebsocketMessageTypeWorkerToServer.WorkerRegistration,
            payload: registration,
        });
    }


    // take jobs off the queue
    // kill jobs the server says to kill
    // onState(state: BroadcastState) {
    //     // console.log(`workerState ${JSON.stringify(state, null, '  ')}`)
    //     this._checkRunningJobs(state);
    //     this._claimJobs(state);
    // }

    onUpdateUpdateASubsetOfJobs(message: BroadcastJobStates) {
        message.isSubset = true;
        this._checkRunningJobs(message);
        this._claimJobs(message);
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
                    console.log(`Cannot find local job ${locallyRunningJobId} in server state, killing and removing`);
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
                    // FINE it finished elsewhere
                    this._killJobAndIgnore(locallyRunningJobId);
                    break;
                case DockerJobState.Queued:
                    // server says queued, I say running, remind the server
                    // this can easily happen if I submit Running, but then
                    // the worker gets another update immediately
                    // The server will ignore this if it gets multiple times
                    this.sender({
                        type: WebsocketMessageTypeWorkerToServer.StateChange,
                        payload: {
                            tag: this.workerId,
                            job: locallyRunningJobId,
                            state: DockerJobState.Running,
                            value: {
                                worker: this.workerId,
                                time: new Date(),
                            },
                        }
                    });
                    break;
                case DockerJobState.Running:
                    // good!
                    // except if another worker has taken it, then kill ours (server is dictator)
                    if ((serverJobState.value as StateChangeValueRunning).worker !== this.workerId) {
                        this._killJobAndIgnore(locallyRunningJobId);
                    }
                    break;
            }

            // are any jobs running locally actually killed by the server? or running
            if (serverJobState.state === DockerJobState.Finished) {
                console.log(`Cannot find local job ${locallyRunningJobId} in server state, killing and removing`);
                this._killJobAndIgnore(locallyRunningJobId);
            }
        }

        // Remove jobs not in the jobState update from our local store
        // Maybe in the future we keep around
        // for (const storedJobDefinitionId of Object.keys(this.jobs)) {
        //     if (!jobStates[storedJobDefinitionId]) {
        //         delete this.jobs[storedJobDefinitionId];
        //     }
        // }
    }

    _claimJobs(message: BroadcastJobStates) {
        const jobStates = message.state.jobs;
        // check if the server says I have a job running (that I told it)
        // but I don't have it running now (I restarted?) and didn't reconnect
        // to the running container

        const jobsServerSaysAreRunningOnMe = Object.keys(jobStates).filter(key => jobStates[key].state === DockerJobState.Running && (jobStates[key].value as StateChangeValueRunning).worker === this.workerId);
        jobsServerSaysAreRunningOnMe.forEach(runningJobId => {
            if (!this.queue[runningJobId]) {
                this._startJob(jobStates[runningJobId]);
            }
        });

        // only care about queued jobs
        const queuedJobKeys: string[] = Object.keys(jobStates).filter(key => jobStates[key].state === DockerJobState.Queued);
        // So this is the core logic of claiming jobs is here, and currently, it's just FIFO
        while (queuedJobKeys.length > 0 && Object.keys(this.queue).length < this.cpus) {
            const jobKey = queuedJobKeys.pop()!;
            const job = jobStates[jobKey]
            // console.log(`[${job.hash}] about to claim ${JSON.stringify(job)}`)
            this._startJob(job);
            return;
        }
    }
    

    async _startJob(jobBlob: DockerJobDefinitionRow): Promise<void> {


        console.log(`[${jobBlob.hash}] starting...`)
        const definition = (jobBlob.history[0].value as StateChangeValueQueued).definition;
        if (!definition) {
            console.log(`💥 _startJob but no this.jobs[${jobBlob.hash.substring(0, 10)}]`);
            return;
        }

        // add a placeholder on the queue for this job
        this.queue[jobBlob.hash] = { execution: null, definition };

        // tell the server we've started the job
        const valueRunning: StateChangeValueRunning = {
            worker: this.workerId,
            time: new Date(),
        };
        this.sender({
            type: WebsocketMessageTypeWorkerToServer.StateChange,
            payload: {
                job: jobBlob.hash,
                tag: this.workerId,
                state: DockerJobState.Running,
                value: valueRunning,
            }
        });

        let volumes: { inputs: Volume, outputs: Volume };
        try {
            volumes = await convertIOToVolumeMounts({id:jobBlob.hash, definition}, config.server);
        } catch (err) {
            console.error('💥', err);
            // TODO too much code duplication here
            // Delete from our local queue before sending
            // TODO: cache locally before attempting to send
            delete this.queue[jobBlob.hash];

            const valueError: StateChangeValueWorkerFinished = {
                reason: DockerJobFinishedReason.Error,
                worker: this.workerId,
                time: new Date(),
                result: ({
                    error: `${err}`,
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
            id: jobBlob.hash,
            image: definition.image,
            command: definition.command ? convertStringToDockerCommand(definition.command, definition.env) : undefined,
            entrypoint: definition.entrypoint ? convertStringToDockerCommand(definition.entrypoint, definition.env) : undefined,
            workdir: definition.workdir,
            env: definition.env,
            volumes: [volumes!.inputs, volumes!.outputs],
            gpu: definition.gpu,
            // outStream?: Writable;
            // errStream?: Writable;
        }

        const dockerExecution: DockerJobExecution = await dockerJobExecute(executionArgs);
        if (!this.queue[jobBlob.hash]) {
            console.log(`[${jobBlob.hash}] after await jobBlob.hash no job in queue so killing`);
            // what happened? the job was removed from the queue by someone else?
            dockerExecution.kill();
            return;
        }
        this.queue[jobBlob.hash].execution = dockerExecution;

        dockerExecution.finish.then(async (result: DockerRunResult) => {
            console.log(`[${jobBlob.hash}] result ${JSON.stringify(result, null, '  ').substr(0, 200)}`);

            const resultWithOutputs: DockerRunResultWithOutputs = result as DockerRunResultWithOutputs;
            resultWithOutputs.outputs = {};

            let valueFinished: StateChangeValueWorkerFinished | undefined;
            if (result.error) {
                // no outputs on error
                valueFinished = {
                    reason: DockerJobFinishedReason.Error,
                    worker: this.workerId,
                    time: new Date(),
                    result: resultWithOutputs,
                };

            } else {
                // get outputs
                try {
                    const outputs = await getOutputs(jobBlob);
                    valueFinished = {
                        reason: DockerJobFinishedReason.Success,
                        worker: this.workerId,
                        time: new Date(),
                        result: { ...result, outputs },
                    };
                } catch (err) {
                    console.log(`[${jobBlob.hash}] 💥 failed to getOutputs ${err}`);
                    valueFinished = {
                        reason: DockerJobFinishedReason.Error,
                        worker: this.workerId,
                        time: new Date(),
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
            console.log(`[${jobBlob.hash}] 💥 errored ${err}`);

            // Delete from our local queue before sending
            // TODO: cache locally before attempting to send
            delete this.queue[jobBlob.hash];

            const valueError: StateChangeValueWorkerFinished = {
                reason: DockerJobFinishedReason.Error,
                worker: this.workerId,
                time: new Date(),
                result: ({
                    error: err,
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


    }

    _killJobAndIgnore(locallyRunningJobId: string) {
        console.log(`Killing job ${locallyRunningJobId}`);
        const localJob = this.queue[locallyRunningJobId];
        delete this.queue[locallyRunningJobId];
        localJob?.execution?.kill();
    }
}
