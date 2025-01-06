import { getKv } from "/@/shared/kv.ts";
import type {
  DockerJobDefinitionRow,
  DockerJobUserConfig,
  StateChangeValueQueued,
} from "/@/shared/types.ts";
import { ms } from "ms";

const kv = await getKv();
const expireIn1Week = ms("1 week") as number;

Deno.cron("Check for webhooks to retry", "* * * * *", () => {
  retryUnsuccessfulWebhooks();
});

export const callJobWebhook = async (
  queue: string,
  namespace: string,
  jobId: string,
  config: DockerJobUserConfig,
) => {
  const webhookUrl = config.callbacks?.queued?.url;
  if (!webhookUrl) {
    return;
  }
  const payload = config.callbacks?.queued?.payload || {};

  const response = await fetch(webhookUrl, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    console.log(`Webhook ${webhookUrl}failed with status ${response.status}`);
    return;
  }
  console.log(`Webhook ${webhookUrl} succeeded`);
  //record as done
  await deleteJobProcessSubmissionWebhook(queue, namespace, jobId);
};

const retryUnsuccessfulWebhooks = async (): Promise<void> => {
  const iter = kv.list<DockerJobUserConfig>({
    prefix: ["submission-hook"],
  });
  for await (const res of iter) {
    const { key, value } = res;
    const [_, queue, namespace, jobId] = key as string[];
    const config = value;
    await callJobWebhook(queue, namespace, jobId, config);
  }
};

export const addJobProcessSubmissionWebhook = async (
  queue: string,
  job: DockerJobDefinitionRow,
): Promise<void> => {
  const jobId = job.hash;
  const config = (job.history[0].value as StateChangeValueQueued)?.config;
  if (!config?.callbacks?.queued) {
    return;
  }
  const namespace =
    (job.history[0].value as StateChangeValueQueued)?.namespace || "_";

  console.log("🔥 submission-hook", queue, namespace, jobId, config);
  await kv.set(["submission-hook", queue, namespace, jobId], config, {
    expireIn: expireIn1Week,
  });
  callJobWebhook(queue, namespace, jobId, config);
};

const deleteJobProcessSubmissionWebhook = async (
  queue: string,
  namespace: string,
  jobId: string,
): Promise<void> => {
  await kv.delete(["submission-hook", queue, namespace, jobId]);
};
