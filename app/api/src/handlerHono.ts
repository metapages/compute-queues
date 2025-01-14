import { serveStatic } from "hono/middleware";
import { cors } from "hono/middleware/cors";
import { type Context, Hono } from "hono";

import { downloadHandler } from "/@/routes/api/v1/download.ts";
import { statusHandler } from "/@/routes/status.ts";
import { metricsHandler } from "/@/routes/metrics.ts";
import { uploadHandler } from "/@/routes/api/v1/upload.ts";
import { uploadHandler as uploadHandlerDeprecated } from "/@/routes/deprecated/upload.ts";
import { downloadHandler as downloadHandlerDeprecated } from "/@/routes/deprecated/download.ts";
import { copyJobToQueueHandler } from "/@/routes/api/v1/copy-job-to-queue.ts";

const app = new Hono();

// app.use(logger((message: string, ...rest: string[]) => {
//   if (message.includes('GET /healthz')) {
//     return;
//   }
//   console.log(message, ...rest)
// }))

app.use("/*", cors() // cors({
  // origin: 'http://example.com',
  // allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
  // allowMethods: ['POST', 'GET', 'OPTIONS'],
  // exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
  // maxAge: 600,
  // credentials: true,
  // })
);

// Put your custom routes here
app.get("/healthz", (c: Context) => c.text("OK"));

app.get("/api/v1/download/:key", downloadHandler);
app.put("/api/v1/upload/:key", uploadHandler);
app.post("/api/v1/copy-job-to-queue", copyJobToQueueHandler);

// @deprecated
app.get("/upload/:key", uploadHandlerDeprecated);
// @deprecated
app.get("/download/:key", downloadHandlerDeprecated);

app.get("/:queue/status", statusHandler);
app.get("/:queue/metrics", metricsHandler);

// Serve static assets, and the index.html as the fallback
app.get("/*", serveStatic({ root: "app/browser/dist" }));
app.get("/", serveStatic({ path: "app/browser/dist/index.html" }));
app.get("*", serveStatic({ path: "app/browser/dist/index.html" }));

export const handlerHttp = app.fetch as (
  request: Request,
) => Promise<Response | undefined>;
