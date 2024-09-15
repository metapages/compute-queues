import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';
import { Writable } from 'https://deno.land/std@0.177.0/node/stream.ts';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/exists.ts';
// import Docker from 'https://deno.land/x/dockerapi@v0.1.0/mod.ts';
import Docker from 'npm:dockerode@4.0.2';

// import { Buffer } from "node:buffer";
// import { args as CliArgs } from '../args.ts';
import * as StreamTools from '../docker/streamtools.ts';
import { DockerJobSharedVolumeName } from '../docker/volume.ts';
import {
  ConsoleLogLine,
  DockerApiDeviceRequest,
  DockerJobImageBuild,
  DockerJobState,
  JobStatusPayload,
  WebsocketMessageSenderWorker,
  WebsocketMessageTypeWorkerToServer,
} from '../shared/mod.ts';
import { docker } from './dockerClient.ts';
import {
  DockerBuildError,
  ensureDockerImage,
} from './dockerImage.ts';

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
  build?:DockerJobImageBuild;
  command?: string[] | undefined;
  env?: any;
  entrypoint?: string[] | undefined;
  workdir?: string;
  // volumes?: Array<MountedDockerVolumeDef>;
  volumes?: Array<Volume>;
  outStream?: Writable;
  errStream?: Writable;
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
    'You must give access to the local docker daemon via: " -v /var/run/docker.sock:/var/run/docker.sock"'
  );
  Deno.exit(1);
}

export interface DockerRunResult {
  StatusCode?: number;
  logs: ConsoleLogLine[];
  error?: any;
}

export const JobCacheDirectory = "/job-cache";

export const dockerJobExecute = async (
  args: DockerJobArgs
): Promise<DockerJobExecution> => {

  // console.log('dockerJobExecute args', args);
  const {
    sender,
    id,
    image,
    command,
    env,
    workdir,
    entrypoint,
    volumes,
    outStream,
    errStream,
    deviceRequests,
  } = args;

  const result: DockerRunResult = {
    logs: [],
  };

  let container: Docker.Container | undefined;

  const kill = async (): Promise<any> => {
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
    Env:
      env != null
        ? Object.keys(env).map((key) => `${key}=${env[key]}`)
        : [],
    Tty: false, // needed for splitting stdout/err
    AttachStdout: true,
    AttachStderr: true,
    Labels: {
      "container.mtfm.io/id": args.id,
    }
  };

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
        `${volume.host}:${volume.container}:Z`
      );
    });
  }

  // Add a volume shared between all job containers
  // For e.g. big downloaded models
  // Security issue? Maybe. Don't store your job
  // data there, store it in /inputs and /outputs.
    createOptions.HostConfig!.Binds!.push(
    `${DockerJobSharedVolumeName}:${JobCacheDirectory}:Z`
  );

  var grabberOutStream = StreamTools.createTransformStream((s: string) => {
    result.logs.push([s.toString(), Date.now()]);
    sender({
      type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
      payload: {
        jobId: id,
        step: `${DockerJobState.Running}`,
        logs: [[s.toString(), Date.now()]],
      } as JobStatusPayload,
    });
    return s;
  });
  if (outStream) {
    grabberOutStream.pipe(outStream!);
  }

  var grabberErrStream = StreamTools.createTransformStream((s: string) => {
    result.logs.push([s.toString(), Date.now(), true]);
    sender({
      type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
      payload: {
        jobId: id,
        step: `${DockerJobState.Running}`,
        logs: [[s.toString(), Date.now(), true]],
      } as JobStatusPayload,
    });
    return s;
  });
  if (errStream) {
    grabberErrStream.pipe(errStream!);
  }

  const runningContainers :any[] = await docker.listContainers({Labels: {
    "container.mtfm.io/id": args.id,
  }});

  const finish = async () => {
    try {
      createOptions.image = await ensureDockerImage({jobId: id, image, build: args.build, sender});
    } catch (err) {
      if (err instanceof DockerBuildError) {
        result.error = err.message;
        result.logs = err.logs ? err.logs : [];
        return result;
      } else {
        console.error('💥 ensureDockerImage error', err);
        result.error = `Failure to pull or build the docker image:  ${err?.message}`;
        return result;
      }
    }

    // Check for existing job container
    const runningContainers = await docker.listContainers({Labels: {
      "container.mtfm.io/id": args.id,
    }});
    const existingJobContainer = runningContainers.find((container :any) => container?.Labels["container.mtfm.io/id"] === args.id);

    if (existingJobContainer) {
      container = docker.getContainer(existingJobContainer.Id);
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
      console.log('🚀 container started, startData', new TextDecoder().decode(startData));
    }

    console.log('🚀 container started, waiting...', id);
    const dataWait = await container!.wait();
    console.log('🚀 container finished', dataWait);

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

const killAndRemove = async (container?: Docker.Container): Promise<any> => {
  if (container) {
    let killResult: any;
    try {
      killResult = await container.kill();
    } catch (err) {}
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


const dockerUrlMatches = (a: DockerUrlBlob, b: DockerUrlBlob) => {
  if (a.repository == b.repository) {
    const tagA = a.tag;
    const tagB = b.tag;
    return !tagA || !tagB ? true : tagA === tagB;
  } else {
    return false;
  }
};

interface DockerUrlBlob {
  repository: string;
  registry?: string;
  tag?: string;
}

const parseDockerUrl = (s: string): DockerUrlBlob => {
  s = s.trim();
  const r = /(.*\/)?([a-z0-9_-]+)(:[a-z0-9_\.-]+)?/i;
  const result = r.exec(s);
  if (!result) {
    throw `Not a docker URL: ${s}`;
  }
  let registryAndNamespace: string | undefined = result[1];
  const repository = result[2];
  let tag = result[3];
  if (tag) {
    tag = tag.substring(1);
  }
  registryAndNamespace = registryAndNamespace
    ? registryAndNamespace.substring(0, registryAndNamespace.length - 1)
    : undefined;
  let namespace: string | undefined;
  let registry: string | undefined;
  if (registryAndNamespace) {
    var tokens = registryAndNamespace.split("/");
    if (tokens.length > 1) {
      namespace = tokens.pop();
      registry = tokens.length > 0 ? tokens.join("/") : undefined;
    } else {
      //If the registry and namespace does not contain /
      //and there's no '.'/':' then there's no registry
      if (
        registryAndNamespace.indexOf(".") > -1 ||
        registryAndNamespace.indexOf(":") > -1
      ) {
        registry = registryAndNamespace;
      } else {
        namespace = registryAndNamespace;
      }
    }
  }

  var url: DockerUrlBlob = {
    repository: namespace == null ? repository : `${namespace}/${repository}`,
  };
  if (tag != null) {
    url.tag = tag;
  }
  if (registry != null) {
    url.registry = registry;
  }
  return url;
};
