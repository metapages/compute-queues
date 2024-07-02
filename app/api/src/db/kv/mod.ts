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

// https://help.glitch.com/hc/en-us/articles/16287582103821-Do-you-have-built-in-persistence-or-a-database-
// const DATABASE_DIRECTORY :string = path.resolve(envVar.get('DATABASE_DIRECTORY').default("../../.data/").asString());// local: /app/.data/jobs.db
// fse.ensureDirSync(DATABASE_DIRECTORY);
// const JOBS_DB_FILE = path.join(DATABASE_DIRECTORY, "jobs.db");
// console.log('path.dirname(JOBS_DB_FILE)', path.dirname(JOBS_DB_FILE));
// const sqllite = new BetterSqlite3(JOBS_DB_FILE, { verbose: console.log });

// // TODO: add job result to cache, if successful
// // finished is serialized StateChangeValueWorkerFinished
// const createTables = () => {
//     const schema = `
//     CREATE TABLE IF NOT EXISTS cache (
//         id text NOT NULL PRIMARY KEY,
//         result text NOT NULL,
//         created_at REAL
//     );
//     CREATE TABLE IF NOT EXISTS queue (
//         id text NOT NULL PRIMARY KEY,
//         queue text NOT NULL,
//         hash text NOT NULL,
//         job text NOT NULL,
//         created_at REAL
//     );
//     `
//     sqllite.exec(schema);
// }
// console.log('1️⃣ 2️⃣  setupDB')
// createTables();

// save job results into persistent local storage. it expires after one week (not yet implemented).
// const insertJobResultIntoCacheStatement = sqllite.prepare('INSERT INTO cache (id, result, created_at) VALUES (@id, @result, @created_at) ON CONFLICT(id) DO UPDATE SET result=@result');
// const resultCacheGetStatement = sqllite.prepare('SELECT id, result, created_at FROM cache WHERE id=?');
// const removeJobResultsFromCacheStatement = sqllite.prepare('DELETE FROM cache WHERE id = ?');
// // queue, persisted only to allow ephemeral state restore on server start/restart
// const queueJobAddStatement = sqllite.prepare('INSERT INTO queue (id, hash, queue, job, created_at) VALUES (@id, @queue, @hash, @job, @created_at) ON CONFLICT(id) DO UPDATE SET job=@job');
// const queueJobUpdateStatement = sqllite.prepare('UPDATE queue SET job=@job where id = @id');
// const queueJobRemoveStatement = sqllite.prepare('DELETE FROM queue where id = @id');
// const getQueueStatement = sqllite.prepare('SELECT * FROM queue where queue = @queue');

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
        
        // await kv.set(["queue", "job", id], job, { expireIn: expireIn1Week });

        // await kv.set(["queue", name, id], {...denoKvValue, claimed: !!thing }, { expireIn: expireIn4Seconds });
        // queueJobAddStatement.run({ queue, id: `${queue}-${job.hash}`, hash: job.hash, created_at: new Date().getTime(), job: JSON.stringify(job) });
    }

    async queueJobUpdate(queue: string, job: DockerJobDefinitionRow): Promise<void> {
        const id = job.hash;
        const dataRef = await putJsonToS3(id, job);
        await kv.set(["queue", queue, id], dataRef, { expireIn: expireIn1Week })
        // queueJobUpdateStatement.run({ id: `${queue}-${job.hash}`, job: JSON.stringify(job) });
    }

    async queueJobRemove(queue: string, hash: string): Promise<void> {
        const id = hash;
        // The job in s3 will be automatically pruned after some time
        await kv.delete(["queue", queue, id])
        // queueJobRemoveStatement.run({ id: `${queue}-${hash}` });
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

        // const results = getQueueStatement.all({ queue }) as { id: string, job: string, created_at: number }[];
        // return results.map(v => JSON.parse(v.job));
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
