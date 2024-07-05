import { ms } from 'ms';

import {
  getJsonFromS3,
  putJsonToS3,
} from '../../docker-jobs/job-s3.ts';
import {
  DataRef,
  DataRefType,
  DockerJobDefinitionRow,
  StateChangeValueWorkerFinished,
} from '../../shared/mod.ts';
import { getKv } from './getKv.ts';

const kv = await getKv();

const expireIn1Week = ms("1 week") as number;

export class DB {
    constructor() { }

    async queueJobAdd(queue: string, job: DockerJobDefinitionRow): Promise<void> {
        // INSERT INTO queue (id, hash, queue, job, created_at) VALUES (@id, @queue, @hash, @job, @created_at) ON CONFLICT(id) DO UPDATE SET job=@job'
        const id = job.hash;
        const dataRef = await putJsonToS3(id, job);

        const res = await kv.atomic()
        // .check({ key, versionstamp: null }) // `null` versionstamps mean 'no value'
            .set(["queue", queue, id], dataRef, { expireIn: expireIn1Week })
            // .set(["queue", "job", id], job, { expireIn: expireIn1Week })
            .commit();
    }

    async queueJobGet(queue: string, id: string): Promise<DockerJobDefinitionRow | null> {
        const entry = await kv.get<DataRef<DockerJobDefinitionRow> | DockerJobDefinitionRow>(["queue", queue, id])
        const jobDataRef :DataRef<DockerJobDefinitionRow> | DockerJobDefinitionRow | null = entry.value;
        if (!jobDataRef) {
            return null;
        }
        if ((jobDataRef as any)?.type === DataRefType.key || (jobDataRef as any)?.type === "hash") {
            const job :DockerJobDefinitionRow = await getJsonFromS3(jobDataRef as DataRef<DockerJobDefinitionRow>);
            return job;
        } else {
            return jobDataRef as DockerJobDefinitionRow;
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
            if ((jobDataRef as any)?.type === DataRefType.key || (jobDataRef as any)?.type === "hash") {
                const job :DockerJobDefinitionRow = await getJsonFromS3(jobDataRef as DataRef<DockerJobDefinitionRow>);
                results.push(job);
            } else {
                results.push((jobDataRef as any) as DockerJobDefinitionRow);
            }
            
        }
        return results;
    }

    async resultCacheAdd(id: string, result: StateChangeValueWorkerFinished): Promise<void> {
        await kv.set(["cache", id], result, {expireIn: expireIn1Week});
    }

    async resultCacheGet(id: string): Promise<StateChangeValueWorkerFinished | undefined> {
        const row = (await kv.get(["cache", id])).value as StateChangeValueWorkerFinished;
        return row;
    }

    async resultCacheRemove(id: string): Promise<void | undefined> {
        await kv.delete(["cache", id])
    }
}

export const db = new DB();
