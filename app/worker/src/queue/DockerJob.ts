import type { Buffer } from "std/node/buffer";
import { ensureDirSync, existsSync } from "std/fs";
import type Docker from "dockerode";
import bytes from "bytes";

import * as StreamTools from "/@/docker/streamtools.ts";
import { DockerJobSharedVolumeName } from "/@/docker/volume.ts";
import {
  type DockerApiDeviceRequest,
  type DockerJobImageBuild,
  DockerJobState,
  type DockerRunResult,
  type JobStatusPayload,
  type WebsocketMessageSenderWorker,
  WebsocketMessageTypeWorkerToServer,
} from "@metapages/compute-queues-shared";
import { docker } from "/@/queue/dockerClient.ts";
import { DockerBuildError, ensureDockerImage } from "/@/queue/dockerImage.ts";
import { dirname, join } from "std/path";
import { DockerNetworkForJobs } from "/@/docker/network.ts";

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

// Docker specific
// interface DockerVolumeDef {
//   dockerOpts?: any; //:DockerConnectionOpts;
//   docker?: Docker;
//   name: string;
// }

// export interface MountedDockerVolumeDef extends DockerVolumeDef {
// /* Container mount point */
// mount?: string;
// /* This path refers to a sub path inside a docker container */
// path?: string;
// }

// const { docker, close } = createDockerClient(8343);
// // Close all docker connections on exit
// globalThis.addEventListener("unload", () => close());

export interface Volume {
  host: string;
  container: string;
}

// this goes in
export interface DockerJobArgs {
  sender: WebsocketMessageSenderWorker;
  id: string;
  image?: string;
  build?: DockerJobImageBuild;
  command?: string[] | undefined;
  env?: Record<string, string>;
  entrypoint?: string[] | undefined;
  workdir?: string;
  shmSize?: string;
  volumes?: Array<Volume>;
  outputsDir?: string;
  deviceRequests?: DockerApiDeviceRequest[];
  durationMax?: number;
}

// this comes out
export interface DockerJobExecution {
  finish: Promise<DockerRunResult>;
  kill: () => Promise<void>;
}

if (!existsSync("/var/run/docker.sock")) {
  console.error(
    'You must give access to the local docker daemon via: " -v /var/run/docker.sock:/var/run/docker.sock"',
  );
  Deno.exit(1);
}

export const JobCacheDirectory = "/job-cache";

export const dockerJobExecute = (args: DockerJobArgs): DockerJobExecution => {
  const {
    sender,
    id,
    image,
    command,
    env,
    workdir,
    shmSize,
    entrypoint,
    volumes,
    outputsDir,
    deviceRequests,
  } = args;

  const result: DockerRunResult = {
    logs: [],
  };

  let container: Docker.Container | undefined;

  const kill = async () => {
    if (container) {
      await killAndRemove(container);
    }
  };

  const createOptions: Docker.ContainerCreateOptions = {
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
      "container.mtfm.io/id": args.id,
    },
    User: `${Deno.uid()}:${Deno.gid()}`,
  };

  // Connect container to our network
  createOptions.HostConfig!.NetworkMode = DockerNetworkForJobs;

  createOptions.Env.push("JOB_INPUTS=/inputs");
  createOptions.Env.push("JOB_OUTPUTS=/outputs");
  createOptions.Env.push(`JOB_CACHE=${JobCacheDirectory}`);

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

  let logFileStdout: Deno.FsFile | null = null;
  let logFileStderr: Deno.FsFile | null = null;
  const stdoutLogFileName = outputsDir
    ? join(outputsDir, "stdout.log")
    : undefined;
  const stderrLogFileName = outputsDir
    ? join(outputsDir, "stderr.log")
    : undefined;

  const encoder = new TextEncoder();

  const grabberOutStream = StreamTools.createTransformStream((s: string) => {
    const log = s.toString();
    logFileStdout?.write(encoder.encode(log));
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
    logFileStderr?.write(encoder.encode(log));
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
    try {
      createOptions.image = await ensureDockerImage({
        jobId: id,
        image,
        build: args.build,
        sender,
      });
    } catch (err: unknown) {
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
        console.error("💥 ensureDockerImage error", err);
        result.logs.push([
          `Failure to pull or build the docker image:  ${message}`,
          Date.now(),
          true,
        ]);
        result.error = "Error";
        return result;
      }
    }

    // Check for existing job container
    const runningContainers = await docker.listContainers({
      Labels: {
        "container.mtfm.io/id": args.id,
      },
    });
    const existingJobContainer = runningContainers.find(
      (container: unknown) =>
        container &&
        typeof container === "object" &&
        "Labels" in container &&
        typeof container.Labels === "object" &&
        container.Labels != null &&
        "container.mtfm.io/id" in container.Labels &&
        container.Labels["container.mtfm.io/id"] === args.id,
    );

    if (existingJobContainer) {
      container = docker.getContainer(existingJobContainer.Id);
      if (container) {
        // First get existing logs from files
        const existsStdOut = stdoutLogFileName
          ? existsSync(stdoutLogFileName)
          : false;
        const textStdOut = existsStdOut && stdoutLogFileName
          ? await Deno.readTextFile(stdoutLogFileName)
          : "";
        if (textStdOut) {
          const logs = textStdOut
            .split("\n")
            .map((line) => [line, Date.now(), false]);
          sender({
            type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
            payload: {
              jobId: id,
              step: `${DockerJobState.Running}`,
              logs,
            } as JobStatusPayload,
          });
        }

        const existsStderr = stderrLogFileName
          ? existsSync(stderrLogFileName)
          : false;
        const textStderr = existsStderr && stderrLogFileName
          ? await Deno.readTextFile(stderrLogFileName)
          : "";
        if (textStderr) {
          const logs = textStderr
            .split("\n")
            .map((line) => [line, Date.now(), true]);
          sender({
            type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
            payload: {
              jobId: id,
              step: `${DockerJobState.Running}`,
              logs,
            } as JobStatusPayload,
          });
        }

        // Attach to container streams immediately to capture new logs
        const stream = await container.attach({
          stream: true,
          stdout: true,
          stderr: true,
        });
        container.modem.demuxStream(stream, grabberOutStream, grabberErrStream);
      }
    }

    // create the log file, depending on if the container was already running
    // if it was running, we don't want to overwrite the log file
    if (!existingJobContainer) {
      if (stdoutLogFileName) {
        try {
          Deno.removeSync(stdoutLogFileName);
        } catch (_) {
          /* do nothing */
        }
      }
      if (stderrLogFileName) {
        try {
          Deno.removeSync(stderrLogFileName);
        } catch (_) {
          /* do nothing */
        }
      }
    }
    if (stdoutLogFileName) {
      ensureDirSync(dirname(stdoutLogFileName));
      logFileStdout = stdoutLogFileName
        ? await Deno.open(stdoutLogFileName, {
          write: true,
          create: true,
          append: true,
        })
        : null;
    }
    if (stderrLogFileName) {
      ensureDirSync(dirname(stderrLogFileName));
      logFileStderr = stderrLogFileName
        ? await Deno.open(stderrLogFileName, {
          write: true,
          create: true,
          append: true,
        })
        : null;
    }

    if (!container) {
      container = await docker.createContainer(createOptions);
    }

    const stream = await container!.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });
    container!.modem.demuxStream(stream, grabberOutStream, grabberErrStream);

    if (!existingJobContainer) {
      // is buffer
      const startData: Buffer = await container!.start();
      console.log(
        "🚀 container started, startData",
        new TextDecoder().decode(startData),
      );
    }

    console.log("🚀 container started, waiting...", id);
    const dataWait = await container!.wait();
    console.log("🚀 container finished", dataWait);

    logFileStdout?.close();
    logFileStderr?.close();

    result.StatusCode = dataWait != null ? dataWait.StatusCode : null;

    // remove the container out-of-band (return quickly)
    killAndRemove(container);

    return result;
  };

  return {
    kill,
    finish: finish(),
  };
};

const killAndRemove = async (
  container?: Docker.Container,
): Promise<unknown> => {
  if (container) {
    let killResult: unknown;
    try {
      killResult = await container.kill();
    } catch (_err) {
      /* do nothing */
    }
    (async () => {
      try {
        await container.remove();
      } catch (err) {
        console.log(`Failed to remove but ignoring error: ${err}`);
      }
    })();
    // console.log(`❗❗❗ WARNING: container NOT removed: ${container.id}`);
    return killResult;
  }
};

// const dockerUrlMatches = (a: DockerUrlBlob, b: DockerUrlBlob) => {
//   if (a.repository == b.repository) {
//     const tagA = a.tag;
//     const tagB = b.tag;
//     return !tagA || !tagB ? true : tagA === tagB;
//   } else {
//     return false;
//   }
// };

// interface DockerUrlBlob {
//   repository: string;
//   registry?: string;
//   tag?: string;
// }

// const parseDockerUrl = (s: string): DockerUrlBlob => {
//   s = s.trim();
//   const r = /(.*\/)?([a-z0-9_-]+)(:[a-z0-9_\.-]+)?/i;
//   const result = r.exec(s);
//   if (!result) {
//     throw `Not a docker URL: ${s}`;
//   }
//   let registryAndNamespace: string | undefined = result[1];
//   const repository = result[2];
//   let tag = result[3];
//   if (tag) {
//     tag = tag.substring(1);
//   }
//   registryAndNamespace = registryAndNamespace
//     ? registryAndNamespace.substring(0, registryAndNamespace.length - 1)
//     : undefined;
//   let namespace: string | undefined;
//   let registry: string | undefined;
//   if (registryAndNamespace) {
//     const tokens = registryAndNamespace.split("/");
//     if (tokens.length > 1) {
//       namespace = tokens.pop();
//       registry = tokens.length > 0 ? tokens.join("/") : undefined;
//     } else {
//       //If the registry and namespace does not contain /
//       //and there's no '.'/':' then there's no registry
//       if (
//         registryAndNamespace.indexOf(".") > -1 ||
//         registryAndNamespace.indexOf(":") > -1
//       ) {
//         registry = registryAndNamespace;
//       } else {
//         namespace = registryAndNamespace;
//       }
//     }
//   }

//   const url: DockerUrlBlob = {
//     repository: namespace == null ? repository : `${namespace}/${repository}`,
//   };
//   if (tag != null) {
//     url.tag = tag;
//   }
//   if (registry != null) {
//     url.registry = registry;
//   }
//   return url;
// };
