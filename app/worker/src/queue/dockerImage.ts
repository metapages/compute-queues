import { docker } from "/@/queue/dockerClient.ts";
import { tgz } from "compress";
import { ensureDir, exists } from "std/fs";
import { dirname, join } from "std/path";
import { decompress } from "zip";

import {
  type ConsoleLogLine,
  type DockerJobImageBuild,
  type JobStatusPayload,
  shaObject,
  type WebsocketMessageSenderWorker,
  WebsocketMessageTypeWorkerToServer,
} from "@metapages/compute-queues-shared";

import { getConfig } from "../config.ts";

// assume that no images are deleted while we are running
const CACHED_DOCKER_IMAGES: { [key: string]: boolean } = {};

let DockerBinPath = "/usr/bin/docker";

const getDockerImageBuildDirectory = () => {
  const config = getConfig();
  return `${config.dataDirectory}/docker-builds`;
};

const getDockerImageBuildDownloadDirectory = () => {
  return `${getDockerImageBuildDirectory()}/downloads`;
};

async function getDockerBinaryPath(): Promise<string> {
  try {
    const process = new Deno.Command("which", {
      args: ["docker"],
    });
    const { code, stdout } = await process.output();

    if (code !== 0) {
      throw new Error("Docker binary not found");
    }

    const path = new TextDecoder().decode(stdout).trim();
    return path;
  } catch (error) {
    console.error("Error finding docker binary:", error);
    throw error;
  }
}

try {
  DockerBinPath = await getDockerBinaryPath();
} catch (error) {
  console.error("Error finding docker binary:", error);
}

export const clearCache = async (args: { build?: DockerJobImageBuild }) => {
  const buildSha = await getBuildSha(args);
  const image = getDockerImageName(buildSha);
  docker.getImage(image).remove({}, (err: unknown, result: unknown) => {
    console.log("docker.image.remove result", result);
    console.log(`docker.image.remove ${`${err}`.split("\n")[0]}`);
  });
};

export const getBuildSha = async (args: {
  image?: string;
  pullOptions?: { [key: string]: unknown };
  build?: DockerJobImageBuild;
}): Promise<string> => {
  const buildSha = await shaObject(args.build);
  const sha = buildSha.substring(0, 32);
  return sha;
};

export const getDockerImageName = (sha: string) => {
  // https://www.civo.com/learn/ttl-sh-your-anonymous-and-ephemeral-docker-image-registry
  return `ttl.sh/${sha}:1d`;
};

export class DockerBuildError extends Error {
  logs?: ConsoleLogLine[];

  constructor(message: string, logs?: ConsoleLogLine[]) {
    super(message);
    this.logs = logs;
  }
}

export const ensureDockerImage = async (args: {
  jobId: string;
  image?: string;
  pullOptions?: { [key: string]: unknown };
  build?: DockerJobImageBuild;
  sender: WebsocketMessageSenderWorker;
}): Promise<string> => {
  // console.log("ensureDockerImage", args);
  // console.log("ensureDockerImage", args);
  let { jobId, image, /* pullOptions, */ build, sender } = args;

  if (!image && !build) {
    throw new DockerBuildError("Missing image or build configuration");
  }

  let imageExists = false;

  if (build) {
    console.log("ensureDockerImage BUILDING...");
    // image name comes from the build arguments so it can be retrieved if
    // already built
    const buildSha = await getBuildSha({ build });

    image = getDockerImageName(buildSha);

    imageExists = await checkForDockerImage({
      jobId,
      image,
      sender,
      platform: build?.platform,
    });
    if (imageExists) {
      console.log("✅ ensureDockerImage: image exists");
      return image;
    }

    if (!image) {
      throw new DockerBuildError("Missing image or build configuration");
    }

    const { dockerfile, context, filename, platform, target /*, buildArgs */ } = build;

    if (!dockerfile && !context) {
      throw new DockerBuildError(
        "Missing Dockerfile or context. Where does the Dockerfile come from?",
      );
    }

    const buildDir = `${getDockerImageBuildDirectory()}/${buildSha}`;
    await ensureDir(buildDir);

    if (context) {
      await downloadContextIntoDirectory({
        jobId,
        context,
        destination: buildDir,
        sender,
      });
      console.log(`✅ ensureDockerImage: downloaded context into ${buildDir}`);
    }

    if (dockerfile) {
      console.log(
        `👀 ensureDockerImage: ${image} building from user Dockerfile`,
      );
      await Deno.writeTextFile(`${buildDir}/Dockerfile`, dockerfile);
      console.log(
        `✅ ensureDockerImage: wrote Dockerfile to ${buildDir}/Dockerfile`,
      );
    }

    try {
      // For the love of me, I cannot get the dockerode buildImage to work
      // So intead, just use the docker cli
      // start the process
      const args = ["build"];

      if (filename) {
        args.push(`--file=${filename}`);
      }
      if (target) {
        args.push(`--target=${target}`);
      }
      if (platform) {
        args.push(`--platform=${platform}`);
      }
      args.push(`--tag=${image}`);
      args.push(".");

      console.log("args", args);

      sender({
        type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
        payload: {
          jobId,
          step: "docker build",
          logs: [[`👉 STARTED docker ${args.join(" ")}`, Date.now()]],
        } as JobStatusPayload,
      });

      const command = new Deno.Command(DockerBinPath, {
        cwd: buildDir,
        // clearEnv: true,
        // env: Record<string, string>
        args,
        stdout: "piped",
        stderr: "piped",
      });
      const process = command.spawn();

      const consoleOut: ConsoleLogLine[] = [];

      (async () => {
        for await (
          const data of process.stdout.pipeThrough(
            new TextDecoderStream(),
          )
        ) {
          // console.log(`DOCKER BUILD stdout: ${data}`);
          const time = Date.now();
          const decodedLines: ConsoleLogLine[] = data.trim().split("\n").map((
            l: string,
          ) => [l, time]);
          decodedLines.forEach((l) => {
            consoleOut.push(l);
          });

          sender({
            type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
            payload: {
              jobId,
              step: "docker build",
              logs: decodedLines,
            } as JobStatusPayload,
          });
        }
      })();

      (async () => {
        for await (
          const data of process.stderr.pipeThrough(
            new TextDecoderStream(),
          )
        ) {
          const time = Date.now();
          const decodedLines: ConsoleLogLine[] = data.trim().split("\n").map((
            l: string,
          ) => [l, time, true]);
          decodedLines.forEach((l) => {
            consoleOut.push(l);
          });

          sender({
            type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
            payload: {
              jobId,
              step: "docker build",
              logs: decodedLines,
            } as JobStatusPayload,
          });
        }
      })();

      const { success, code, signal } = await process.status;

      // console.log("success", success);
      // console.log("status", code);
      // console.log("signal", signal);

      if (!success) {
        console.error(
          `💥 DOCKER BUILD FAILED: ${code} ${signal}\n ${
            consoleOut.map((l) => l[0]).join(
              "\n",
            )
          }`,
        );
        throw new DockerBuildError(
          "Failure to build the docker image",
          consoleOut,
        );
      }

      if (success) {
        try {
          const dockerimage = docker.getImage(image);
          const info: { Size: number } = await dockerimage.inspect();
          CACHED_DOCKER_IMAGES[image!] = true;
          // TODO put this parameter in the cli configuration
          if (info.Size < 536870912) { // 0.5gb
            dockerimage.push({ tag: "1d" }, (err: unknown, stream?: NodeJS.ReadableStream) => {
              try {
                if (err) {
                  console.log(`💥 DOCKER PUSH: ${err}`);
                  return;
                }

                if (!stream) {
                  console.log(`💥 DOCKER PUSH: no stream`);
                  return;
                }

                console.log(`DOCKER PUSHING...`);

                docker.modem.followProgress(
                  stream,
                  (err: unknown, _output: unknown) => {
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
                        logs: [[`${progressEvent}`, Date.now()]],
                      } as JobStatusPayload,
                    });
                  },
                );
              } catch (err) {
                console.error("pushed error", err);
              }
            });
          } else {
            console.log(
              `DOCKER NOT pushing since image is too large: ${info.Size}`,
            );
          }
        } catch (_err) {
          //ignored
        }
      }
      return image;
    } catch (err) {
      console.error("💥 ensureDockerImage error", err);
      throw err;
    }
  } else {
    if (CACHED_DOCKER_IMAGES[image!]) {
      // returning because we think we have already check, but just in case
      // the image has gone missing, we check out-of-band, so retries will
      // work, and validate
      (async () => {
        const imageInfo = docker.getImage(image!);
        try {
          await imageInfo.inspect();
        } catch (_err) {
          delete CACHED_DOCKER_IMAGES[image!];
          console.log(
            `❗ out-of-band check: image ${image} does not exist, so removing it my record`,
          );
        }
      })();
      // console.log("ensureDockerImage I think the image already exists");
      return image!;
    }
    // console.log("ensureDockerImage PULLING bc image and no build");
    const stream = await docker.pull(image!);
    await new Promise<void>((resolve, reject) => {
      function onFinished(err: unknown, _output: unknown) {
        if (err) {
          console.error("Error during pull:", err);
          reject(err);
          return;
        }
        console.log(`${image} pull complete`);
        CACHED_DOCKER_IMAGES[image!] = true;
        resolve();
      }

      function onProgress(event: unknown) {
        sender({
          type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
          payload: {
            jobId,
            step: "docker image pull",
            logs: [[`${JSON.stringify(event)}`, Date.now()]],
          } as JobStatusPayload,
        });
      }

      docker.modem.followProgress(stream, onFinished, onProgress);
    });
  }
  return image!;
};

const checkForDockerImage = async (args: {
  jobId: string;
  image: string;
  sender: WebsocketMessageSenderWorker;
  platform?: string;
}): Promise<boolean> => {
  const { image, sender, jobId, platform } = args;
  // https://github.com/metapages/compute-queues/issues/59
  // if (CACHED_DOCKER_IMAGES[image]) {
  //   // console.log(`👀 ensureDockerImage: ${image} FOUND IMAGE IN MY FAKE CACHE`)
  //   // console.log('FOUND IMAGE IN MY FAKE CACHE')
  //   (async () => {
  //     // But I am going to check out of band, just in case
  //     const existsOutOfBand = await hasImage(image);
  //     if (!existsOutOfBand) {
  //       delete CACHED_DOCKER_IMAGES[image];
  //       console.log(`❗ out-of-band check: image ${image} does not exist, so removing it my record`);
  //     }
  //   })();
  //   return true;
  // }

  const imageExists = await hasImage({ imageUrl: image });
  // console.log(`👀 ensureDockerImage: ${image} imageExists=${imageExists}`)
  // console.log('imageExists', imageExists);
  if (imageExists) {
    CACHED_DOCKER_IMAGES[image] = true;
  }
  if (imageExists) {
    return imageExists;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      docker.pull(image, {
        platform,
      }, function (stream?: NodeJS.ReadableStream) {
        // if (err) {
        //   reject(err);
        //   return;
        // }

        if (stream && typeof stream.on === "function") {
          try {
            docker.modem.followProgress(stream, onFinished, onProgress);
          } catch (followProgressError) {
            console.error("Error in followProgress:", followProgressError);
            // If followProgress fails, we'll still try to resolve
            // The pull might still succeed even if we can't track progress
            resolve();
          }
        } else {
          console.warn("No valid stream received from docker.pull, resolving anyway");
          resolve();
        }

        function onFinished(err: unknown, output: unknown) {
          //output is an array with output json parsed objects
          //...
          if (err) {
            reject(err);
          } else {
            console.log("output", output);
            resolve();
          }
        }
        function onProgress(event: unknown) {
          sender({
            type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
            payload: {
              jobId,
              step: "docker image pull",
              logs: [[`${JSON.stringify(event)}`, Date.now()]],
            } as JobStatusPayload,
          });
          console.log("pull event", event);
        }
      });
    });
  } catch (err: unknown) {
    const is404 = (err as { message?: string })?.message?.includes(
      "HTTP code 404",
    );
    if (!is404) {
      console.error(
        "Didn't wanna pull but isn't just not found:",
        (err as { message?: string })?.message,
      );
    }
  }

  return imageExists;
};

const hasImage = async (
  args: { imageUrl: string },
): Promise<boolean> => {
  const { imageUrl } = args;
  const images = await docker.listImages();
  return images.some((e: { RepoTags: string[] | undefined }) => {
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
    const tokens = registryAndNamespace.split("/");
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

  const url: DockerUrlBlob = {
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

const getDownloadLinkFromContext = async (context: string): Promise<string> => {
  // https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives#source-code-archive-urls
  if (context.endsWith(".tar.gz") || context.endsWith(".zip")) {
    return context;
  } else if (context.startsWith("https://github.com")) {
    // Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
    // const octokit = new Octokit({ auth: `personal-access-token123` });
    const matches = new RegExp(
      /https:\/\/github.com\/([-\w]{1,39})\/([-\w\.]{1,100})(\/(tree|commit)\/([-\/\w\.\}\{\$]{1,100}))?/,
    ).exec(context);
    if (!matches) {
      throw new Error(`Invalid GitHub URL: ${context}`);
    }

    const owner = matches[1];
    const repo = matches[2];
    const ref = matches[5] || "main";

    if (ref?.startsWith("${")) {
      throw new Error(
        `Invalid GitHub URL because injected ref missing: ${ref} in ${context}. Help: https://docs.metapage.io/docs/error-missing-git-sha`,
      );
    }

    const possibleArchiveUrls = [
      `https://github.com/${owner}/${repo.replace(".git", "")}/archive/refs/heads/${ref}.zip`,
      `https://github.com/${owner}/${repo.replace(".git", "")}/archive/${ref}.zip`,
    ];
    if (ref === "main") {
      // check if the repo has a master branch instead of main
      possibleArchiveUrls.push(
        `https://github.com/${owner}/${repo.replace(".git", "")}/archive/refs/heads/master.zip`,
      );
    }

    let archiveUrl = "";
    for (const possibleArchiveUrl of possibleArchiveUrls) {
      const response = await fetch(possibleArchiveUrl, {
        method: "HEAD",
        redirect: "follow",
      });
      if (response.status === 200) {
        archiveUrl = possibleArchiveUrl;
        break;
      }
    }
    return archiveUrl;

    // const octokit = new Octokit();
    // // https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#download-a-repository-archive-tar
    // const redirectUrl = await octokit.request('GET /repos/{owner}/{repo}/tarball/{ref}', {
    //   // https://github.com/octokit/octokit.js/issues/2369#issuecomment-1648744759
    //   request: {
    //     parseSuccessResponseBody: false
    //   },
    //   owner,
    //   repo,
    //   ref,
    //   headers: {
    //     'X-GitHub-Api-Version': '2022-11-28'
    //   }
    // });

    // console.log('redirectURl', redirectUrl);

    // return redirectUrl.url;
  } else {
    // https://github.com/ulysseherbach/harissa
    // const url = new URL(context);
    return context;
  }
};

const getFilePathForDownload = (url: string): string => {
  if (url.startsWith("https://")) {
    return `${getDockerImageBuildDownloadDirectory()}/${url.replace("https://", "")}`;
  } else if (url.startsWith("http://")) {
    return `${getDockerImageBuildDownloadDirectory()}/${url.replace("http://", "")}`;
  }
  throw "Unsupported download link";
};

const downloadContextIntoDirectory = async (args: {
  jobId: string;
  context: string;
  destination: string;
  sender: WebsocketMessageSenderWorker;
}): Promise<void> => {
  const { context, destination, sender, jobId } = args;
  sender({
    type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
    payload: {
      jobId,
      step: "cloning repo",
      logs: [[`Downloading context: ${context}`, Date.now()]],
    } as JobStatusPayload,
  });
  // Download git repo, unpack, and use as context
  // Check if the context is a git repo
  // TODO: for now, just download the context as is
  // First check if the context has been already downloaded
  // ch
  const downloadUrl = await getDownloadLinkFromContext(context);
  const filePathForDownload = getFilePathForDownload(downloadUrl);

  console.log(`downloadContextIntoDirectory downloadUrl=${downloadUrl}`);
  console.log(
    `downloadContextIntoDirectory filePathForDownload=${filePathForDownload}`,
  );
  let file: Deno.FsFile | null = null;
  try {
    const fileExists = await exists(filePathForDownload, {
      isFile: true,
      isReadable: true,
    });
    // console.log(`downloadContextIntoDirectory fileExists=${fileExists}`);
    sender({
      type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
      payload: {
        jobId,
        step: "cloning repo",
        logs: [[`repo file exists...`, Date.now()]],
      } as JobStatusPayload,
    });
    if (!fileExists) {
      sender({
        type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
        payload: {
          jobId,
          step: "cloning repo",
          logs: [[`downloading...`, Date.now()]],
        } as JobStatusPayload,
      });

      // console.log(`downloadContextIntoDirectory downloading...`);
      // TODO: secrets and tokens
      // Create needed headers
      const headers: Record<string, string> = {};
      if (downloadUrl.startsWith("https://api.github.com/")) {
        headers["Accept"] = "application/vnd.github+json";
        headers["X-GitHub-Api-Version"] = "2022-11-28";
      }
      const res = await fetch(downloadUrl, {
        redirect: "follow",
        headers,
      });
      if (res.status !== 200) {
        throw new Error(
          `Failure to download context from ${downloadUrl} [status=${res.status}]:  ${res?.statusText}`,
        );
      }
      if (!res.body) {
        throw new Error(
          `Failure to download context from ${downloadUrl} [status=${res.status}]: missing response body`,
        );
      }
      const pathToFile = dirname(filePathForDownload);
      await ensureDir(pathToFile);
      file = await Deno.open(filePathForDownload, {
        create: true,
        write: true,
      });

      sender({
        type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
        payload: {
          jobId,
          step: "cloning repo",
          logs: [[`created file and piping...`, Date.now()]],
        } as JobStatusPayload,
      });

      // console.log(`downloadContextIntoDirectory created file and piping...`);
      await res.body.pipeTo(file.writable);
      // console.log(`downloadContextIntoDirectory finished piping...`);
      sender({
        type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
        payload: {
          jobId,
          step: "cloning repo",
          logs: [[`finished piping...`, Date.now()]],
        } as JobStatusPayload,
      });
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
          logs: [[`✅ Downloaded context: ${context}`, Date.now()]],
        } as JobStatusPayload,
      });

      console.log(`downloadContextIntoDirectory closed file`);
    } else {
      sender({
        type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
        payload: {
          jobId,
          step: "cloning repo",
          logs: [["✅ Context file already exists", Date.now()]],
        } as JobStatusPayload,
      });
    }
    // uncompress
    const fileExistsAgain = await exists(filePathForDownload, {
      isFile: true,
      isReadable: true,
    });
    console.log("fileExistsAgain", fileExistsAgain);
    // recreate destination
    Deno.removeSync(destination, { recursive: true });
    await ensureDir(destination);
    if (
      filePathForDownload.endsWith(".tar.gz") ||
      filePathForDownload.endsWith(".tgz") ||
      // https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#download-a-repository-archive-tar
      downloadUrl.includes("tarball")
    ) {
      console.log(`tgz.uncompress ${filePathForDownload} into ${destination}`);
      sender({
        type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
        payload: {
          jobId,
          step: "cloning repo",
          logs: [[`tgz uncompressing context: ${context}`, Date.now()]],
        } as JobStatusPayload,
      });
      await tgz.uncompress(filePathForDownload, destination);
      console.log(`tgz.uncompressed`);
    } else if (filePathForDownload.endsWith(".zip")) {
      sender({
        type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
        payload: {
          jobId,
          step: "cloning repo",
          logs: [[`zip uncompressing context: ${context}`, Date.now()]],
        } as JobStatusPayload,
      });
      // https://github.com/moncefplastin07/deno-zip/issues/16#issue-2777397629
      // @ts-ignore Deno.close is not part of Deno 2
      (Deno as { close?: () => void }).close = (Deno as { close?: () => void }).close || function () {};
      await decompress(filePathForDownload, destination);
    } else {
      throw new Error(
        `Downloaded context as ${downloadUrl} but do not know how to convert to a context folder`,
      );
    }
    sender({
      type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
      payload: {
        jobId,
        step: "cloning repo",
        logs: [[`✅ uncompressed context`, Date.now()]],
      } as JobStatusPayload,
    });

    // github downloads create a parent folder with the repo name and branch/tag/commit
    // move the contents of that folder to the destination
    const tempDirectory = `/tmp/${Math.random().toString(36).substring(7)}`;
    const dir = [...Deno.readDirSync(destination)].filter((e) => e.isDirectory)[0].name;

    await Deno.rename(join(destination, dir), tempDirectory);
    await Deno.remove(destination, { recursive: true });
    await Deno.rename(tempDirectory, destination);
    console.log(
      `Moved ${join(destination, dir)} => ${tempDirectory} => ${destination}`,
    );

    sender({
      type: WebsocketMessageTypeWorkerToServer.JobStatusLogs,
      payload: {
        jobId,
        step: "cloning repo",
        logs: [["✅ copied context, ready to build", Date.now()]],
      } as JobStatusPayload,
    });
  } catch (err: unknown) {
    throw new DockerBuildError(
      `Failure to build the docker image context: ${
        err instanceof Error ? err.message : `Unknown error: ${String(err)}`
      }`,
    );
  } finally {
    try {
      file?.close();
    } catch (_) {
      // pass
    }
  }
};
