import { ms } from "ms";
import {
  type DataRef,
  DataRefType,
  type DockerJobDefinitionRow,
} from "/@/shared/types.ts";
import { ensureDir } from "std/fs";
import { join } from "std/path";

const AWS_ENDPOINT = Deno.env.get("AWS_ENDPOINT");

let deleteFromS3: (key: string) => Promise<void>;
let putJsonToS3: (key: string, data: unknown) => Promise<DataRef>;
let resolveDataRefFromS3: <T>(ref: DataRef<T>) => Promise<T | undefined>;

// Set the temporary directory path
const TMPDIR = "/tmp/worker-metapage-io";

if (AWS_ENDPOINT) {
  // Import S3 functions
  ({ deleteFromS3, putJsonToS3, resolveDataRefFromS3 } = await import(
    "/@/shared/s3.ts"
  ));
} else {
  // Provide local filesystem functions using TMPDIR

  // Ensure the TMPDIR exists
  await ensureDir(TMPDIR);
  await Deno.chmod(TMPDIR, 0o777);
  await ensureDir(join(TMPDIR, "queue"));
  await Deno.chmod(join(TMPDIR, "queue"), 0o777);
  deleteFromS3 = async (key: string): Promise<void> => {
    const filePath = join(TMPDIR, "queue", key);
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
    const filePath = join(TMPDIR, "queue", key);
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

  resolveDataRefFromS3 = async <T>(ref: DataRef<T>): Promise<T | undefined> => {
    if (ref.type !== DataRefType.key || typeof ref.value !== "string") {
      console.error("Invalid DataRef:", ref);
      return undefined;
    }
    const filePath = join(TMPDIR, "queue", ref.value);
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

const DENO_KV_URL = Deno.env.get("DENO_KV_URL");
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

const expireIn1Week = ms("1 week") as number;

export class DB {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  static async initialize(): Promise<DB> {
    const kv = await getKv();
    return new DB(kv);
  }

  async queueJobAdd(queue: string, job: DockerJobDefinitionRow): Promise<void> {
    const id = job.hash;
    // deno kv has a 64kb limit, so we store the job in s3, and store a reference to it in kv
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

export const db: DB = await DB.initialize();
