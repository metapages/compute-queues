import type { Context } from "hono";

import {
  type DockerApiCopyJobToQueuePayload,
  type DockerJobDefinitionRow,
  DockerJobState,
  type StateChange,
  type StateChangeValueQueued,
} from "@metapages/compute-queues-shared";
import { getApiDockerJobQueue } from "/@/routes/websocket.ts";
import { db } from "/@/db/db.ts";

export const copyJobToQueueHandler = async (c: Context) => {
  try {
    const post = await c.req.json<DockerApiCopyJobToQueuePayload>();
    const { jobId, queue, namespace, control } = post;

    const existingJob: DockerJobDefinitionRow | null = await db.jobGet(jobId);

    if (!existingJob) {
      c.status(404);
      return c.json({ error: "Job not found" });
    }

    const jobQueue = await getApiDockerJobQueue(queue);

    const stateChangeValue: StateChangeValueQueued = {
      definition:
        (existingJob.history[0].value as StateChangeValueQueued).definition,
      time: Date.now(),
      debug: false,
      namespace,
      control,
    };
    const stateChange: StateChange = {
      job: jobId,
      tag: "",
      state: DockerJobState.Queued,
      value: stateChangeValue,
    };

    await jobQueue.stateChange(stateChange);

    c.status(200);
    return c.json({ success: true });
  } catch (err) {
    console.error("Error downloading file:", err);
    return c.text((err as Error).message, 500);
  }
};
