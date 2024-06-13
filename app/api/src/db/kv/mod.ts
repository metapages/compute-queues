import { ms } from 'https://deno.land/x/ms@v0.1.0/ms.ts';

import {
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
        const res = await kv.atomic()
        // .check({ key, versionstamp: null }) // `null` versionstamps mean 'no value'
            .set(["queue", queue, id], job, { expireIn: expireIn1Week })
            // .set(["queue", "job", id], job, { expireIn: expireIn1Week })
            .commit();
        
        // await kv.set(["queue", "job", id], job, { expireIn: expireIn1Week });

        // await kv.set(["queue", name, id], {...denoKvValue, claimed: !!thing }, { expireIn: expireIn4Seconds });
        // queueJobAddStatement.run({ queue, id: `${queue}-${job.hash}`, hash: job.hash, created_at: new Date().getTime(), job: JSON.stringify(job) });
    }

    async queueJobUpdate(queue: string, job: DockerJobDefinitionRow): Promise<void> {
        const id = job.hash;
        await kv.set(["queue", queue, id], job)
        // queueJobUpdateStatement.run({ id: `${queue}-${job.hash}`, job: JSON.stringify(job) });
    }

    async queueJobRemove(queue: string, hash: string): Promise<void> {
        const id = hash;
        await kv.delete(["queue", queue, id])
        // queueJobRemoveStatement.run({ id: `${queue}-${hash}` });
    }

    async queueGetAll(queue: string): Promise<DockerJobDefinitionRow[]> {

        const entries = kv.list<DockerJobDefinitionRow>({ prefix: ["queue", queue] });
        const results : DockerJobDefinitionRow[] = [];
        for await (const entry of entries) {
            // console.log(entry.key); // ["preferences", "ada"]
            // console.log(entry.value); // { ... }
            // console.log(entry.versionstamp); // "00000000000000010000"
            results.push(entry.value);
        }
        return results;

        // const results = getQueueStatement.all({ queue }) as { id: string, job: string, created_at: number }[];
        // return results.map(v => JSON.parse(v.job));
    }

    async resultCacheAdd(id: string, result: StateChangeValueWorkerFinished): Promise<void> {
        await kv.set(["cache", id], result)
        // insertJobResultIntoCacheStatement.run({ id, created_at: new Date().getTime(), result: JSON.stringify(result) });
    }

    async resultCacheGet(id: string): Promise<StateChangeValueWorkerFinished | undefined> {
        const row = (await kv.get(["cache", id])).value as StateChangeValueWorkerFinished;
        return row;
        // const row = resultCacheGetStatement.get(id) as { id: string, created_at: number, result: string };
        // if (row) {
        //     return JSON.parse(row.result);
        // }
    }

    async resultCacheRemove(id: string): Promise<void | undefined> {
        await kv.delete(["cache", id])
        // removeJobResultsFromCacheStatement.get(id);
    }
}

export const db = new DB();
