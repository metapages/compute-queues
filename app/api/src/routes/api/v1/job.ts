import { db } from "/@/db/db.ts";
import type { Context } from "hono";

export const getJobHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");
    if (!jobId) {
      c.status(404);
      return c.json({ error: "No job provided" });
    }
    const queue: string | undefined = c.req.param("queue");
    if (!queue) {
      c.status(404);
      return c.json({ error: "No queue provided" });
    }

    const job = await db.queueJobGet({ queue, jobId });
    if (!job) {
      c.status(404);
      return c.json({ error: "Job not found" });
    }

    return c.json(job);
  } catch (err) {
    console.error("Error getting job", err);
    return c.text((err as Error).message, 500);
  }
};
