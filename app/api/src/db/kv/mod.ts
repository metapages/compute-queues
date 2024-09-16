import { ms } from 'ms';

import {
  deleteFromS3,
  putJsonToS3,
  resolveDataRefFromS3,
} from '../../docker-jobs/job-s3.ts';
import {
  DataRef,
  DataRefType,
  DockerJobDefinitionRow,
} from '../../shared/mod.ts';
import { getKv } from './getKv.ts';

const kv = await getKv();

const expireIn1Week = ms("1 week") as number;

export class DB {
    constructor() { }

    async queueJobAdd(queue: string, job: DockerJobDefinitionRow): Promise<void> {
        // INSERT INTO queue (id, hash, queue, job, created_at) VALUES (@id, @queue, @hash, @job, @created_at) ON CONFLICT(id) DO UPDATE SET job=@job'
        const id = job.hash;
        // deno kv has a 64kb limit, so we store the job in s3, and store a reference to it in kv
        const dataRef = await putJsonToS3(id, job);
        const res = await kv.atomic()
        // .check({ key, versionstamp: null }) // `null` versionstamps mean 'no value'
            .set(["queue", queue, id], dataRef, { expireIn: expireIn1Week })
            // .set(["queue", "job", id], job, { expireIn: expireIn1Week })
            .commit();
    }

    // TODO: just store jobs in their own ids, not on a queue
    async queueJobGet(queue: string, id: string): Promise<DockerJobDefinitionRow | null> {
        const entry = await kv.get<DataRef<DockerJobDefinitionRow>>(["queue", queue, id])
        const jobDataRef :DataRef<DockerJobDefinitionRow> | null = entry.value;
        if (!jobDataRef) {
            return null;
        }
        if ((jobDataRef as any)?.type === DataRefType.key) {
            const job :DockerJobDefinitionRow | undefined = await resolveDataRefFromS3(jobDataRef as DataRef<DockerJobDefinitionRow>);
            return job || null;
        } else {
            return null;
        }
    }

    async queueJobUpdate(queue: string, job: DockerJobDefinitionRow): Promise<void> {
        const id = job.hash;
        const dataRef = await putJsonToS3(id, job);
        await kv.set(["queue", queue, id], dataRef, { expireIn: expireIn1Week })
    }

    async queueJobRemove(queue: string, hash: string): Promise<void> {
        const id = hash;
        // The job in s3 will be automatically pruned after some time
        await kv.delete(["queue", queue, id])
    }

    async queueGetAll(queue: string): Promise<DockerJobDefinitionRow[]> {

        const entries = kv.list<DataRef<DockerJobDefinitionRow>>({ prefix: ["queue", queue] });
        const results : DockerJobDefinitionRow[] = [];
        for await (const entry of entries) {
            // console.log(entry.key); // ["preferences", "ada"]
            // console.log(entry.value); // { ... }
            // console.log(entry.versionstamp); // "00000000000000010000"
            const jobDataRef :DataRef<DockerJobDefinitionRow> | DockerJobDefinitionRow = entry.value;
            if ((jobDataRef as any)?.type === DataRefType.key) {
                const job :DockerJobDefinitionRow | undefined = await resolveDataRefFromS3(jobDataRef as DataRef<DockerJobDefinitionRow>);
                if (job) {
                    results.push(job);
                }
            }
        }
        return results;
    }

    async resultCacheAdd(id: string, result: DockerJobDefinitionRow): Promise<void> {
        const dataRef = await putJsonToS3(id, result);
        await kv.set(["cache", id], dataRef, {expireIn: expireIn1Week});
    }

    async resultCacheGet(id: string): Promise<DockerJobDefinitionRow | undefined> {
        const cachedValueRefBlob = await kv.get<DataRef<DockerJobDefinitionRow>>(["cache", id]);
        const cachedValueRef :DataRef<DockerJobDefinitionRow> | null = cachedValueRefBlob?.value;
        if (!cachedValueRef || !cachedValueRef?.value) {
            return;
        }
        const job :DockerJobDefinitionRow | undefined = await resolveDataRefFromS3<DockerJobDefinitionRow>(cachedValueRef);
        return job?.history ? job : undefined;
    }

    /**
     * Deletes from all the caches
     * @param id hash of the job
     * @returns 
     */
    async resultCacheRemove(id: string): Promise<void> {
        await Promise.all([kv.delete(["cache", id]), deleteFromS3(id)]);
    }
}

export const db = new DB();
