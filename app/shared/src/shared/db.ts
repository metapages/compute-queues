import { getKv } from "/@/shared/kv.ts";
import {
  type DataRef,
  DataRefType,
  type DockerJobDefinitionRow,
  type StateChangeValueQueued,
} from "/@/shared/types.ts";
import { addJobProcessSubmissionWebhook } from "/@/shared/webhooks.ts";
import { ms } from "ms";
import { ensureDir } from "std/fs";
import { join } from "std/path";

const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");

let deleteFromS3: (key: string) => Promise<void>;
let putJsonToS3: (key: string, data: unknown) => Promise<DataRef>;
let resolveDataRefFromS3: <T>(ref: DataRef<T>) => Promise<T | undefined>;

const expireIn1Week = ms("1 week") as number;

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
      await ensureDir(join(effectiveDataDirectory, "queue"));
      await Deno.chmod(join(effectiveDataDirectory, "queue"), 0o777);
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
      ({ deleteFromS3, putJsonToS3, resolveDataRefFromS3 } = await import(
        "/@/shared/s3.ts"
      ));
    } else {
      deleteFromS3 = async (key: string): Promise<void> => {
        const filePath = join(dataDirectory, "queue", key);
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

      putJsonToS3 = async (key: string, data: unknown): Promise<DataRef> => {
        const filePath = join(dataDirectory, "queue", key);
        try {
          const jsonData = JSON.stringify(data);
          await Deno.writeTextFile(filePath, jsonData, { mode: 0o777 });
          return {
            type: DataRefType.key,
            value: key,
          };
        } catch (error) {
          console.error(`Error writing file ${filePath}:`, error);
          throw error;
        }
      };

      resolveDataRefFromS3 = async <T>(
        ref: DataRef<T>,
      ): Promise<T | undefined> => {
        if (ref.type !== DataRefType.key || typeof ref.value !== "string") {
          console.error("Invalid DataRef:", ref);
          return undefined;
        }
        const filePath = join(dataDirectory, "queue", ref.value);
        try {
          const jsonData = await Deno.readTextFile(filePath);
          return JSON.parse(jsonData) as T;
        } catch (error) {
          if (error instanceof Deno.errors.NotFound) {
            console.error(`File not found: ${filePath}`);
          } else {
            console.error(`Error reading file ${filePath}:`, error);
          }
          return undefined;
        }
      };
    }
  }

  // ... rest of the DB class methods ...

  // (The remaining methods of the DB class can remain unchanged)
  async queueJobAdd(queue: string, job: DockerJobDefinitionRow): Promise<void> {
    try {
      // console.log(`queueJobAdd ${queue} [${job.hash.substring(0, 6)}]`);
      const id = job.hash;
      // console.log(
      //   `queueJobAdd ${queue} [${job.hash.substring(0, 6)}] pushing to s3`,
      // );
      // ❗❗❗❗ remove the userspace config from the job before storing it in s3
      let control = (job.history[0].value as StateChangeValueQueued)?.control;
      if (control) {
        delete (job.history[0].value as StateChangeValueQueued)?.control;
      }
      control = control || {};
      control.queueHistory = control.queueHistory || [];
      control.queueHistory.push(queue);
      const namespace =
        (job.history[0].value as StateChangeValueQueued)?.namespace || "_";

      const dataRef = await putJsonToS3(id, job);
      // console.log(
      //   `queueJobAdd ${queue} [${
      //     job.hash.substring(
      //       0,
      //       6,
      //     )
      //   }] pushing to s3 DONE, adding to job/queue kv`,
      // );
      await this.kv
        .atomic()
        .set(["job", id], dataRef, { expireIn: expireIn1Week })
        // TODO: do not need the dataref stored twice, just need the id
        .set(["queue", queue, id], dataRef, {
          expireIn: expireIn1Week,
        })
        // Jobs on the same queue and the same namespace conflict, only one can run
        .set(["queue-namespace-job", queue, namespace, id], true, {
          expireIn: expireIn1Week,
        })
        // .set(["job-namespace", queue, id], dataRef, {
        //   expireIn: expireIn1Week,
        // })
        .commit();

      // console.log(
      //   `queueJobAdd ${queue} [${
      //     job.hash.substring(
      //       0,
      //       6,
      //     )
      //   }] adding to job/queue kv DONE, checking control...`,
      // );

      // console.log(
      //   `queueJobAdd ${queue} [${id.substring(0, 6)}] control`,
      //   control,
      // );

      if (control) {
        // partition jobs that might be shared by the same namespace
        await this.kv.set(["job-namespace-control", id, namespace], control, {
          expireIn: expireIn1Week,
        });
        await addJobProcessSubmissionWebhook({
          queue,
          namespace,
          jobId: id,
          control,
        });
      }
    } catch (err) {
      console.error(
        `💥💥💥 ERROR adding job to queue ${queue} [${
          job.hash.substring(
            0,
            6,
          )
        }]`,
        err,
      );
      throw err;
    }
  }

  async queueJobGet(
    queue: string,
    id: string,
  ): Promise<DockerJobDefinitionRow | null> {
    try {
      const entry = await this.kv.get<DataRef<DockerJobDefinitionRow>>([
        "job",
        queue,
        id,
      ]);
      const jobDataRef: DataRef<DockerJobDefinitionRow> | null = entry.value;
      if (!jobDataRef) {
        return null;
      }
      if (jobDataRef?.type === DataRefType.key) {
        try {
          const job: DockerJobDefinitionRow | undefined =
            await resolveDataRefFromS3(jobDataRef);
          return job || null;
        } catch (s3Error) {
          console.error(
            `Failed to resolve job data from S3 for queue ${queue}, job ${id}:`,
            s3Error,
          );
          // Return null instead of throwing to allow graceful degradation
          return null;
        }
      }
      return null;
    } catch (err) {
      console.error(`Error in queueJobGet for queue ${queue}, job ${id}:`, err);
      throw err;
    }
  }

  async jobGet(
    id: string,
  ): Promise<DockerJobDefinitionRow | null> {
    try {
      const entry = await this.kv.get<DataRef<DockerJobDefinitionRow>>([
        "job",
        id,
      ]);
      const jobDataRef: DataRef<DockerJobDefinitionRow> | null = entry.value;
      if (!jobDataRef) {
        return null;
      }
      if (jobDataRef?.type === DataRefType.key) {
        try {
          const job: DockerJobDefinitionRow | undefined =
            await resolveDataRefFromS3(jobDataRef);
          return job || null;
        } catch (s3Error) {
          console.error(
            `Failed to resolve job data from S3 for job ${id}:`,
            s3Error,
          );
          // Return null instead of throwing to allow graceful degradation
          return null;
        }
      }
      return null;
    } catch (err) {
      console.error(`Error in jobGet for job ${id}:`, err);
      throw err;
    }
  }

  async queueJobUpdate(
    queue: string,
    job: DockerJobDefinitionRow,
  ): Promise<void> {
    const id = job.hash;
    const dataRef = await putJsonToS3(id, job);
    await this.kv.set(["queue", queue, id], dataRef, {
      expireIn: expireIn1Week,
    });
  }

  async queueJobRemove(queue: string, hash: string): Promise<void> {
    const id = hash;
    await this.kv.delete(["queue", queue, id]);
  }

  async queueGetAll(queue: string): Promise<DockerJobDefinitionRow[]> {
    try {
      const entries = this.kv.list<DataRef<DockerJobDefinitionRow>>({
        prefix: ["queue", queue],
      });
      const results: DockerJobDefinitionRow[] = [];
      for await (const entry of entries) {
        const jobDataRef:
          | DataRef<DockerJobDefinitionRow>
          | DockerJobDefinitionRow = entry.value;
        if (
          (jobDataRef as DataRef<DockerJobDefinitionRow> | undefined)?.type ===
            DataRefType.key
        ) {
          try {
            const job: DockerJobDefinitionRow | undefined =
              await resolveDataRefFromS3(jobDataRef);
            if (job) {
              results.push(job);
            }
          } catch (s3Error) {
            console.error(
              `Failed to resolve job data from S3 for queue ${queue}, job ${entry
                .key[entry.key.length - 1] as string}:`,
              s3Error,
            );
            // Continue processing other jobs even if this one fails
            continue;
          }
        }
      }
      return results;
    } catch (err) {
      console.error(`Error in queueGetAll for queue ${queue}:`, err);
      throw err;
    }
  }

  async queueGetJobIds(queue: string): Promise<string[]> {
    const entries = this.kv.list<DataRef<DockerJobDefinitionRow>>({
      prefix: ["queue", queue],
    });
    const results: string[] = [];
    for await (const entry of entries) {
      console.log(entry.key);
      results.push(entry.key[entry.key.length - 1] as string);
    }
    return results;
  }

  async queueGetCount(queue: string): Promise<number> {
    const entries = this.kv.list<DataRef<DockerJobDefinitionRow>>({
      prefix: ["queue", queue],
    });
    let count = 0;
    for await (const _ of entries) {
      count++;
    }
    return count;
  }

  async resultCacheAdd(
    id: string,
    result: DockerJobDefinitionRow,
  ): Promise<void> {
    const dataRef = await putJsonToS3(id, result);
    await this.kv.set(["cache", id], dataRef, { expireIn: expireIn1Week });
  }

  async resultCacheGet(
    id: string,
  ): Promise<DockerJobDefinitionRow | undefined> {
    try {
      const cachedValueRefBlob = await this.kv.get<
        DataRef<DockerJobDefinitionRow>
      >(["cache", id]);
      const cachedValueRef: DataRef<DockerJobDefinitionRow> | null =
        cachedValueRefBlob?.value;
      if (!cachedValueRef || !cachedValueRef?.value) {
        return;
      }
      try {
        const job: DockerJobDefinitionRow | undefined =
          await resolveDataRefFromS3<
            DockerJobDefinitionRow
          >(cachedValueRef);
        return job?.history ? job : undefined;
      } catch (s3Error) {
        console.error(
          `Failed to resolve cached result from S3 for id ${id}:`,
          s3Error,
        );
        // Return undefined instead of throwing to allow graceful degradation
        return undefined;
      }
    } catch (err) {
      console.error(`Error in resultCacheGet for id ${id}:`, err);
      throw err;
    }
  }

  async resultCacheRemove(id: string): Promise<void> {
    await Promise.all([this.kv.delete(["cache", id]), deleteFromS3(id)]);
  }
}
