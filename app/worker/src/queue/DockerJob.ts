import { DockerNetworkForJobs } from "/@/docker/network.ts";
import * as StreamTools from "/@/docker/streamtools.ts";
import { DockerJobSharedVolumeName } from "/@/docker/volume.ts";
import { ContainerLabel, ContainerLabelId, ContainerLabelQueue, ContainerLabelWorker } from "/@/queue/constants.ts";
import { docker } from "/@/queue/dockerClient.ts";
import { DockerBuildError, ensureDockerImage } from "/@/queue/dockerImage.ts";
import bytes from "bytes";
import type { Container, ContainerCreateOptions } from "dockerode";
import type { Buffer } from "std/node/buffer";

import {
  DockerJobState,
  type DockerRunResult,
  getJobColorizedString,
  getWorkerColorizedString,
  type JobStatusPayload,
  WebsocketMessageTypeWorkerToServer,
} from "@metapages/compute-queues-shared";

import { config } from "../config.ts";
import { killAndRemove } from "./cleanup.ts";
import { type DockerJobArgs, type DockerJobExecution, DockerRunPhase } from "./types.ts";
import { getDockerFiltersForJob } from "./utils.ts";

// Minimal interface for interacting with docker jobs:
//  inputs:
//    - job spec
//    - std streams writables
//  exposed/output:
//      - Promise<result>:
//          - stdout+stderr
//          - exit code
//          - errors
//          - StatusCode
//      - kill switch => Promise<void>
// just that no more.

export const JobCacheDirectory = "/job-cache";

export const dockerJobExecute = (args: DockerJobArgs): DockerJobExecution => {
  const {
    workItem,
    workerId,
    sender,
    id,
    queue,
    image,
    command,
    env,
    workdir,
    shmSize,
    entrypoint,
    volumes,
    deviceRequests,
    maxJobDuration,
    isKilled,
  } = args;

  const result: DockerRunResult = {
    logs: [],
    isTimedOut: false,
  };

  const dockerExecution: DockerJobExecution = {
    kill: (_: string) => {},
    finish: new Promise(() => {}),
    isKilled,
    container: undefined,
  };

  // export interface DockerJobExecution {
  // finish: Promise<DockerRunResult | undefined>;
  // container: Container | undefined;
  // kill: (reason: string) => void | Promise<void>;
  // isKilled: { value: boolean };

  // let container: Container | undefined;

  let durationHandler: number | undefined;

  const kill = async (reason: string) => {
    if (durationHandler) {
      clearInterval(durationHandler);
      durationHandler = undefined;
    }
    if (!finishTime) {
      finishTime = Date.now();
    }
    if (!result.duration && startTime && finishTime) {
      result.duration = finishTime - startTime;
    }

    isKilled.value = true;
    if (dockerExecution.container) {
      console.log(
        `${getWorkerColorizedString(workerId)} ${getJobColorizedString(id)} 🗑️  kill(${reason}) killing container`,
        dockerExecution.container.id,
      );
      await killAndRemove(workItem, id, dockerExecution.container, reason);
    }
  };

  let startTime: number | undefined;
  let finishTime: number | undefined;

  const maxDurationCheck = () => {
    if (startTime && !finishTime && !isKilled.value) {
      const duration = Date.now() - startTime;
      if (duration > maxJobDuration) {
        console.log(
          `${getWorkerColorizedString(workerId)} ${
            getJobColorizedString(id)
          } 💥💥💥 max duration exceeded [${duration} > ${maxJobDuration}]`,
          id,
        );
        result.isTimedOut = true;
        kill("max duration exceeded");
      }
    }
    if (!finishTime && !isKilled.value) {
      setTimeout(maxDurationCheck, 1000);
    }
  };
  maxDurationCheck();

  const createOptions: ContainerCreateOptions = {
    Image: image,
    Cmd: command,
    WorkingDir: workdir,
    Entrypoint: entrypoint,
    HostConfig: {},
    Env: env != null ? Object.keys(env).map((key) => `${key}=${env[key]}`) : [],
    Tty: false, // needed for splitting stdout/err
    AttachStdout: true,
    AttachStderr: true,
    Labels: {
      [ContainerLabelWorker]: workerId,
      [ContainerLabelId]: args.id,
      [ContainerLabelQueue]: queue,
      [ContainerLabel]: "true",
    } as Record<string, string>,
    User: `${Deno.uid()}:${Deno.gid()}`,
  };

  // Connect container to our network
  createOptions.HostConfig!.NetworkMode = DockerNetworkForJobs;

  // this way jobs can notify other resources about how
  // to access this jobs resources e.g. MCP servers.
  createOptions.Env!.push("JOB_ID=" + args.id);
  createOptions.Env!.push("JOB_INPUTS=/inputs");
  createOptions.Env!.push("JOB_OUTPUTS=/outputs");
  createOptions.Env!.push(`JOB_CACHE=${JobCacheDirectory}`);

  if (deviceRequests) {
    // https://github.com/apocas/dockerode/issues/628
    createOptions.HostConfig!.DeviceRequests = deviceRequests;
  }

  if (volumes != null) {
    createOptions.HostConfig!.Binds = [];
    volumes.forEach((volume) => {
      createOptions.HostConfig!.Binds!.push(
        `${volume.host}:${volume.container}:Z`,
      );
    });
  }

  if (shmSize) {
    createOptions.HostConfig!.ShmSize = bytes(shmSize);
  }

  // Add a volume shared between all job containers
  // For e.g. big downloaded models
  // Security issue? Maybe. Don't store your job
  // data there, store it in /inputs and /outputs.
  createOptions.HostConfig!.Binds!.push(
    `${DockerJobSharedVolumeName}:${JobCacheDirectory}:Z`,
  );


  const grabberOutStream = StreamTools.createTransformStream((s: string) => {
    const log = s.toString();
    result.logs.push([log, Date.now()]);
    sender({
      type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
      payload: {
        jobId: id,
        step: `${DockerJobState.Running}`,
        logs: [[log, Date.now()]],
      } as JobStatusPayload,
    });
    return s;
  });

  const grabberErrStream = StreamTools.createTransformStream((s: string) => {
    const log = s.toString();
    result.logs.push([log, Date.now(), true]);
    sender({
      type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
      payload: {
        jobId: id,
        step: `${DockerJobState.Running}`,
        logs: [[log, Date.now(), true]],
      } as JobStatusPayload,
    });
    return s;
  });

  const finish = async () => {
    if (isKilled.value) {
      return;
    }
    if (workItem) {
      workItem.phase = DockerRunPhase.Building;
    }
    try {
      createOptions.Image = await ensureDockerImage({
        jobId: id,
        image,
        build: args.build,
        sender,
      });
    } catch (err: unknown) {
      console.error(
        `${getWorkerColorizedString(workerId)} ${getJobColorizedString(id)} 💥 ensureDockerImage error`,
        (err as Error)?.stack,
      );
      const message = err && typeof err === "object" && "message" in err
        ? err.message
        : `Unknown error: ${String(err)}`;
      result.logs = err &&
          typeof err === "object" &&
          "logs" in err &&
          Array.isArray(err.logs)
        ? err.logs
        : [];
      if (err instanceof DockerBuildError) {
        result.error = "Error building image";
        result.logs.push([`${err.message}`, Date.now(), true]);
        return result;
      } else {
        result.logs.push([
          `Failure to pull or build the docker image:  ${message}`,
          Date.now(),
          true,
        ]);
        result.error = "Error";
        return result;
      }
    }
    if (isKilled.value) {
      return;
    }

    // Check for existing job container
    const existingRunningContainer = await getRunningContainerForJob({ jobId: id });

    if (isKilled.value) {
      return;
    }

    if (existingRunningContainer) {
      const containerInfo = await existingRunningContainer.inspect();
      if (containerInfo.State?.Status === "running") {
        dockerExecution.container = existingRunningContainer;
      }
    }


    if (isKilled.value) {
      return;
    }

    if (!dockerExecution.container) {
      dockerExecution.container = await docker.createContainer(createOptions);

      if (config.debug) {
        console.log(
          `${getWorkerColorizedString(workerId)} ${getJobColorizedString(id)} 👉 created new container`,
          dockerExecution.container.id,
        );
      }
    }

    // attach to container
    const stream = await dockerExecution.container!.attach({
      stream: true,
      stdout: true,
      stderr: true,
      logs: existingRunningContainer ? true : false,
    });
    // console.log(`🤡 after attach`, containerInfo);
    dockerExecution.container!.modem.demuxStream(stream, grabberOutStream, grabberErrStream);

    if (isKilled.value) {
      return;
    }

    workItem.phase = DockerRunPhase.Running;

    if (!existingRunningContainer) {
      // is buffer
      const _: Buffer = await dockerExecution.container!.start();
      console.log(
        `${getWorkerColorizedString(workerId)} ${getJobColorizedString(id)} 🏎️ container started`,
      );
    }

    startTime = Date.now();

    // Wait for container to finish with enhanced logging
    console.log(
      `${getWorkerColorizedString(workerId)} ${getJobColorizedString(id)} ⏳ Waiting for container to finish...`,
    );
    const dataWait = await dockerExecution.container!.wait();
    result.StatusCode = dataWait != null ? dataWait.StatusCode : null;

    console.log(`${getWorkerColorizedString(workerId)} ${getJobColorizedString(id)} ✅ container finished`, dataWait);

    // Enhanced status code analysis
    if (dataWait?.StatusCode === 137) {
      // console.log(
      //   `${getWorkerColorizedString(workerId)} ${
      //     getJobColorizedString(id)
      //   } 💥 CONTAINER KILLED (137) - Likely out of memory!`,
      // );
      // console.log(`${getWorkerColorizedString(workerId)} ${getJobColorizedString(id)} 🔍 Debug info:`, {
      //   containerId: container!.id,
      //   jobId: id,
      //   workerId: workerId,
      //   queue: queue,
      //   duration: startTime ? Date.now() - startTime : "unknown",
      //   maxJobDuration: maxJobDuration,
      //   isKilled: isKilled.value,
      // });

      // Add detailed error information to logs
      result.logs.push([
        `💥 Container killed with status code 137 (out of memory or killed by system)`,
        Date.now(),
        true,
      ]);

      result.logs.push([
        `🔍 Container ID: ${dockerExecution.container!.id}`,
        Date.now(),
        true,
      ]);
      result.logs.push([
        `⏱️ Job duration: ${startTime ? Math.round((Date.now() - startTime) / 1000) + "s" : "unknown"}`,
        Date.now(),
        true,
      ]);
    } else if (dataWait?.StatusCode !== 0) {
      console.log(
        `${getWorkerColorizedString(workerId)} ${
          getJobColorizedString(id)
        } ⚠️ Container exited with non-zero status: ${dataWait?.StatusCode}`,
      );
      result.logs.push([
        `⚠️ Container exited with status code: ${dataWait?.StatusCode}`,
        Date.now(),
        true,
      ]);
    }

    finishTime = finishTime || Date.now();
    if (!result.duration && finishTime && startTime) {
      result.duration = finishTime - startTime;
    }


    // remove the container out-of-band (return quickly)
    if (dockerExecution.container) {
      killAndRemove(workItem, id, dockerExecution.container, "DockerJob.finish normally");
    }

    if (workItem) {
      workItem.phase = DockerRunPhase.UploadOutputs;
    }

    return result;
  };

  dockerExecution.kill = kill;
  dockerExecution.finish = finish();
  dockerExecution.isKilled = isKilled;

  return dockerExecution;
};

export const getRunningContainerForJob = async (args: {
  jobId: string;
  workerId?: string;
}): Promise<Container | undefined> => {
  const runningContainers = await docker.listContainers({
    filters: getDockerFiltersForJob({ ...args, status: "running" }),
  });
  for (const containerData of runningContainers) {
    try {
      const container = docker.getContainer(containerData.Id);
      if (container) {
        return container;
      }
    } catch (_err) {
      /* do nothing */
      console.log(
        `${getJobColorizedString(args.jobId)} :: Failed to remove stopped container but ignoring error: ${_err}`,
      );
    }
  }
};
