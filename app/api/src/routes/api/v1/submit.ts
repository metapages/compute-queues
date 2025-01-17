import type { Context } from "hono";

import {
  type DockerJobControlConfig,
  DockerJobState,
  shaDockerJob,
  type StateChange,
  type StateChangeValueQueued,
} from "@metapages/compute-queues-shared";
import { getApiDockerJobQueue } from "/@/routes/websocket.ts";

type Payload = {
  jobId: string;
  queue: string;
  namespace?: string;
  control?: DockerJobControlConfig;
};

export const submitJobToQueueHandler = async (c: Context) => {
  try {
    const queue: string | undefined = c.req.param("queue");
    if (!queue) {
      c.status(404);
      return c.json({ error: "No queue specified" });
    }
    const jobToQueue = await c.req.json<StateChangeValueQueued>();
    jobToQueue.control = jobToQueue.control || {};
    jobToQueue.control.queueHistory = jobToQueue.control.queueHistory || [];
    jobToQueue.control.queueHistory.push(queue);
    const jobId = await shaDockerJob(jobToQueue.definition);

    const jobQueue = await getApiDockerJobQueue(queue);

    const stateChange: StateChange = {
      job: jobId,
      tag: "",
      state: DockerJobState.Queued,
      value: jobToQueue,
    };

    // This needs to assume that a job submitted with a stateChange
    // like this will have an expectation of persistance
    await jobQueue.stateChange(stateChange);

    c.status(200);
    return c.json({ success: true, jobId });
  } catch (err) {
    console.error("Error submitting job:", err);
    return c.text((err as Error).message, 500);
  }
};
