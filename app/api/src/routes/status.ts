import { Context } from 'https://deno.land/x/hono@v4.1.0-rc.1/mod.ts';

import { userJobQueues } from '../docker-jobs/ApiDockerJobQueue.ts';

export const statusHandler = async (c: Context) => {
  const queue: string | undefined = c.req.param("queue");

  if (!queue) {
    c.status(400);
    return c.text("Missing queue");
  }

  const dockerQueue = userJobQueues[queue];

  if (!dockerQueue) {
    c.status(400);
    return c.json({
      queue: null,
    });
  }

  const response = await dockerQueue.status();

  return c.json(response);
};
