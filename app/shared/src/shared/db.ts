import { ms } from "ms";
import {
  type DataRef,
  DataRefType,
  type DockerJobDefinitionRow,
} from "/@/shared/types.ts";
import { ensureDir } from "std/fs";
import { join } from "std/path";

const AWS_ENDPOINT = Deno.env.get("AWS_ENDPOINT");
const DENO_KV_URL = Deno.env.get("DENO_KV_URL");

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

    if (!AWS_ENDPOINT) {
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
    if (AWS_ENDPOINT) {
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
    const id = job.hash;
    const dataRef = await putJsonToS3(id, job);
    await this.kv.atomic()
      .set(["queue", queue, id], dataRef, { expireIn: expireIn1Week })
      .commit();
  }

  async queueJobGet(
    queue: string,
    id: string,
  ): Promise<DockerJobDefinitionRow | null> {
    const entry = await this.kv.get<DataRef<DockerJobDefinitionRow>>([
      "queue",
      queue,
      id,
    ]);
    const jobDataRef: DataRef<DockerJobDefinitionRow> | null = entry.value;
    if (!jobDataRef) {
      return null;
    }
    if (jobDataRef?.type === DataRefType.key) {
      const job: DockerJobDefinitionRow | undefined =
        await resolveDataRefFromS3(
          jobDataRef,
        );
      return job || null;
    }
    return null;
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
        const job: DockerJobDefinitionRow | undefined =
          await resolveDataRefFromS3(
            jobDataRef,
          );
        if (job) {
          results.push(job);
        }
      }
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
    const cachedValueRefBlob = await this.kv.get<
      DataRef<DockerJobDefinitionRow>
    >([
      "cache",
      id,
    ]);
    const cachedValueRef: DataRef<DockerJobDefinitionRow> | null =
      cachedValueRefBlob?.value;
    if (!cachedValueRef || !cachedValueRef?.value) {
      return;
    }
    const job: DockerJobDefinitionRow | undefined = await resolveDataRefFromS3<
      DockerJobDefinitionRow
    >(cachedValueRef);
    return job?.history ? job : undefined;
  }

  async resultCacheRemove(id: string): Promise<void> {
    await Promise.all([this.kv.delete(["cache", id]), deleteFromS3(id)]);
  }
}
let localkv: Deno.Kv | undefined = undefined;

const getKv = async (): Promise<Deno.Kv> => {
  if (localkv === undefined) {
    const thiskv = await Deno.openKv(DENO_KV_URL || undefined);
    if (localkv) {
      thiskv.close();
      return localkv;
    }
    localkv = thiskv;
    console.log(`🗝️  ✅ DenoKv Connected ${DENO_KV_URL || ""}`);
  }
  return localkv;
};
