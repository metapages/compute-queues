import { docker } from "/@/queue/dockerClient.ts";

export const DockerJobSharedVolumeName = "worker-job-cache";

export const ensureSharedVolume = async () => {
  const vol = docker.getVolume(DockerJobSharedVolumeName);
  try {
    await vol.inspect();
    console.log(`👍 shared volume exists: ${DockerJobSharedVolumeName}`);
  } catch (_err) {
    await docker.createVolume({
      Name: DockerJobSharedVolumeName,
      Labels: {
        "container.mtfm.io": "true",
      },
    });
    console.log(`✅ Created shared volume: ${DockerJobSharedVolumeName}`);
  }
};
