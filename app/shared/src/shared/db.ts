import path from "node:path";

import { getKv } from "/@/shared/kv.ts";
import {
  DefaultNamespace,
  type DockerJobDefinitionInputRefs,
  DockerJobFinishedReason,
  DockerJobState,
  type EnqueueJob,
  type InMemoryDockerJob,
  type StateChange,
  type StateChangeValue,
  type StateChangeValueFinished,
  type StateChangeValueRunning,
} from "/@/shared/types.ts";
import { addJobProcessSubmissionWebhook } from "/@/shared/webhooks.ts";
import { LRUMap } from "mnemonist";
import { retryAsync } from "retry";
import { ensureDir } from "std/fs";
import { join } from "std/path";

import { JobDataCacheDurationMilliseconds } from "./constants.ts";
import {
  getDefinitionS3Key,
  getJobColorizedString,
  getQueueColorizedString,
  getResultsS3Key,
  setJobStateFinished,
  setJobStateQueued,
  setJobStateRunning,
} from "./util.ts";

const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");

let deleteFromS3: (key: string) => Promise<void>;
let putJsonToS3: (key: string, data: unknown) => Promise<void>;
let getJsonFromS3: <T>(key: string) => Promise<T | undefined>;

const definitionCache = new LRUMap<string, DockerJobDefinitionInputRefs>(200);

/**
 *  /job/:jobId/definition.json
 *  /job/:jobId/result.json
 *  /job/:jobId/inputs/*
 *  /job/:jobId/outputs/*
 *  /queue/:queue/jobId/inMemoryJob.json
 *  /queue-namespace-job-control/queue/jobId/namespace/control.json
 *  /job-queue-namespace/jobId/queue/namespace/true.json
 *  /queue/queue/jobId/inMemoryJob.json
 *  /queue/queue/jobId/inMemoryJob.json
 */
export class DB {
  private kv: Deno.Kv;
  private dataDirectory: string;

  private constructor(kv: Deno.Kv, dataDirectory: string) {
    this.kv = kv;
    this.dataDirectory = dataDirectory;
  }

  static async initialize(dataDirectory?: string): Promise<DB> {
    const kv = await getKv();

    // Use the provided dataDirectory or default to TMPDIR
    const effectiveDataDirectory = dataDirectory || "/tmp/worker-metapage-io";

    if (!AWS_SECRET_ACCESS_KEY) {
      // Ensure the directory exists and has correct permissions if not using S3
      await ensureDir(effectiveDataDirectory);
      await Deno.chmod(effectiveDataDirectory, 0o777);
      // await ensureDir(join(effectiveDataDirectory, "q/local"));
      // await Deno.chmod(join(effectiveDataDirectory, "q/local"), 0o777);
      await ensureDir(join(effectiveDataDirectory, "j"));
      await Deno.chmod(join(effectiveDataDirectory, "j"), 0o777);
      await ensureDir(join(effectiveDataDirectory, "f"));
      await Deno.chmod(join(effectiveDataDirectory, "f"), 0o777);
    }

    // Update S3 functions or local filesystem functions based on dataDirectory
    await DB.setupStorageFunctions(effectiveDataDirectory);

    return new DB(kv, effectiveDataDirectory);
  }

  private static async setupStorageFunctions(
    dataDirectory: string,
  ): Promise<void> {
    if (AWS_SECRET_ACCESS_KEY) {
      // Import S3 functions
      ({ deleteFromS3, putJsonToS3, getJsonFromS3 } = await import(
        "/@/shared/s3.ts"
      ));
    } else {
      deleteFromS3 = async (key: string): Promise<void> => {
        const filePath = join(dataDirectory, key);
        try {
          await Deno.remove(filePath);
        } catch (error) {
          if (error instanceof Deno.errors.NotFound) {
            // File already deleted, ignore
          } else {
            console.error(`Error deleting file ${filePath}:`, error);
          }
        }
      };

      putJsonToS3 = async (key: string, data: unknown): Promise<void> => {
        const filePath = join(dataDirectory, key);
        const dirPath = path.dirname(filePath);
        try {
          await Deno.mkdir(dirPath, { recursive: true, mode: 0o777 });
          const jsonData = JSON.stringify(data);
          await Deno.writeTextFile(filePath, jsonData, { mode: 0o777 });
          // return key;
          // {
          //   type: DataRefType.key,
          //   value: key,
          // };
        } catch (error) {
          console.error(`Error writing file ${filePath}:`, error);
          throw error;
        }
      };

      getJsonFromS3 = async <T>(
        key: string,
      ): Promise<T | undefined> => {
        const filePath = join(dataDirectory, key);
        try {
          const jsonData = await Deno.readTextFile(filePath);
          return JSON.parse(jsonData) as T;
        } catch (_) {
          // if (error instanceof Deno.errors.NotFound) {
          //   console.error(`File not found: ${filePath}`, (error as Error)?.message, (error as Error)?.stack);
          // } else {
          //   console.error(`Error reading file ${filePath}:`, (error as Error)?.message, (error as Error)?.stack);
          // }
          return undefined;
        }
      };
    }
  }

  // ... rest of the DB class methods ...

  // (The remaining methods of the DB class can remain unchanged)
  /**
   * Key spaces:
   *  - ["job", jobId]
   *  - ["job-queue-namespace", jobId, queue, namespace]
   *  - ["queue", queue, jobId]
   *  - ["queue-namespace-job-control", queue, jobId, namespace]
   * @param queue
   * @param job
   */
  async queueJobAdd(args: {
    queue: string;
    job: EnqueueJob;
  }): Promise<InMemoryDockerJob | null> {
    const { queue, job } = args;
    const namespace = job?.control?.namespace || DefaultNamespace;
    const jobId = job.id;
    try {
      const existingNamespaces = await this.queueJobGetNamespaces({ queue, jobId });
      const includesNamespace = existingNamespaces.includes(namespace);
      if (namespace !== DefaultNamespace && includesNamespace) {
        // console.log(
        //   `${getQueueColorizedString(queue)} ${
        //     getJobColorizedString(jobId)
        //   } already exists for namespace: ${namespace}`,
        // );
        return this.queueJobGet({ queue, jobId });
      }

      const control = job?.control || {};

      const definitionS3Key = `${getDefinitionS3Key(jobId)}`;

      if (!definitionCache.has(definitionS3Key)) {
        await putJsonToS3(
          definitionS3Key,
          job.definition,
        );

        definitionCache.set(definitionS3Key, job.definition);
      }

      const now = Date.now();

      const inMemoryJob: InMemoryDockerJob = {
        queuedTime: now,
        state: DockerJobState.Queued,
        time: now,
        worker: "",
        // this could be clobbered by a other
        debug: job.debug,
        namespaces: includesNamespace ? existingNamespaces : [...existingNamespaces, namespace],
        requirements: job.definition?.requirements,
        tags: job.definition?.tags,
      };

      if (existingNamespaces.length === 0) {
        await this.kv
          .atomic()
          .set(["job", jobId], definitionS3Key, { expireIn: JobDataCacheDurationMilliseconds })
          // if the value in "job-queue-namespace" is false, then the job is not
          // part of that namespace anymore
          .set(["job-queue-namespace", jobId, queue, namespace], true, {
            expireIn: JobDataCacheDurationMilliseconds,
          })
          .set(["queue", queue, jobId], inMemoryJob, {
            expireIn: JobDataCacheDurationMilliseconds,
          })
          .commit();

        // don't await this, it's not critical
        this.appendToJobHistory({
          queue,
          jobId,
          value: {
            type: DockerJobState.Queued,
            time: Date.now(),
          },
        });
      } else {
        await this.kv
          .atomic()
          .set(["job-queue-namespace", jobId, queue, namespace], true, {
            expireIn: JobDataCacheDurationMilliseconds,
          })
          .set(["queue", queue, jobId], inMemoryJob, {
            expireIn: JobDataCacheDurationMilliseconds,
          })
          .commit();
      }

      if (control) {
        // partition jobs that might be shared by the same namespace
        await this.kv.set(
          ["queue-job-namespace-control", queue, jobId, namespace],
          control,
          {
            expireIn: JobDataCacheDurationMilliseconds,
          },
        );
        await addJobProcessSubmissionWebhook({
          queue,
          namespace,
          jobId,
          control,
        });
      }

      return inMemoryJob;
    } catch (err) {
      console.error(
        `💥💥💥 ERROR adding job to queue ${
          getQueueColorizedString(
            queue,
          )
        } ${getJobColorizedString(jobId)}`,
        err,
      );
      throw err;
    }
  }

  async getJobDefinition(jobId: string): Promise<DockerJobDefinitionInputRefs | undefined> {
    const definitionKey = await this.kv.get<string>(["job", jobId]);
    if (!definitionKey?.value) {
      return undefined;
    }
    return getJsonFromS3(definitionKey.value);
  }

  async queueJobAddNamespace(args: {
    queue: string;
    jobId: string;
    namespace: string;
  }): Promise<void> {
    const { queue, jobId, namespace } = args;
    await this.kv.set(["job-queue-namespace", jobId, queue, namespace], true, {
      expireIn: JobDataCacheDurationMilliseconds,
    });
  }

  async queueJobRemoveNamespace(args: {
    jobId: string;
    queue: string;
    namespace: string;
  }): Promise<void> {
    const { queue, jobId, namespace } = args;
    // delete operations are not strongly consistent, so deletion followed by list
    // gives stale data, so we set to false and then delete
    await this.kv.set(["job-queue-namespace", jobId, queue, namespace], false, { expireIn: 1 });
    await this.kv.delete(["job-queue-namespace", jobId, queue, namespace]);
  }

  async queueJobGetNamespaces(args: {
    queue: string;
    jobId: string;
  }): Promise<string[]> {
    const { queue, jobId } = args;
    const result: string[] = [];
    try {
      const entries = this.kv.list<boolean>({
        prefix: ["job-queue-namespace", jobId, queue],
      }, { consistency: "strong" });
      for await (const entry of entries) {
        if (entry.value === null || entry.versionstamp === null) {
          continue;
        }
        result.push(entry.key[3] as string);
      }
    } catch (err) {
      console.error(
        `Error in queueJobGetNamespaces for queue ${queue}, job ${jobId}:`,
        err,
      );
      throw err;
    }
    return result; //already sorted
  }

  async queueJobExists(
    args: { queue: string; jobId: string },
  ): Promise<boolean> {
    const job = await this.queueJobGet(args);
    return !!job;
  }

  async queueJobGet(
    args: { queue: string; jobId: string },
  ): Promise<InMemoryDockerJob | null> {
    const existingNamespaces = await this.queueJobGetNamespaces(args);
    const existingJob = await this.kv.get<InMemoryDockerJob>(["queue", args.queue, args.jobId]);
    if (!existingJob.value) {
      return null;
    }
    existingJob.value.namespaces = existingNamespaces;
    return existingJob.value;
  }

  async getJobFinishedResults(jobId: string): Promise<StateChangeValueFinished | undefined> {
    const results: StateChangeValueFinished | undefined = await getJsonFromS3(getResultsS3Key(jobId));
    return results;
  }

  async persistJobFinishedResults(args: {
    jobId: string;
    results: StateChangeValueFinished;
  }) {
    const { jobId, results } = args;
    const key = getResultsS3Key(jobId);
    await putJsonToS3(key, results);
  }

  async deleteJobFinishedResults(args: {
    jobId: string;
  }) {
    const { jobId } = args;
    const key = getResultsS3Key(jobId);
    await deleteFromS3(key);
  }

  /**
   * Sets this job finished on every queue it is on.
   * UH OH, it can be cancelled in one queue+namespace,
   * which should NOT impact the other queues+namespaces
   * but it currently does
   * Returns (optionally) the state change the calling queue
   * should apply
   */
  async setJobFinished(args: {
    queue: string;
    change: StateChangeValueFinished;
    jobId: string;
    job: InMemoryDockerJob;
  }): Promise<{ updatedInMemoryJob?: InMemoryDockerJob; subsequentStateChange?: StateChange | undefined }> {
    let { change, jobId, queue, job } = args;
    const applyToAllNamespaces = change.namespace === "*";
    let namespaceChange = change.namespace || DefaultNamespace;
    if (namespaceChange === "*") {
      namespaceChange = DefaultNamespace;
    }

    if (change.namespace !== namespaceChange) {
      change = {
        ...change,
        namespace: namespaceChange,
      };
    }

    // get all job-queues-namespaces for this job and update all the histories
    // ["job-queue-namespace", jobId, queue, namespace]
    // This is everywhere the job is.
    // only a few reasons are allowed to persist the results to s3
    switch (change.reason) {
      // RUNNING -> FINISHED (that)
      case DockerJobFinishedReason.Success:
      case DockerJobFinishedReason.Error:
      case DockerJobFinishedReason.TimedOut: {
        // first make sure we cannot override the existing state
        switch (job.state) {
          // we are already finished, that is (almost?) never allowed
          case DockerJobState.Finished: {
            switch (job.finishedReason) {
              // conflicting: success overrides error and timeout
              case DockerJobFinishedReason.Success:
                if (
                  change.reason === DockerJobFinishedReason.Error || change.reason === DockerJobFinishedReason.TimedOut
                ) {
                  return {};
                }
                break;
              case DockerJobFinishedReason.Error:
              case DockerJobFinishedReason.TimedOut: {
                return {};
              }
              // this case is not persisted, it goes straight to queued
              // but we have here to cover all bases
              case DockerJobFinishedReason.WorkerLost:
              // these other cases are allowed to be processed
              // since they can be simply removing the namespace (user)
              case DockerJobFinishedReason.JobReplacedByClient:
              case DockerJobFinishedReason.Deleted:
              case DockerJobFinishedReason.Cancelled:
              default: {
                break;
              }
            }
            break;
          }
          default: {
            break;
          }
        }

        // persist the results to s3 before updating the job state
        // We are definitely finished, no mucking around here.
        // this job finished in a way that is the same for all
        // queue+namespaces, so we can persist the results to s3
        await this.persistJobFinishedResults({ // because they might be big
          jobId,
          results: change,
        });

        // don't await this, it's not critical
        this.appendToJobHistory({
          queue,
          jobId,
          value: change,
        });

        // if we are already finished, no change
        if (job.state === DockerJobState.Finished) {
          return {};
        }
        // all other states are allowed to be finished
        job = setJobStateFinished(job, {
          finished: change,
        });

        // NB: we store the finished state separate and pull it out when needed
        // because it's a large object, and we don't want to store it in deno kv
        delete job.finished; // this is added back by the clients or REST calls

        // get all queues this job is on
        const allQueues: Set<string> = new Set();
        const jobQueueNamespaces = this.kv.list<boolean>({
          prefix: ["job-queue-namespace", jobId],
        });
        for await (const entry of jobQueueNamespaces) {
          const queueEntry = entry.key[2]! as string;
          allQueues.add(queueEntry);
        }

        // update all the queues this job is on
        for await (const oneOfAllQueues of allQueues) {
          await this.kv.set(["queue", oneOfAllQueues, jobId], job, {
            expireIn: JobDataCacheDurationMilliseconds,
          });
        }
        return { updatedInMemoryJob: job };
      }

      // this job set back into queued state
      // RUNNING -> QUEUED
      case DockerJobFinishedReason.WorkerLost: {
        // get all queues this job is on
        const allQueues: Set<string> = new Set();
        const jobQueueNamespaces = this.kv.list<boolean>({
          prefix: ["job-queue-namespace", jobId],
        });
        for await (const entry of jobQueueNamespaces) {
          const queueEntry = entry.key[2]! as string;
          allQueues.add(queueEntry);
        }

        job = setJobStateQueued(job, { time: change.time });

        // update all the queues this job is on
        for await (const oneOfAllQueues of allQueues) {
          await this.kv.set(["queue", oneOfAllQueues, jobId], job, {
            expireIn: JobDataCacheDurationMilliseconds,
          });
          // don't await this, it's not critical
          this.appendToJobHistory({
            queue,
            jobId,
            value: change,
          });
        }

        return { updatedInMemoryJob: job };
      }
      // these reasons: delete this version of the job by queue+namespace
      // RUNNING -> REMOVED for some and FINISHED for others
      case DockerJobFinishedReason.Cancelled:
      case DockerJobFinishedReason.Deleted:
      case DockerJobFinishedReason.JobReplacedByClient: { // ? JobReplacedByClient === Cancelled everywhere?
        // always remove namespaces, this way we can maybe
        // actually remove traces of the job
        let currentNamespaces: string[] | undefined;
        // If the job is not in any namespaces now, it's safe to
        // set as finished
        currentNamespaces = await this.queueJobGetNamespaces({ queue, jobId });

        // are we already removed, and other namespaces exist? if so, we don't do much
        if (
          !applyToAllNamespaces && namespaceChange !== DefaultNamespace && currentNamespaces.length > 1 &&
          !currentNamespaces.includes(namespaceChange)
        ) {
          if (!job.namespaces.includes(namespaceChange)) {
            // this job already has this namespace removed, so this is a no-op
            return {};
          }
          // otherwise just update the namespaces, not the state
          job = {
            ...job,
            namespaces: currentNamespaces,
          };
          return { updatedInMemoryJob: job };
        }

        if (applyToAllNamespaces) {
          // remove all namespaces
          for (const namespaceToRemove of currentNamespaces) {
            // jobs always stay in the default namespace
            if (namespaceToRemove === DefaultNamespace) {
              continue;
            }
            await this.queueJobRemoveNamespace({
              queue,
              jobId,
              namespace: namespaceToRemove,
            });
          }
          // jobs always stay in the default namespace
        } else if (
          namespaceChange !== DefaultNamespace ||
          (namespaceChange === DefaultNamespace && currentNamespaces.length === 1)
        ) {
          // remove the namespace
          await this.queueJobRemoveNamespace({
            queue,
            jobId,
            namespace: namespaceChange,
          });
        }
        // this should not happen
        currentNamespaces = currentNamespaces.filter((namespace) => namespace !== "*");
        job = {
          ...job,
          namespaces: currentNamespaces,
        };

        // if there are no more namespaces, or if the argument namespace is the only one left
        // we can apply the finished state change
        let canTheInputNamespaceBeAppliedToTheInMemoryJob = applyToAllNamespaces ||
          currentNamespaces.length === 0 || (currentNamespaces.length === 1 &&
            (currentNamespaces[0] === DefaultNamespace || currentNamespaces[0] === namespaceChange));

        if (canTheInputNamespaceBeAppliedToTheInMemoryJob) {
          if (
            change.reason === DockerJobFinishedReason.Cancelled ||
            change.reason === DockerJobFinishedReason.JobReplacedByClient
          ) {
            switch (job.state) {
              case DockerJobState.Finished: {
                switch (job.finishedReason) {
                  case DockerJobFinishedReason.Success:
                  case DockerJobFinishedReason.Error:
                  case DockerJobFinishedReason.TimedOut: {
                    canTheInputNamespaceBeAppliedToTheInMemoryJob = false;
                    break;
                  }
                  default:
                    break;
                }
                break;
              }
              case DockerJobState.Queued:
              case DockerJobState.Running:
                break;
              case DockerJobState.Removed: {
                canTheInputNamespaceBeAppliedToTheInMemoryJob = false;
                break;
              }
              default:
                break;
            }
          }
        }

        if (canTheInputNamespaceBeAppliedToTheInMemoryJob) {
          job = setJobStateFinished(job, {
            finished: change,
          });
          await this.kv.set(["queue", queue, jobId], job, {
            expireIn: JobDataCacheDurationMilliseconds,
          });
          // TODO: this doesn't actually apply
          // don't await this, it's not critical

          if (change.reason === DockerJobFinishedReason.Deleted) {
            await this.deleteJobFinishedResults({ jobId });
            await this.deleteJobHistory({ queue, jobId });
            // TODO: delete all the config, intput, outputs, etc
          } else {
            this.appendToJobHistory({
              queue,
              jobId,
              value: change,
            });
          }
          return { updatedInMemoryJob: job };
        } else {
          // this job has NOT been modified except for the namespaces
          await this.kv.set(["queue", queue, jobId], job, {
            expireIn: JobDataCacheDurationMilliseconds,
          });
          // but if it IS in other namespaces, we leave the job in the queue,
          // but with the namespaces updated
          return { updatedInMemoryJob: job };
        }
      }
      default:
        console.log(`💥💥💥 Unknown finished reason: ${change.reason}`);
        return { updatedInMemoryJob: job };
    }
  }

  // Sets this job running on every queue it is on
  async setJobRunning(args: {
    time: number;
    worker: string;
    jobId: string;
  }) {
    const { worker, time, jobId } = args;

    // get all job queues and namespaces for this job and update all the histories
    // ["job-queue-namespace", jobId, queue, namespace]
    const entries = this.kv.list<boolean>({
      prefix: ["job-queue-namespace", jobId],
    });

    const runningStateChange: StateChangeValueRunning = {
      type: DockerJobState.Running,
      time,
      worker,
    };

    const queueDone = new Set<string>();

    for await (const entry of entries) {
      const jobId = entry.key[1]! as string;
      const queue = entry.key[2]! as string;

      if (queueDone.has(queue)) {
        continue;
      }
      queueDone.add(queue);

      let job = await this.queueJobGet({ queue, jobId });
      if (!job) {
        continue;
      }

      if (job.state === DockerJobState.Finished) {
        console.log(`${getJobColorizedString(jobId)} setJobRunning but job is finished, skipping`);
        continue;
      }

      job = setJobStateRunning(job, { worker, time });

      await this.kv.set(["queue", queue, jobId], job, {
        expireIn: JobDataCacheDurationMilliseconds,
      });

      // don't await this, it's not critical
      this.appendToJobHistory({
        queue,
        jobId,
        value: runningStateChange,
      });
    }
  }

  // Sets this job running on every queue it is on
  // async setJobRequeued(args: {
  //   queue: string;
  //   change: StateChangeValueReQueued;
  //   jobId: string;
  // }) {
  //   const { change, jobId, queue } = args;

  //   let job = await this.queueJobGet({ queue, jobId });
  //   if (!job) {
  //     return;
  //   }

  //   job = setJobStateQueued(job, { time: change.time });

  //   await this.kv.set(["queue", queue, jobId], job, {
  //     expireIn: JobDataCacheDurationMilliseconds,
  //   });

  //   await this.appendToJobHistory({
  //     queue,
  //     jobId,
  //     value: change,
  //   });
  // }

  async getJobHistory(config: {
    queue: string;
    jobId: string;
  }): Promise<StateChangeValue[]> {
    const { queue, jobId } = config;
    const key = ["job-queue-history", queue, jobId];
    const currentList = await this.kv.get<StateChangeValue[]>(key);
    return currentList.value || [];
  }

  async deleteJobHistory(config: {
    queue: string;
    jobId: string;
  }): Promise<void> {
    const { queue, jobId } = config;
    const key = ["job-queue-history", queue, jobId];
    await this.kv.delete(key);
  }

  async appendToJobHistory(config: {
    queue: string;
    jobId: string;
    value: StateChangeValue;
  }) {
    let { queue, jobId, value } = config;
    const functionToMaybeRetry = async (): Promise<void> => {
      const key = ["job-queue-history", queue, jobId];

      if (value.type === DockerJobState.Finished) {
        value = {
          ...value,
        };
        // this can be large, and it's stored in s3
        delete (value as StateChangeValueFinished).result;
      }

      // Initial list (or get an existing one)
      const currentListFromDb = await this.kv.get<StateChangeValue[]>(key);
      const currentList = currentListFromDb.value || [];

      const result = await this.kv
        .atomic()
        // Check if the list hasn't been modified since we read it
        .check(currentListFromDb?.value ? currentListFromDb : { key, versionstamp: null })
        // Append the new item
        .set(key, [...currentList, value])
        .commit();

      if (!result.ok) {
        console.error("Failed to append item to list: optimistic lock failed");
        // Optionally implement retry logic or handle the conflict
      }
    };

    // try to do this 3 times, if it fails, throw an error.
    await retryAsync(functionToMaybeRetry, {
      maxTry: 3,
      delay: 1000,
    });
  }

  // async jobGet(id: string): Promise<InMemoryDockerJob | null> {
  //   try {
  //     const entry = await this.kv.get<InMemoryDockerJob>([
  //       "job",
  //       id,
  //     ]);
  //     return entry.value;
  //   } catch (err) {
  //     console.error(`Error in jobGet for job ${id}:`, err);
  //     throw err;
  //   }
  // }

  /**
   * No namespace? remove all namespaces
   * @param args
   */
  async queueJobRemove(
    args: { queue: string; namespace?: string; jobId: string },
  ): Promise<void> {
    const { queue, namespace, jobId } = args;
    // we don't need to delete the job definition, since it will expire anyway,
    // and some deletion tasks rely on referencing the original definition
    // if there is a namespace, we need to delete the namespace,
    // and conditionally delete the queue job only if there are no other namespaces
    // Also we don't delete default namespace jobs
    if (namespace && namespace !== DefaultNamespace) {
      await this.kv
        .atomic()
        .delete(["job-queue-namespace", jobId, queue, namespace])
        // probably don't actually delete "queue-job-namespace-control" since its stores callbacks
        // for job events, so other systems can track e.g. user + compute resources
        // .delete(["queue-job-namespace-control", queue, jobId, namespace])
        .commit();

      const namespaces = await this.queueJobGetNamespaces({ queue, jobId });
      if (namespaces.length === 0 || (namespaces.length === 1 && namespaces[0] === namespace)) {
        await this.kv.delete(["queue", queue, jobId]);
      }
    } else {
      const entries = this.kv.list<boolean>({
        prefix: ["job-queue-namespace", jobId, queue],
      });
      for await (const entry of entries) {
        const namespace = entry.key[3] as string;
        await this.kv
          .atomic()
          .delete(["job-queue-namespace", jobId, queue, namespace])
          // probably don't actually delete "queue-job-namespace-control" see above similar comment
          // .delete(["queue-job-namespace-control", queue, jobId, namespace])
          .commit();
      }
      await this.kv.delete(["queue", queue, jobId]);
    }
  }

  async queueGetAll(queue: string): Promise<Record<string, InMemoryDockerJob>> {
    try {
      const entries = this.kv.list<InMemoryDockerJob>({
        prefix: ["queue", queue],
      });
      const results: Record<string, InMemoryDockerJob> = {};
      for await (const entry of entries) {
        const jobId = entry.key[2] as string;
        results[jobId] = entry.value;
      }
      return results;
    } catch (err) {
      console.error(`Error in queueGetAll for queue ${queue}:`, err);
      throw err;
    }
  }

  async queueGetJobs(queue: string): Promise<Record<string, InMemoryDockerJob>> {
    const entries = this.kv.list<InMemoryDockerJob>({
      prefix: ["queue", queue],
    });
    const results: Record<string, InMemoryDockerJob> = {};
    for await (const entry of entries) {
      const jobId = entry.key[2] as string;
      const job = entry.value as InMemoryDockerJob;
      const namespaces = await this.queueJobGetNamespaces({ queue, jobId });
      job.namespaces = namespaces;
      results[jobId] = job;
    }
    return results;
  }

  async queueGetCount(queue: string): Promise<number> {
    const entries = this.kv.list<InMemoryDockerJob>({
      prefix: ["queue", queue],
    });
    let count = 0;
    for await (const _ of entries) {
      count++;
    }
    return count;
  }
}
