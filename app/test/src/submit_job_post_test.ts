import { assert, assertEquals } from "std/assert";

import { createNewContainerJobMessage, fetchRobust } from "@metapages/compute-queues-shared";

import { createWebhookServer } from "./webhooks_test.ts";
import { closeKv } from "../../shared/src/shared/kv.ts";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

const fetch = fetchRobust;

Deno.test(
  "Submit a job via POST to the API",
  async () => {
    if (QUEUE_ID === "local") {
      return;
    }

    // Create a server to receive the webhook
    // then have a job that calls it on submission

    const port = Math.floor(Math.random() * (65535 - 1024) + 1024);

    const webhookPayload = {
      we: "are good",
    };

    const namespace = `test${Math.floor(Math.random() * 1000000)}`;

    const { jobId, queuedJob } = await createNewContainerJobMessage({
      definition: {
        image: "alpine:3.18.5",
        command: `echo ${Math.floor(Math.random() * 1000000)}`,
      },
      control: {
        namespace,
        callbacks: {
          queued: {
            url: `http://test:${port}/test`,
            payload: webhookPayload,
          },
        },
      },
    });

    // Create a promise that will resolve when the webhook is called
    const { promise: webhookCalled, resolve: webhookResolve } = Promise
      .withResolvers<void>();

    const { shutdown } = createWebhookServer({
      path: "/test",
      port,
      handler: async (req) => {
        // Resolve the promise when we get the expected payload
        const body: {
          jobId: string;
          queue: string;
          namespace?: string;
          config?: unknown;
        } = await req.json();
        assertEquals(body.config, webhookPayload);
        assertEquals(body.jobId, jobId);
        assertEquals(body.namespace, namespace);
        assertEquals(body.queue, QUEUE_ID);
        webhookResolve();
        return new Response("OK");
      },
      timeout: 12000,
    });

    // Submit the job via POST
    const response = await fetch(`${API_URL}/q/${QUEUE_ID}`, {
      method: "POST",
      body: JSON.stringify(queuedJob!.enqueued),
      headers: {
        "Content-Type": "application/json",
      },
    });
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.success, true);
    assert(body.jobId);

    await webhookCalled;
    await webhookCalled;
    await shutdown();
    closeKv();
  },
);
