import { db } from "/@/db/db.ts";
import type { Context } from "hono";

export const getJobResultHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");
    if (!jobId) {
      c.status(404);
      return c.json({ error: "No job provided" });
    }

    const results = await db.getJobFinishedResults(jobId);

    return c.json({ data: results || null });
  } catch (err) {
    console.error("Error getting results", err);
    return c.text((err as Error).message, 500);
  }
};
