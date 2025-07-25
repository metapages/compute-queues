import { assertEquals } from "std/assert";

import { closed, open } from "@korkje/wsi";

import { createNewContainerJobMessage, fetchRobust } from "../../shared/src/mod.ts";
import { closeKv } from "../../shared/src/shared/kv.ts";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

const fetch = fetchRobust;

// Helper functions to manage the webhook server
export const createWebhookServer = (opts: {
  path: string;
  port: number;
  handler: (req: Request) => Response | Promise<Response>;
  timeout: number;
}): { shutdown: () => Promise<void> } => {
  const { path, port, handler, timeout = 10000 } = opts;

  const ac = new AbortController();
  const server = Deno.serve(
    { signal: ac.signal, port, hostname: "0.0.0.0" },
    (_req) => {
      if (new URL(_req.url).pathname === path) {
        return handler(_req);
      } else {
        return new Response("NOT FOUND", { status: 404 });
      }
    },
  );

  // server.finished.then(() => console.log("Server closed"));

  const timeoutId = setTimeout(() => {
    ac.abort();
    throw new Error("Webhook server timed out");
  }, timeout);

  const shutdown = () => {
    clearTimeout(timeoutId);
    // console.log("Closing server...");
    setTimeout(() => {
      ac.abort();
    }, 1);
    return server.finished;
  };
  return { shutdown };
};

Deno.test("Test our temporary webhook server works", async () => {
  // Create a promise that will resolve when the webhook is called
  const { promise: webhookCalled, resolve } = Promise.withResolvers<void>();

  const port = Math.floor(Math.random() * (65535 - 1024) + 1024);
  const { shutdown } = createWebhookServer({
    path: "/test",
    port,
    handler: async (req) => {
      const body = await req.json();
      assertEquals(body, { foo: "bar" });
      resolve();
      return new Response("OK");
    },
    timeout: 10000,
  });

  const resp = await fetch(`http://test:${port}/test`, {
    method: "POST",
    body: JSON.stringify({ foo: "bar" }),
  });
  await resp.text();
  assertEquals(resp.status, 200);

  await webhookCalled;

  await shutdown();
  closeKv();
});

Deno.test(
  "Run a job with a submission webhook, confirm the webhook is called",
  async () => {
    // Create a server to receive the webhook
    // then have a job that calls it on submission

    const webhookPayload = {
      we: "are good",
    };

    const namespace = `test${Math.floor(Math.random() * 1000000)}`;

    const port = Math.floor(Math.random() * (65535 - 1024) + 1024);

    const { message, jobId } = await createNewContainerJobMessage({
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
    closeKv();
  },
);
