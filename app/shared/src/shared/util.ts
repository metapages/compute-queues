import { Sha256 } from "https://deno.land/x/deno@v1.3.1/std/hash/sha256.ts";
import {
  type DataRef,
  type DockerJobDefinitionInputRefs,
  type DockerJobDefinitionRow,
  DockerJobState,
  type StateChangeValueRunning,
} from "/@/shared/types.ts";
import fetchRetry from "fetch-retry";
import { create } from "mutative";
import stringify from "safe-stable-stringify";
import equal from "fast-deep-equal/es6";

const resolvePreferredWorker = (workerA: string, workerB: string) => {
  return workerA.localeCompare(workerB) < 0 ? workerA : workerB;
};

// TODO make this more robust? 1. Replace invalid characters with underscores
export function sanitizeFilename(filename: string): string {
  // Replace invalid characters with underscores
  let sanitized = filename.replace(/[/\\:*?"<>|\0]/g, "_");

  // Limit character set (alphanumeric, underscore, hyphen, period)
  sanitized = sanitized.replace(/[^a-zA-Z0-9_\-.]/g, "_");

  // Remove leading periods
  sanitized = sanitized.replace(/^\.+/, "");

  // Trim whitespace
  sanitized = sanitized.trim();

  // Handle reserved filenames (Windows-specific)
  const reserved = [
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9",
  ];
  if (reserved.includes(sanitized.split(".")[0])) {
    sanitized = sanitized + "_";
  }

  sanitized = sanitized.substring(0, 255);

  return sanitized;
}

export const shaDockerJob = (
  job: DockerJobDefinitionInputRefs,
): Promise<string> => {
  const jobReadyForSha = create(job, (draft: DockerJobDefinitionInputRefs) => {
    // Remove any presignedurl/... from the URLs
    const configFiles = draft.configFiles;
    if (configFiles) {
      Object.keys(configFiles).forEach((key) => {
        if (configFiles[key].type === "url") {
          configFiles[key].value = reduceUrlToHashVersion(
            (configFiles[key] as DataRef<string>)?.value,
          );
        }
        delete configFiles[key].hash;
      });
    }

    // Remove any presignedurl/... from the URLs
    const inputs = draft.inputs;
    if (inputs) {
      Object.keys(inputs).forEach((key) => {
        if (inputs[key].type === "url") {
          inputs[key].value = reduceUrlToHashVersion(
            (inputs[key] as DataRef<string>)?.value,
          );
        }
        delete inputs[key].hash;
      });
    }
    // other aspects not relevant to the hash
  });

  return shaObject(jobReadyForSha);
};

const reduceUrlToHashVersion = (url: string): string => {
  if (url.includes("/presignedurl/")) {
    const tokens = url.split("/presignedurl/");
    return tokens[0];
  }
  if (
    url.startsWith("https://metaframe-asman-test.s3.us-west-1.amazonaws.com")
  ) {
    const urlBlob = new URL(url);
    urlBlob.search = "";
    urlBlob.hash = "";
    return urlBlob.href;
  }

  return url;
};

export const shaObject = (obj: unknown): Promise<string> => {
  const orderedStringFromObject = stringify(obj);
  const msgBuffer = new TextEncoder().encode(orderedStringFromObject);
  return sha256Buffer(msgBuffer);
};

export const sha256Stream = async (
  stream: ReadableStream<Uint8Array>,
): Promise<string> => {
  const hash = new Sha256();
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }

  return hash.toString();
};

export const sha256Buffer = async (buffer: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return hashHex;
};

export const fetchRobust: ReturnType<typeof fetchRetry> = fetchRetry(fetch, {
  retries: 8,
  // eslint-disable-next-line
  retryDelay: (
    attempt: number,
    _error: unknown,
    _response: Response | null,
  ) => {
    return Math.pow(2, attempt) * 400; // 500, 1000, 2000, 4000, 5000
  },

  retryOn: (attempt: number, error: unknown, response: Response | null) => {
    // retry on any network error, or 4xx or 5xx status codes
    if (error !== null || (response && response.status >= 400)) {
      if (attempt > 7) {
        if (error) {
          console.error(error);
        }
        console.log(
          `Retried too many times: response.status=${response?.status} response.statusText=${response?.statusText} attempt number ${
            attempt + 1
          } url=${response?.url}`,
        );
        return false;
      }
      return true;
    }
    return false;
  },
});

/**
 * The situation here is fluid and dynamic, workers and servers and clients coming
 * and going all the time. Rather than force some rigid single source of truth, we
 * resolve conflicts and differences as they come in, and allow jobs to be requeued.
 * This means that resolving which of two jobs is the *most correct* is critical
 * and drives a lot of the rest of the dynamics.
 * At a high level:
 *  - if a job is Finished, it trumps most things
 *  - if two jobs seem the same, the one queued first is priority
 *  - other conflicts: check the time, the earliest wins
 *  - otherwise, whoever has the longest history is priority
 */
export const resolveMostCorrectJob = (
  // jobA is the DEFAULT, if that matters
  jobA: DockerJobDefinitionRow,
  jobB: DockerJobDefinitionRow,
): DockerJobDefinitionRow | null => {
  if (equal(jobA, jobB)) {
    return jobA;
  }

  if (jobA && !jobB) {
    return jobA;
  }

  if (!jobA && jobB) {
    return jobB;
  }

  const jobALastChange = jobA.history[jobA.history.length - 1];
  const isJobAFinished = jobALastChange.state === DockerJobState.Finished;

  const jobBLastChange = jobB.history[jobB.history.length - 1];
  const isJobBFinished = jobBLastChange.state === DockerJobState.Finished;

  if (isJobAFinished && isJobBFinished) {
    return jobALastChange.value.time < jobBLastChange.value.time ? jobA : jobB;
  }

  if (isJobAFinished) {
    return jobA;
  }

  if (isJobBFinished) {
    return jobB;
  }

  if (jobA.history.length < jobB.history.length) {
    return jobB;
  } else if (jobA.history.length > jobB.history.length) {
    return jobA;
  }
  const jobALastEvent = jobA.history[jobA.history.length - 1];
  const jobBLastEvent = jobB.history[jobB.history.length - 1];

  if (jobALastEvent.state === jobBLastEvent.state) {
    // If the states are equal, it depends on the state
    switch (jobALastEvent.state) {
      case DockerJobState.Running: {
        const workerA = (jobALastEvent.value as StateChangeValueRunning).worker;
        const workerB = (jobBLastEvent.value as StateChangeValueRunning).worker;
        return resolvePreferredWorker(workerA, workerB) === workerA
          ? jobA
          : jobB;
      }
      case DockerJobState.Queued:
      case DockerJobState.ReQueued:
      case DockerJobState.Finished:
      default:
        // this is just about dates now, take the first
        return jobALastEvent.value.time < jobBLastEvent.value.time
          ? jobA
          : jobB;
    }
  } else {
    // They have different states? This is more complex
    console.log(
      `🇨🇭🇨🇭🇨🇭 🌘 resolving but jobA=${jobA.state} jobB=${jobB.state}`,
    );
    if (jobA.state === DockerJobState.Running) {
      return jobA;
    } else if (jobB.state === DockerJobState.Running) {
      return jobB;
    }
    return jobA.history[0].value.time < jobB.history[0].value.time
      ? jobA
      : jobB;
  }
};
