import { db } from "/@/db/db.ts";
import type { Context } from "hono";

import {
  DockerJobFinishedReason,
  DockerJobState,
  type StateChange,
} from "@metapages/compute-queues-shared";

import { getApiDockerJobQueue } from "../../websocket.ts";

export const cancelJobHandler = async (c: Context) => {
  try {
    const jobId: string | undefined = c.req.param("jobId");
    const queue: string | undefined = c.req.param("queue");
    if (!jobId) {
      c.status(404);
      return c.json({ error: "No job provided" });
    }
    if (!queue) {
      c.status(404);
      return c.json({ error: "No queue provided" });
    }

    const jobQueue = await getApiDockerJobQueue(queue);

    const stateChange: StateChange = {
      job: jobId,
      tag: "api",
      state: DockerJobState.Finished,
      value: {
        reason: DockerJobFinishedReason.Cancelled,
        time: Date.now(),
      },
    };

    await jobQueue.stateChange(stateChange);
    c.status(200);
    // TODO: this should be part of the above stateChange operation.
    await db.queueJobRemove(queue, jobId);
    return c.json({ success: true, jobId });
  } catch (err) {
    console.error("Error getting job", err);
    return c.text((err as Error).message, 500);
  }
};
