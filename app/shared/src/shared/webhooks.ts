import { ms } from "ms";
import { getKv } from "/@/shared/kv.ts";
import type { DockerJobControlConfig } from "/@/shared/types.ts";

const kv = await getKv();
const expireIn1Week = ms("1 week") as number;

Deno.cron("Check for webhooks to retry", "* * * * *", () => {
  retryUnsuccessfulWebhooks();
});

export const callJobWebhook = async (
  queue: string,
  namespace: string,
  jobId: string,
  config: DockerJobControlConfig,
) => {
  // console.log(`🔥🔥 callJobWebhook [${jobId.substring(0, 6)}] `, queue, namespace);
  const webhookUrl = config.callbacks?.queued?.url;
  if (!webhookUrl) {
    // console.log(`🔥💦 callJobWebhook [${jobId.substring(0, 6)}] !webhookUrl`);
    return;
  }
  const payload = config.callbacks?.queued?.payload || {};

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      body: JSON.stringify({ jobId, queue, namespace, config: payload }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      // console.log(`Webhook ${webhookUrl}failed with status ${response.status}`);
      return;
    }
    // console.log(`Webhook ${webhookUrl} succeeded`);
    //record as done
    await deleteJobProcessSubmissionWebhook(queue, namespace, jobId);
  } catch (err) {
    console.error(
      `Error calling [${
        jobId.substring(0, 6)
      }] webhook, will retry in a minute ${webhookUrl}:`,
      (err?.toString())?.includes("Name or service not known")
        ? "Name or service not known"
        : err?.toString(),
    );
    // do not keep test webhooks around
    if (webhookUrl.startsWith("http://test:")) {
      await deleteJobProcessSubmissionWebhook(queue, namespace, jobId);
    }
  }
};

const retryUnsuccessfulWebhooks = async (): Promise<void> => {
  const iter = kv.list<DockerJobControlConfig>({
    prefix: ["submission-hook"],
  });
  for await (const res of iter) {
    const { key, value } = res;
    const [_, queue, namespace, jobId] = key as string[];
    const config = value;
    await callJobWebhook(queue, namespace, jobId, config);
  }
};

export const addJobProcessSubmissionWebhook = async (opts: {
  queue: string;
  namespace: string;
  jobId: string;
  control: DockerJobControlConfig;
}): Promise<void> => {
  const { jobId, namespace, queue, control } = opts;
  console.log(`🔥 addJobProcessSubmissionWebhook [${jobId.substring(0, 6)}]`);

  if (!control?.callbacks?.queued) {
    console.log(
      `🔥💦  addJobProcessSubmissionWebhook [${
        jobId.substring(0, 6)
      }] no config`,
    );
    return;
  }

  console.log(
    `🔥 addJobProcessSubmissionWebhook [${
      jobId.substring(0, 6)
    }] submission-hook`,
    queue,
    namespace,
    jobId,
  );
  await kv.set(["submission-hook", queue, namespace, jobId], control, {
    expireIn: expireIn1Week,
  });
  callJobWebhook(queue, namespace, jobId, control);
};

const deleteJobProcessSubmissionWebhook = async (
  queue: string,
  namespace: string,
  jobId: string,
): Promise<void> => {
  await kv.delete(["submission-hook", queue, namespace, jobId]);
};
