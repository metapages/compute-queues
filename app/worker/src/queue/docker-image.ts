import {
  ensureDir,
  exists,
} from 'https://deno.land/std@0.224.0/fs/mod.ts';
import { dirname } from 'https://deno.land/std@0.224.0/path/dirname.ts';
// import getFiles from 'https://deno.land/x/getfiles@v1.0.0/mod.ts';
// import {
//   mergeReadableStreams,
// } from 'https://deno.land/std@0.224.0/streams/merge_readable_streams.ts';
import { tgz } from 'https://deno.land/x/compress@v0.4.5/mod.ts';
import { decompress } from 'https://deno.land/x/zip@v1.2.5/mod.ts';

import { JobStatusPayload } from '../../../shared/src/mod.ts';
import {
  DockerJobImageBuild,
  shaObject,
  WebsocketMessageSenderWorker,
  WebsocketMessageTypeWorkerToServer,
} from '../shared/mod.ts';
import { docker } from './dockerClient.ts';

// assume that no images are deleted while we are running
const CACHED_DOCKER_IMAGES: { [key: string]: boolean } = {};

const ROOT_BUILD_DIR = "/tmp/docker-builds";
const ROOT_BUILD_DIR_DOWNLOADS = `${ROOT_BUILD_DIR}/downloads`;

export const clearCache = async (args: {build?: DockerJobImageBuild}) => {
  const buildSha = await getBuildSha(args);
  const image = getDockerImageName(buildSha);
  docker.getImage(image).remove({}, (err:any, result:any) => {
    console.log('docker.image.remove result', result);  
    console.log('docker.image.remove err', err);
  });

}


export const getBuildSha = async (args: {
  image?: string;
  pullOptions?: any;
  build?: DockerJobImageBuild;
}): Promise<string> => {
  const buildSha = await shaObject(args.build);
  const sha = buildSha.substring(0, 32);
  return sha;
}

export const getDockerImageName = (sha :string) => {
  // https://www.civo.com/learn/ttl-sh-your-anonymous-and-ephemeral-docker-image-registry
  return `ttl.sh/${sha}:1d`;
}

export const ensureDockerImage = async (args: {
  jobId: string;
  image?: string;
  pullOptions?: any;
  build?: DockerJobImageBuild;
  sender: WebsocketMessageSenderWorker;
}): Promise<string> => {
  console.log("ensureDockerImage", args);
  let { jobId, image, pullOptions, build, sender } = args;

  if (!image && !build) {
    throw new Error("Missing image or build configuration");
  }

  let imageExists = false;

  if (build) {
    console.log("ensureDockerImage BUILDING");
    // image name comes from the build arguments so it can be retrieved if
    // already built
    const buildSha = await getBuildSha({build});
    // image = `worker-image:${buildSha.substring(0, 12)}`;
    
    // const imageSha = buildSha.substring(0, 32);
    image = getDockerImageName(buildSha);

    imageExists = false; //await checkForDockerImage(image);
    if (imageExists) {
      return image;
    }

    const { dockerfile, context, filename, target, buildArgs } = build;

    if (!dockerfile && !context) {
      throw new Error(
        "Missing Dockerfile or context. Where does the Dockerfile come from?"
      );
    }

    const buildDir = `${ROOT_BUILD_DIR}/${buildSha}`;
    await ensureDir(buildDir);

    if (context) {
      await downloadContextIntoDirectory({jobId, context, destination:buildDir, sender});
      console.log(`✅ ensureDockerImage: downloaded context into ${buildDir}`);
    }

    if (dockerfile) {
      console.log(
        `👀 ensureDockerImage: ${image} building from user Dockerfile`
      );
      await Deno.writeTextFile(`${buildDir}/Dockerfile`, dockerfile);
      console.log(
        `✅ ensureDockerImage: wrote Dockerfile to ${buildDir}/Dockerfile`
      );
    }

    try {
      // For the love of me, I cannot get the dockerode buildImage to work
      // So intead, just use the docker cli
      // start the process
      const command = new Deno.Command("docker", {
        cwd: buildDir,
        clearEnv: true,
        // env: Record<string, string>
        args: ["build", `--tag=${image}`, "."],
        stdout: "piped",
        stderr: "piped",
      });
      const process = command.spawn();

      (async () => {
        for await (const data of process.stdout.pipeThrough(new TextDecoderStream())) {
          // console.log(`DOCKER BUILD stdout: ${data}`);
          const time = Date.now();
          sender({
            type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
            payload: {
              jobId,
              step: "docker build",
              logs: data.trim().split("\n").map((l) => ({time, type: "stdout", val:l.trim()})),
            } as JobStatusPayload,
          });
        }
      })();

      (async () => {
        for await (const data of process.stderr.pipeThrough(new TextDecoderStream())) {
          // console.log(`DOCKER BUILD stderr: ${data}`);
          const time = Date.now();
          sender({
            type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
            payload: {
              jobId,
              step: "docker build",
              logs: data.trim().split("\n").map((l) => ({time, type: "stderr", val:l.trim()})),
            } as JobStatusPayload,
          });
        }
      })();

      const { success, code, signal } = await process.status;

      console.log("success", success);
      console.log("status", code);
      console.log("signal", signal);

      if (success) {
        try {
          
          const dockerimage = docker.getImage(image);
          dockerimage.push({tag: '1d'}, (err:any, stream:any) => {
            try {
              if (err) {
                console.log(`💥 DOCKER PUSH: ${err}`);  
              }
              
              console.log(`DOCKER PUSHING...`);

              docker.modem.followProgress(
                stream,
                (err: any, output: any) => {
                  if (err) {
                    console.log(`💥 DOCKER PUSH: ${err}`);  
                    return;
                  }
                  // console.log(`DOCKER PUSH:`, output);
                  
                },
                (progressEvent: Event) => {
                  console.log(progressEvent);
                  
                  sender({
                    type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
                    payload: {
                      jobId,
                      step: "docker image push",
                      logs: [
                        {
                          time: Date.now(),
                          type: "event",
                          val: progressEvent,
                        },
                      ],
                    } as JobStatusPayload,
                  });
                }
              );


            

            } catch(err) {
              console.error("pushed error", err);
            }
          }) 
        } catch (err) {
          //ignored
        }
      }


      // let allFiles = getFiles(buildDir).map((f) =>
      //   f.path.replace(buildDir + "/", "")
      // );
      // console.log("allFiles", allFiles);
      // const stream = await docker.buildImage(
      //   { context: buildDir, src: allFiles },
      //   { t: image }
      // );

      // console.log("stream from docker.buildImage...")

      // await new Promise<void>((resolve, reject) => {
      //   docker.modem.followProgress(
      //     stream,
      //     (err: any, output: any) => {
      //       if (err) {
      //         reject(err);
      //         return;
      //       }
      //       console.log(output);
      //       resolve();
      //     },
      //     (progressEvent: Event) => {
      //       console.log(progressEvent);
      //     }
      //   );
      // });
      CACHED_DOCKER_IMAGES[image] = true;
      return image;
    } catch (err) {
      console.error("💥 ensureDockerImage error", err);
      throw err;
    }

    // let gitRepoUrl: string | undefined;
    // if (image.startsWith("git@") || image.startsWith("https://")) {
    //   gitRepoUrl = image;
    //   image = generateDockerImageTag(image);
    // }

    // // console.log(`👀 ensureDockerImage: image=${image}  gitRepoUrl=${gitRepoUrl}`)

    // if (CACHED_DOCKER_IMAGES[image]) {
    //   // console.log(`👀 ensureDockerImage: ${image} FOUND IMAGE IN MY FAKE CACHE`)
    //   // console.log('FOUND IMAGE IN MY FAKE CACHE')
    //   return image;
    // }

    // const imageExists = await hasImage(image);
    // // console.log(`👀 ensureDockerImage: ${image} imageExists=${imageExists}`)
    // // console.log('imageExists', imageExists);
    // if (imageExists) {
    //   CACHED_DOCKER_IMAGES[image] = true;
    //   return image;
    // }

    // if (gitRepoUrl) {

    //   // console.log(`docker.buildImage("", {remote: ${gitRepoUrl}, t:${image}, ...:${pullOptions ? JSON.stringify(pullOptions) : ""}) `)
    //   // const buildImageStream = await
    //   const stream = await docker.buildImage("", {remote: gitRepoUrl, t:image, ...pullOptions});

    //   await new Promise((resolve, reject) => {
    //     docker.modem.followProgress(stream, (err:any, res:any) => err ? reject(err) : resolve(res), (progressEvent:Event) => {
    //       console.log(progressEvent);
    //     });
    //   });
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
    console.log("ensureDockerImage PULLING bc image and no build");
    const stream = await docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      function onFinished(err: any, output: any) {
        if (err) {
          console.error("Error during pull:", err);
          reject(err);
          return;
        }
        console.log(`${image} pull complete`);
        resolve();
      }

      function onProgress(event: any) {
        sender({
          type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
          payload: {
            jobId,
            step: "docker image pull",
            logs: [
              {
                time: Date.now(),
                type: "event",
                val: event,
              },
            ],
          } as JobStatusPayload,
        });
        // console.log(JSON.stringify(event));
      }

      docker.modem.followProgress(stream, onFinished, onProgress);
    });
    CACHED_DOCKER_IMAGES[image!] = true;

    // console.log(`👀 ensureDockerImage: docker pull ${image} complete`)
  }
  return image!;
};

const checkForDockerImage = async (args: {jobId: string, image: string, sender: WebsocketMessageSenderWorker}): Promise<boolean> => {
  const {image, sender, jobId} = args;
  if (CACHED_DOCKER_IMAGES[image]) {
    // console.log(`👀 ensureDockerImage: ${image} FOUND IMAGE IN MY FAKE CACHE`)
    // console.log('FOUND IMAGE IN MY FAKE CACHE')
    return true;
  }

  const imageExists = await hasImage(image);
  // console.log(`👀 ensureDockerImage: ${image} imageExists=${imageExists}`)
  // console.log('imageExists', imageExists);
  if (imageExists) {
    CACHED_DOCKER_IMAGES[image] = true;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      docker.pull(image, function (err: any, stream: any) {

        if (err) {
          reject(err);
          return;
        }

        if (stream) {
          docker.modem.followProgress(stream, onFinished, onProgress);
        }

        function onFinished(err: any, output: any) {
          //output is an array with output json parsed objects
          //...
          if (err) {
            reject(err);
          } else {
            console.log("output", output);
            resolve();
          }
        }
        function onProgress(event: any) {
          sender({
            type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
            payload: {
              jobId,
              step: "docker image pull",
              logs: [{time:Date.now(), type: "event", val:event}],
            } as JobStatusPayload,
          });
          console.log("pull event", event);
        }
      });
    });
  } catch (err) {
    console.error("Didn't wanna pull", err)
  }

  return imageExists;
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

const getDownloadLinkFromContext = (context: string): string => {
  // https://github.com/ulysseherbach/harissa
  // const url = new URL(context);
  return context;
};

const getFilePathForDownload = (url: string): string => {
  if (url.startsWith("https://")) {
    return `${ROOT_BUILD_DIR_DOWNLOADS}/${url.replace("https://", "")}`;
  } else if (url.startsWith("http://")) {
    return `${ROOT_BUILD_DIR_DOWNLOADS}/${url.replace("http://", "")}`;
  }
  throw "Unsupported download link";
  return "";
};

const downloadContextIntoDirectory = async (args:{
  jobId: string,
  context: string,
  destination: string,
  sender: WebsocketMessageSenderWorker
}): Promise<void> => {
  const { context, destination, sender, jobId } = args;
  sender({
    type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
    payload: {
      jobId,
      step: "cloning repo",
      logs: [{time:Date.now(), type: "event", val:`Downloading context: ${context}`}],
    } as JobStatusPayload,
  });
  // Download git repo, unpack, and use as context
  // Check if the context is a git repo
  // TODO: for now, just download the context as is
  // First check if the context has been already downloaded
  // ch
  const downloadUrl = getDownloadLinkFromContext(context);
  const filePathForDownload = getFilePathForDownload(downloadUrl);

  console.log(`downloadContextIntoDirectory downloadUrl=${downloadUrl}`);
  console.log(
    `downloadContextIntoDirectory filePathForDownload=${filePathForDownload}`
  );
  let file :Deno.FsFile|null = null;
  try {
    const fileExists = await exists(filePathForDownload, {
      isFile: true,
      isReadable: true,
    });
    console.log(`downloadContextIntoDirectory fileExists=${fileExists}`);
    if (!fileExists) {
      console.log(`downloadContextIntoDirectory downloading...`);
      const res = await fetch(downloadUrl, { redirect: "follow" });
      if (res.status !== 200) {
        throw new Error(
          `Failure to download context from ${downloadUrl} [status=${res.status}]:  ${res?.statusText}`
        );
      }
      if (!res.body) {
        throw new Error(
          `Failure to download context from ${downloadUrl} [status=${res.status}]: missing response body`
        );
      }
      const pathToFile = dirname(filePathForDownload);
      await ensureDir(pathToFile);
      file = await Deno.open(filePathForDownload, {
        create: true,
        write: true,
      });
      
      console.log(`downloadContextIntoDirectory created file and piping...`);
      await res.body.pipeTo(file.writable);
      console.log(`downloadContextIntoDirectory finished piping...`);
      try {
        // https://github.com/denoland/deno/issues/14210
        file.close();
      } catch (_) {
        // pass
      }
      sender({
        type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
        payload: {
          jobId,
          step: "cloning repo",
          logs: [{time:Date.now(), type: "event", val:`✅ Downloaded context: ${context}`}],
        } as JobStatusPayload,
      });

      console.log(`downloadContextIntoDirectory closed file`);
    } else {
      sender({
        type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
        payload: {
          jobId,
          step: "cloning repo",
          logs: [{time:Date.now(), type: "event", val:`Context file already exists`}],
        } as JobStatusPayload,
      });
    }
    // uncompress
    const fileExistsAgain = await exists(filePathForDownload, {
      isFile: true,
      isReadable: true,
    });
    console.log("fileExistsAgain", fileExistsAgain);
    if (
      filePathForDownload.endsWith(".tar.gz") ||
      filePathForDownload.endsWith(".tgz")
    ) {
      console.log(`tgz.uncompress ${filePathForDownload} into ${destination}`);
      await tgz.uncompress(filePathForDownload, destination);
      console.log(`tgz.uncompressed`);
    } else if (filePathForDownload.endsWith(".zip")) {
      await decompress(filePathForDownload, destination);
    } else {
      throw new Error(
        `Downloaded context as ${downloadUrl} but do not know how to convert to a context folder`
      );
    }
    sender({
      type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
      payload: {
        jobId,
        step: "cloning repo",
        logs: [{time:Date.now(), type:"event", val:`✅ copied context, ready to build`}],
      } as JobStatusPayload,
    });
  } catch (err) {
    throw new Error(
      `Failure to build the docker image context: ${err?.message}`
    );
  } finally {
    try {
      file?.close();
    } catch (_) {
      // pass
    }
  }
};
