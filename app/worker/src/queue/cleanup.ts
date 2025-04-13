import {
  ContainerLabel,
  ContainerLabelId,
  ContainerLabelQueue,
  ContainerLabelTestMode,
} from "/@/queue/constants.ts";
import { docker } from "/@/queue/dockerClient.ts";

export const removeAllJobsFromOtherQueues = async (queue: string) => {
  // Check for existing job container
  const runningContainers = await docker.listContainers({
    filters: `{"label": ["${ContainerLabel}=true"]}`,
  });
  for (const containerData of runningContainers) {
    const containerId = containerData.Id;
    const containerLabels = containerData.Labels;
    const containerQueue = containerLabels[ContainerLabelQueue];
    // jobs created during functional tests are ignored
    const containerTestMode = containerLabels[ContainerLabelTestMode];
    if (containerQueue !== queue && containerTestMode !== "true") {
      try {
        const container = await docker.getContainer(containerId);
        await container.kill();
        await container.remove();
      } catch (_err) {
        /* do nothing */
        console.log(
          `Failed to kill container not in queue but ignoring error: ${_err}`,
        );
      }
      console.log(
        `Removed container ${
          containerId.substring(
            0,
            8,
          )
        } from queue ${containerQueue}`,
      );
    }
  }
};

export const removeAllJobsFromQueueNotInSet = async (set: Set<string>) => {
  // Check for existing job container
  const runningContainers = await docker.listContainers({
    filters: `{"label": ["${ContainerLabel}=true"]}`,
  });
  for (const containerData of runningContainers) {
    const containerId = containerData.Id;
    const containerLabels = containerData.Labels;
    const jobId = containerLabels[ContainerLabelId];
    const containerQueue = containerLabels[ContainerLabelQueue];
    if (jobId && !set.has(jobId)) {
      try {
        const container = await docker.getContainer(containerId);
        await container.kill();
        await container.remove();
      } catch (_err) {
        /* do nothing */
        console.log(
          `Failed to kill dangling job container but ignoring error: ${_err}`,
        );
      }
      console.log(
        `Removed dangling job ${
          jobId.substring(
            0,
            8,
          )
        } from queue ${containerQueue}`,
      );
    }
  }
};
