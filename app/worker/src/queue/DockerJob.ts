import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';
import { Writable } from 'https://deno.land/std@0.177.0/node/stream.ts';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/exists.ts';
// import Docker from 'https://deno.land/x/dockerapi@v0.1.0/mod.ts';
import Docker from 'npm:dockerode@4.0.2';

import { config } from '../config.ts';
import { createDockerClient } from '../docker/client.ts';
// import { Buffer } from "node:buffer";
// import { args as CliArgs } from '../args.ts';
import * as StreamTools from '../docker/streamtools.ts';
import { generateDockerImageTag } from './utils.ts';

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

const { docker, close } = createDockerClient(8343);
// Close all docker connections on exit
globalThis.addEventListener("unload", () => close());

export interface Volume {
  host: string;
  container: string;
}

// this goes in
export interface DockerJobArgs {
  id: string;
  image: string;
  command?: string[] | undefined;
  env?: any;
  entrypoint?: string[] | undefined;
  workdir?: string;
  // volumes?: Array<MountedDockerVolumeDef>;
  volumes?: Array<Volume>;
  outStream?: Writable;
  errStream?: Writable;
  gpu?: boolean;
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
  stdout?: string[];
  stderr?: string[];
  error?: any;
}

export const dockerJobExecute = async (
  args: DockerJobArgs
): Promise<DockerJobExecution> => {
  const {
    image,
    command,
    env,
    workdir,
    entrypoint,
    volumes,
    outStream,
    errStream,
    gpu,
  } = args;

  const result: DockerRunResult = {
    stdout: [],
    stderr: [],
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
        : undefined,
    Tty: false, // needed for splitting stdout/err
    AttachStdout: true,
    AttachStderr: true,
    Labels: {
      "container.mtfm.io/id": args.id,
    }
  };

  if (gpu && config.gpus) {
    // https://github.com/apocas/dockerode/issues/628
    createOptions.HostConfig!.DeviceRequests = [
      {
        // TODO: what did I disable this?
        Count: -1,
        Driver: "nvidia",
        Capabilities: [["gpu"]],
      },
    ];
  }

  if (volumes != null) {
    createOptions.HostConfig!.Binds = [];
    volumes.forEach((volume) => {
      // assert(volume.host, `Missing volume.host`);
      // assert(volume.container, `Missing volume.container`);
      createOptions.HostConfig!.Binds!.push(
        `${volume.host}:${volume.container}:Z`
      );
    });
  }

  var grabberOutStream = StreamTools.createTransformStream((s: string) => {
    result.stdout!.push(s.toString());
    return s;
  });
  if (outStream) {
    grabberOutStream.pipe(outStream!);
  }

  var grabberErrStream = StreamTools.createTransformStream((s: string) => {
    result.stderr!.push(s.toString());
    return s;
  });
  if (errStream) {
    grabberErrStream.pipe(errStream!);
  }

  const runningContainers :any[] = await docker.listContainers({Labels: {
    "container.mtfm.io/id": args.id,
  }});
  // console.log('runningContainers', runningContainers.length);

  // console.log('createOptions', createOptions);




  const finish = async () => {
    try {
      createOptions.image = await ensureDockerImage({image});
    } catch (err) {
      console.error('💥 ensureDockerImage error', err);
      result.error = `Failure to pull or build the docker image:  ${err?.message}`;
      return result;
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
    }

    const dataWait = await container!.wait();

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
    return killResult;
  }
};

// assume that no images are deleted while we are running
const CACHED_DOCKER_IMAGES: { [key: string]: boolean } = {};


const ensureDockerImage = async (args:{
  image: string,
  pullOptions?: any
}): Promise<string> => {
  let { image, pullOptions } = args;
  
  if (!image) {
    throw new Error("ensureDockerImage missing image");
  }
  
  let gitRepoUrl: string | undefined;
  if (image.startsWith("git@") || image.startsWith("https://")) {
    gitRepoUrl = image;
    image = generateDockerImageTag(image);
  }

  // console.log(`👀 ensureDockerImage: image=${image}  gitRepoUrl=${gitRepoUrl}`)

  if (CACHED_DOCKER_IMAGES[image]) {
    // console.log(`👀 ensureDockerImage: ${image} FOUND IMAGE IN MY FAKE CACHE`)
    // console.log('FOUND IMAGE IN MY FAKE CACHE')
    return image;
  }

  const imageExists = await hasImage(image);
  // console.log(`👀 ensureDockerImage: ${image} imageExists=${imageExists}`)
  // console.log('imageExists', imageExists);
  if (imageExists) {
    CACHED_DOCKER_IMAGES[image] = true;
    return image;
  }

  if (gitRepoUrl) {

    // console.log(`docker.buildImage("", {remote: ${gitRepoUrl}, t:${image}, ...:${pullOptions ? JSON.stringify(pullOptions) : ""}) `)
    // const buildImageStream = await 
    const stream = await docker.buildImage("", {remote: gitRepoUrl, t:image, ...pullOptions});
    
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err:any, res:any) => err ? reject(err) : resolve(res), (progressEvent:Event) => {
        console.log(progressEvent);
      });
    });
    // const buildResultString :string[] = await new Promise<string[]>((resolve, reject) => {
    //   docker.buildImage("", {remote: gitRepoUrl, t:image, ...pullOptions}, (err :any, stream:any) => {
    //     console.log('stream', stream);
    //     const output :string[] = [];
    //     stream.on('data', (data :any) => {
    //       console.log(`BUILD STREAM: ${data.toString()}`)
    //       output.push(data.toString());
    //     });
        
    //     stream.on('end', () => {
    //       resolve(output);
    //     });
        
    //     stream.on('error', (err :any) => {
    //       reject(err);
    //     });
    //   });
    // });
    // console.log('buildImageResult', buildImageResult);
  } else {
    const stream = await docker.pull(image);
    await new Promise<void>((resolve, reject) => {

      function onFinished(err:any, output:any) {
        if (err) {
          console.error('Error during pull:', err);
          reject(err);
          return;
        }
        console.log(`${image} pull complete`);
        resolve()
      }

      function onProgress(event:any) {
        console.log(JSON.stringify(event));
      }

      docker.modem.followProgress(stream, onFinished, onProgress);
    });

    // console.log(`👀 ensureDockerImage: docker pull ${image} complete`)
  }
  return image;
};

const hasImage = async (imageUrl: string): Promise<boolean> => {
  // console.log("hasImage, imageUrl", imageUrl)
  const images = await docker.listImages();
  return images.some((e: any) => {
    return (
      e.RepoTags != null &&
      e.RepoTags.some((tag: string) => {
        return (
          tag != null &&
          dockerUrlMatches(parseDockerUrl(imageUrl), parseDockerUrl(tag))
        );
      })
    );
  });
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
