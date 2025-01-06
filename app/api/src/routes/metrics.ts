import type { Context } from "hono";

import { DB } from "@metapages/compute-queues-shared";

const db = await DB.initialize();

export const metricsHandler = async (c: Context) => {
  const queue: string | undefined = c.req.param("queue");

  if (!queue) {
    c.status(400);
    return c.text("Missing queue");
  }

  const count = await db.queueGetCount(queue);

  try {
    // Simple Prometheus-compatible metric response
    const response = `
# HELP queue_length The number of outstanding jobs in the queue
# TYPE queue_length gauge
queue_length ${count}
`;

    return new Response(response, {
      status: 200,
      headers: {
        "content-type": "text/plain",
      },
    });
  } catch (e) {
    console.error(`Error processing jobs data for metrics: ${e}`);
    return new Response("Error processing jobs data for metrics", {
      status: 500,
    });
  }
};
