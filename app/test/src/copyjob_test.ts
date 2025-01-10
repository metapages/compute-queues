import { assert, assertEquals } from "std/assert";

import { closed, open } from "@korkje/wsi";

import { createWebhookServer } from "./webhooks_test.ts";

import {
  createNewContainerJobMessage,
  type DockerJobState,
} from "@metapages/compute-queues-shared";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

Deno.test(
  "Create a job, and on the submission callback, copy it to another queue via the API",
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

    // https://github.com/metapages/compute-queues/issues/124
    const { message, jobId } = await createNewContainerJobMessage({
      definition: {
        image: "alpine:3.18.5",
        command: `echo ${Math.floor(Math.random() * 1000000)}`,
      },
      namespace,
      control: {
        callbacks: {
          queued: {
            url: `http://test:${port}/test`,
            payload: webhookPayload,
          },
        },
      },
    });

    const queueTarget = `localtest${Math.floor(Math.random() * 1000000)}`;

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

        const response = await fetch(`${API_URL}/api/v1/copy-job-to-queue`, {
          method: "POST",
          body: JSON.stringify({
            jobId,
            queue: queueTarget,
            namespace,
            config: webhookPayload,
          }),
          headers: {
            "Content-Type": "application/json",
          },
        });

        assertEquals(response.status, 200);
        const bodyFromCopyCall: { success: boolean } = await response.json();
        assertEquals(bodyFromCopyCall.success, true);
        // TODO: check that the job is in the second queue

        const responseStatus = await fetch(`${API_URL}/${queueTarget}/status`);
        const jobStatus: {
          jobs: { [jobId: string]: { state: DockerJobState } };
        } = await responseStatus.json();
        // console.log("🐉 jobStatus", jobStatus);
        assert(!!jobStatus?.jobs?.[jobId]);

        webhookResolve();
        return new Response("OK");
      },
      timeout: 12000,
    });

    // Open the socket
    const socket = new WebSocket(
      `${API_URL.replace("http", "ws")}/${QUEUE_ID}/client`,
    );
    await open(socket);
    // Send the job creation message. We don't care about it finishing.
    socket.send(JSON.stringify(message));

    await webhookCalled;
    socket.close();
    await closed(socket);
    await shutdown();
  },
);
