import type { Context } from "hono";

import { db } from "/@/db/db.ts";

export const getJobIdsHandler = async (c: Context) => {
  try {
    const queue: string | undefined = c.req.param("queue");
    if (!queue) {
      c.status(404);
      return c.json({ error: "No queue specified" });
    }

    const jobIds = await db.queueGetJobIds(queue);

    return c.json({ success: true, jobIds });
  } catch (err) {
    console.error("Error getting job ids:", err);
    return c.text((err as Error).message, 500);
  }
};
