import {
  type DataRef,
  type DockerJobDefinitionInputRefs,
  DockerJobFinishedReason,
  DockerJobState,
  type InMemoryDockerJob,
  type StateChangeValueFinished,
} from "/@/shared/types.ts";
import equal from "fast-deep-equal/es6";
import fetchRetry from "fetch-retry";
import { LRUMap } from "mnemonist";
import { create } from "mutative";
import stringify from "safe-stable-stringify";

export const setJobStateRunning = (
  job: InMemoryDockerJob,
  args: { worker: string; time: number },
): InMemoryDockerJob => {
  const { worker, time } = args;
  const newJob: InMemoryDockerJob = {
    ...job,
    state: DockerJobState.Running,
    worker,
    time,
  };
  delete newJob.finished;
  delete newJob.finishedReason;
  return newJob;
};

export const setJobStateQueued = (job: InMemoryDockerJob, args: { time: number }): InMemoryDockerJob => {
  const { time } = args;
  const newJob: InMemoryDockerJob = {
    ...job,
    state: DockerJobState.Queued,
    time,
  };
  delete newJob.finished;
  delete newJob.finishedReason;
  newJob.worker = "";
  return newJob;
};

export const setJobStateReQueued = (job: InMemoryDockerJob, args: { time: number }): InMemoryDockerJob => {
  const { time } = args;
  const newJob: InMemoryDockerJob = {
    ...job,
    state: DockerJobState.Queued,
    time,
  };
  delete newJob.finished;
  delete newJob.finishedReason;
  newJob.worker = "";
  return newJob;
};

export const setJobStateFinished = (
  job: InMemoryDockerJob,
  args: { finished: StateChangeValueFinished },
): InMemoryDockerJob => {
  const { finished } = args;
  const newJob: InMemoryDockerJob = {
    ...job,
    state: DockerJobState.Finished,
    finishedReason: finished.reason,
    time: finished.time,
    finished,
  };
  return newJob;
};

export const setJobStateRemoved = (
  job: InMemoryDockerJob,
): InMemoryDockerJob => {
  const newJob: InMemoryDockerJob = {
    ...job,
    state: DockerJobState.Removed,
  };
  delete newJob.finished;
  delete newJob.finishedReason;
  return newJob;
};

export const getDefinitionS3Key = (id: string): string => {
  return `j/${id}/definition.json`;
};

export const getResultsS3Key = (id: string): string => {
  return `j/${id}/result.json`;
};

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
  if (!job) {
    throw new Error("shaDockerJob: job is undefined");
  }
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

    // remove the channel env var since it changes every refresh
    if (draft?.env?.channel) {
      delete draft.env.channel;
    }
    if (draft?.env?.CHANNEL) {
      delete draft.env.CHANNEL;
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

export const sha256Buffer = async (buffer: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return hashHex;
};

export const fetchRobust: ReturnType<typeof fetchRetry> = fetchRetry(fetch, {
  retries: 5,
  // eslint-disable-next-line
  retryDelay: (
    attempt: number,
    _error: unknown,
    _response: Response | null,
  ) => {
    return Math.pow(2, attempt) * 100; //
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
 * and going all the time. The db is the source of truth, ut we
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
  jobA: InMemoryDockerJob,
  jobB: InMemoryDockerJob,
): InMemoryDockerJob | null => {
  if (equal(jobA, jobB)) {
    return jobA;
  }

  if (jobA && !jobB) {
    return jobA;
  }

  if (!jobA && jobB) {
    return jobB;
  }

  // Check worker priority if different
  if (
    jobA.state === DockerJobState.Running &&
    jobB.state === DockerJobState.Running &&
    (jobA.worker !== jobB.worker)
  ) {
    const workerA = jobA.worker;
    const workerB = jobB.worker;

    const preferredWorker = resolvePreferredWorker(
      workerA,
      workerB,
    );
    if (preferredWorker === workerA) {
      return jobA;
    } else {
      return jobB;
    }
  }

  const isJobAFinished = jobA.state === DockerJobState.Finished;
  const isJobBFinished = jobB.state === DockerJobState.Finished;

  if (isJobAFinished && isJobBFinished) {
    if (jobA.finishedReason === jobB.finishedReason) {
      return jobA.time < jobB.time ? jobA : jobB;
    }

    if (jobA.finishedReason === DockerJobFinishedReason.Deleted) {
      return jobA;
    } else if (jobB.finishedReason === DockerJobFinishedReason.Deleted) {
      return jobB;
    }

    return jobA.time < jobB.time ? jobA : jobB;
  }

  if (isJobAFinished) {
    if (jobB.state === DockerJobState.Queued) {
      return jobB;
    }
    return jobA;
  }

  if (isJobBFinished) {
    if (jobA.state === DockerJobState.Queued) {
      return jobA;
    }
    return jobB;
  }

  if (jobA.state === jobB.state) {
    // If the states are equal, it depends on the state
    switch (jobA.state) {
      case DockerJobState.Running: {
        const workerA = jobA.worker;
        const workerB = jobB.worker;
        return resolvePreferredWorker(workerA, workerB) === workerA ? jobA : jobB;
      }
      case DockerJobState.Queued:
      case DockerJobState.Finished:
      case DockerJobState.Removed:
      default:
        // this is just about dates now, take the first
        return jobA.time < jobB.time ? jobA : jobB;
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
    return jobA.time < jobB.time ? jobA : jobB;
  }
};

const jobColorCache = new LRUMap<string, string>(1000);

/**
 * Creates a colorized console.log string deterministically based on jobId.
 * Uses ANSI color codes to provide consistent color coding for job-related logs.
 * @param jobId - The job identifier
 * @returns A string with ANSI color codes that can be used in console.log
 */
export const getJobColorizedString = (jobId: string): string => {
  if (!jobId) {
    return jobId;
  }
  const cachedColor = jobColorCache.get(jobId);
  if (cachedColor) {
    return cachedColor;
  }

  // Generate a hash from the jobId to ensure deterministic color selection
  let hash = 0;
  for (let i = 0; i < jobId.length; i++) {
    const char = jobId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use the hash to select from a predefined set of colors and styles
  const colorStyles = [
    "\x1b[31m", // Red
    "\x1b[32m", // Green
    "\x1b[33m", // Yellow
    "\x1b[34m", // Blue
    "\x1b[35m", // Magenta
    "\x1b[36m", // Cyan
    "\x1b[91m", // Bright Red
    "\x1b[92m", // Bright Green
    "\x1b[93m", // Bright Yellow
    "\x1b[94m", // Bright Blue
    "\x1b[95m", // Bright Magenta
    "\x1b[96m", // Bright Cyan
    "\x1b[1;31m", // Bold Red
    "\x1b[1;32m", // Bold Green
    "\x1b[1;33m", // Bold Yellow
    "\x1b[1;34m", // Bold Blue
    "\x1b[1;35m", // Bold Magenta
    "\x1b[1;36m", // Bold Cyan
    "\x1b[1;91m", // Bold Bright Red
    "\x1b[1;92m", // Bold Bright Green
    "\x1b[1;93m", // Bold Bright Yellow
    "\x1b[1;94m", // Bold Bright Blue
    "\x1b[1;95m", // Bold Bright Magenta
    "\x1b[1;96m", // Bold Bright Cyan
    // "\x1b[4;31m", // Underline Red
    // "\x1b[4;32m", // Underline Green
    // "\x1b[4;33m", // Underline Yellow
    // "\x1b[4;34m", // Underline Blue
    // "\x1b[4;35m", // Underline Magenta
    // "\x1b[4;36m", // Underline Cyan
    // "\x1b[4;91m", // Underline Bright Red
    // "\x1b[4;92m", // Underline Bright Green
    // "\x1b[4;93m", // Underline Bright Yellow
    // "\x1b[4;94m", // Underline Bright Blue
    // "\x1b[4;95m", // Underline Bright Magenta
    // "\x1b[4;96m", // Underline Bright Cyan
    // "\x1b[7;31m", // Reverse Red
    // "\x1b[7;32m", // Reverse Green
    // "\x1b[7;33m", // Reverse Yellow
    // "\x1b[7;34m", // Reverse Blue
    // "\x1b[7;35m", // Reverse Magenta
    // "\x1b[7;36m", // Reverse Cyan
    // "\x1b[7;91m", // Reverse Bright Red
    // "\x1b[7;92m", // Reverse Bright Green
    // "\x1b[7;93m", // Reverse Bright Yellow
    // "\x1b[7;94m", // Reverse Bright Blue
    // "\x1b[7;95m", // Reverse Bright Magenta
    // "\x1b[7;96m", // Reverse Bright Cyan
  ];

  const colorIndex = Math.abs(hash) % colorStyles.length;
  const selectedColor = colorStyles[colorIndex];
  const resetColor = "\x1b[0m";

  const s = `${selectedColor}[${jobId.substring(0, 6)}]${resetColor}`;
  jobColorCache.set(jobId, s);

  return s;
};

const queueColorCache = new LRUMap<string, string>(1000);

/**
 * Creates a colorized console.log string deterministically based on jobId.
 * Uses ANSI color codes to provide consistent color coding for job-related logs.
 * @param jobId - The job identifier
 * @returns A string with ANSI color codes that can be used in console.log
 */
export const getQueueColorizedString = (queue: string): string => {
  if (!queue) {
    return queue;
  }
  const cachedColor = queueColorCache.get(queue);
  if (cachedColor) {
    return cachedColor;
  }

  // Generate a hash from the jobId to ensure deterministic color selection
  let hash = 0;
  for (let i = 0; i < queue.length; i++) {
    const char = queue.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use the hash to select from a predefined set of colors and styles
  const colorStyles = [
    // "\x1b[31m", // Red
    // "\x1b[32m", // Green
    // "\x1b[33m", // Yellow
    // "\x1b[34m", // Blue
    // "\x1b[35m", // Magenta
    // "\x1b[36m", // Cyan
    // "\x1b[91m", // Bright Red
    // "\x1b[92m", // Bright Green
    // "\x1b[93m", // Bright Yellow
    // "\x1b[94m", // Bright Blue
    // "\x1b[95m", // Bright Magenta
    // "\x1b[96m", // Bright Cyan
    // "\x1b[1;31m", // Bold Red
    // "\x1b[1;32m", // Bold Green
    // "\x1b[1;33m", // Bold Yellow
    // "\x1b[1;34m", // Bold Blue
    // "\x1b[1;35m", // Bold Magenta
    // "\x1b[1;36m", // Bold Cyan
    // "\x1b[1;91m", // Bold Bright Red
    // "\x1b[1;92m", // Bold Bright Green
    // "\x1b[1;93m", // Bold Bright Yellow
    // "\x1b[1;94m", // Bold Bright Blue
    // "\x1b[1;95m", // Bold Bright Magenta
    // "\x1b[1;96m", // Bold Bright Cyan
    // "\x1b[4;31m", // Underline Red
    // "\x1b[4;32m", // Underline Green
    // "\x1b[4;33m", // Underline Yellow
    // "\x1b[4;34m", // Underline Blue
    // "\x1b[4;35m", // Underline Magenta
    // "\x1b[4;36m", // Underline Cyan
    // "\x1b[4;91m", // Underline Bright Red
    // "\x1b[4;92m", // Underline Bright Green
    // "\x1b[4;93m", // Underline Bright Yellow
    // "\x1b[4;94m", // Underline Bright Blue
    // "\x1b[4;95m", // Underline Bright Magenta
    // "\x1b[4;96m", // Underline Bright Cyan
    "\x1b[7;31m", // Reverse Red
    "\x1b[7;32m", // Reverse Green
    "\x1b[7;33m", // Reverse Yellow
    "\x1b[7;34m", // Reverse Blue
    "\x1b[7;35m", // Reverse Magenta
    "\x1b[7;36m", // Reverse Cyan
    "\x1b[7;91m", // Reverse Bright Red
    "\x1b[7;92m", // Reverse Bright Green
    "\x1b[7;93m", // Reverse Bright Yellow
    "\x1b[7;94m", // Reverse Bright Blue
    "\x1b[7;95m", // Reverse Bright Magenta
    "\x1b[7;96m", // Reverse Bright Cyan
  ];

  const colorIndex = Math.abs(hash) % colorStyles.length;
  const selectedColor = colorStyles[colorIndex];
  const resetColor = "\x1b[0m";

  const s = `${selectedColor}[[${queue.substring(0, 14)}]]${resetColor}`;
  queueColorCache.set(queue, s);

  return s;
};

const workerColorCache = new LRUMap<string, string>(1000);

export const getWorkerColorizedString = (worker: string): string => {
  if (!worker) {
    return worker;
  }
  const cachedColor = workerColorCache.get(worker);
  if (cachedColor) {
    return cachedColor;
  }

  // Generate a hash from the jobId to ensure deterministic color selection
  let hash = 0;
  for (let i = 0; i < worker.length; i++) {
    const char = worker.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use the hash to select from a predefined set of colors and styles
  const colorStyles = [
    // "\x1b[31m", // Red
    // "\x1b[32m", // Green
    // "\x1b[33m", // Yellow
    // "\x1b[34m", // Blue
    // "\x1b[35m", // Magenta
    // "\x1b[36m", // Cyan
    // "\x1b[91m", // Bright Red
    // "\x1b[92m", // Bright Green
    // "\x1b[93m", // Bright Yellow
    // "\x1b[94m", // Bright Blue
    // "\x1b[95m", // Bright Magenta
    // "\x1b[96m", // Bright Cyan
    // "\x1b[1;31m", // Bold Red
    // "\x1b[1;32m", // Bold Green
    // "\x1b[1;33m", // Bold Yellow
    // "\x1b[1;34m", // Bold Blue
    // "\x1b[1;35m", // Bold Magenta
    // "\x1b[1;36m", // Bold Cyan
    // "\x1b[1;91m", // Bold Bright Red
    // "\x1b[1;92m", // Bold Bright Green
    // "\x1b[1;93m", // Bold Bright Yellow
    // "\x1b[1;94m", // Bold Bright Blue
    // "\x1b[1;95m", // Bold Bright Magenta
    // "\x1b[1;96m", // Bold Bright Cyan
    "\x1b[4;31m", // Underline Red
    "\x1b[4;32m", // Underline Green
    "\x1b[4;33m", // Underline Yellow
    "\x1b[4;34m", // Underline Blue
    "\x1b[4;35m", // Underline Magenta
    "\x1b[4;36m", // Underline Cyan
    "\x1b[4;91m", // Underline Bright Red
    "\x1b[4;92m", // Underline Bright Green
    "\x1b[4;93m", // Underline Bright Yellow
    "\x1b[4;94m", // Underline Bright Blue
    "\x1b[4;95m", // Underline Bright Magenta
    "\x1b[4;96m", // Underline Bright Cyan
    // "\x1b[7;31m", // Reverse Red
    // "\x1b[7;32m", // Reverse Green
    // "\x1b[7;33m", // Reverse Yellow
    // "\x1b[7;34m", // Reverse Blue
    // "\x1b[7;35m", // Reverse Magenta
    // "\x1b[7;36m", // Reverse Cyan
    // "\x1b[7;91m", // Reverse Bright Red
    // "\x1b[7;92m", // Reverse Bright Green
    // "\x1b[7;93m", // Reverse Bright Yellow
    // "\x1b[7;94m", // Reverse Bright Blue
    // "\x1b[7;95m", // Reverse Bright Magenta
    // "\x1b[7;96m", // Reverse Bright Cyan
  ];

  const colorIndex = Math.abs(hash) % colorStyles.length;
  const selectedColor = colorStyles[colorIndex];
  const resetColor = "\x1b[0m";

  const s = `${selectedColor}~~${worker.substring(0, 14)}~~${resetColor}`;
  workerColorCache.set(worker, s);

  return s;
};
