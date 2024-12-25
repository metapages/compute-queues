import { ms } from "ms";
import {
  type DataRef,
  DataRefType,
  type DockerJobDefinitionRow,
} from "/@/shared/types.ts";
import {
  deleteFromS3,
  putJsonToS3,
  resolveDataRefFromS3,
} from "/@/shared/s3.ts";

const DENO_KV_URL = Deno.env.get("DENO_KV_URL");
let localkv: Deno.Kv | undefined = undefined;

const getKv = async (): Promise<Deno.Kv> => {
  if (localkv === undefined) {
    const thiskv = await Deno.openKv(DENO_KV_URL ? DENO_KV_URL : undefined);
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
