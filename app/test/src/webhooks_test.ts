import { assertEquals } from "std/assert";

import { closed, open } from "@korkje/wsi";

import { createNewContainerJobMessage } from "../../shared/src/mod.ts";

const QUEUE_ID = Deno.env.get("QUEUE_ID") || "local1";
const API_URL = Deno.env.get("API_URL") ||
  (QUEUE_ID === "local" ? "http://worker:8000" : "http://api1:8081");

const TEST_PORT = parseInt(Deno.env.get("TEST_PORT") || "7733");

// Helper functions to manage the webhook server
const createWebhookServer = (opts: {
  path: string;
  handler: (req: Request) => Response | Promise<Response>;
  timeout: number;
}) => {
  const { path, handler, timeout = 10000 } = opts;

  const ac = new AbortController();
  const server = Deno.serve(
    { signal: ac.signal, port: TEST_PORT, hostname: "0.0.0.0" },
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

  const { shutdown } = createWebhookServer({
    path: "/test",
    handler: async (req) => {
      const body = await req.json();
      assertEquals(body, { foo: "bar" });
      resolve();
      return new Response("OK");
    },
    timeout: 10000,
  });

  const resp = await fetch(`http://test:${TEST_PORT}/test`, {
    method: "POST",
    body: JSON.stringify({ foo: "bar" }),
  });
  await resp.text();
  assertEquals(resp.status, 200);

  await webhookCalled;

  await shutdown();
});

Deno.test(
  "Run a job with a submission webhook, confirm the webhook is called",
  async () => {
    // Create a server to receive the webhook
    // then have a job that calls it on submission

    const webhookPayload = {
      we: "are good",
    };

    // https://github.com/metapages/compute-queues/issues/124
    const { message } = await createNewContainerJobMessage({
      definition: {
        image: "alpine:3.18.5",
        command: `echo ${Math.floor(Math.random() * 1000000)}`,
      },
      config: {
        callbacks: {
          queued: {
            url: `http://test:${TEST_PORT}/test`,
            payload: webhookPayload,
          },
        },
      },
    });

    // Create a promise that will resolve when the webhook is called
    const { promise: webhookCalled, resolve: webhookResolve } = Promise
      .withResolvers<typeof webhookPayload>();

    const { shutdown } = createWebhookServer({
      path: "/test",
      handler: async (req) => {
        const body = await req.json();
        // Resolve the promise when we get the expected payload
        assertEquals(body, webhookPayload);
        webhookResolve(body);
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
