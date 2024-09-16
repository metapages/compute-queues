import {
  DockerJobDefinitionRow,
  DockerJobState,
  resolvePreferredWorker,
  StateChangeValueRunning,
} from '/@/shared';
import equal from 'fast-deep-equal/es6';

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
 *
 */
export const resolveMostCorrectJob = (
  // jobA is the DEFAULT, if that matters
  jobA: DockerJobDefinitionRow,
  jobB: DockerJobDefinitionRow
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
      case DockerJobState.Running:
        const workerA = (jobALastEvent.value as StateChangeValueRunning).worker;
        const workerB = (jobBLastEvent.value as StateChangeValueRunning).worker;
        return resolvePreferredWorker(workerA, workerB) === workerA
          ? jobA
          : jobB;
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
      `🇨🇭🇨🇭🇨🇭 🌘 resolving but jobA=${jobA.state} jobB=${jobB.state}`
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
