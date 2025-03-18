import { docker } from "/@/queue/dockerClient.ts";

export const DockerJobSharedVolumeName = "metaframe-container-worker-cache";

export const ensureSharedVolume = async () => {
  const vol = docker.getVolume(DockerJobSharedVolumeName);
  // Deno.stdout.writeSync(
  //   new TextEncoder().encode(
  //     `Ensure shared docker volume [${DockerJobSharedVolumeName}]...`,
  //   ),
  // );
  try {
    await vol.inspect();
    // console.log(`exists ✅`);
  } catch (_err) {
    Deno.stdout.writeSync(
      new TextEncoder().encode("creating..."),
    );
    await docker.createVolume({
      Name: DockerJobSharedVolumeName,
      Labels: {
        "container.mtfm.io": "true",
      },
    });
    console.log(
      `Create shared docker volume [${DockerJobSharedVolumeName}] ✅`,
    );
  }
};
