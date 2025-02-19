import { createDockerClient } from "/@/docker/client.ts";

const { docker: dockerClient, close } = createDockerClient(8343);

Deno.addSignalListener("SIGUSR1", () => {
  console.log("GOT SIGUSR1");
  close();
});

Deno.addSignalListener("SIGTERM", () => {
  console.log("GOT SIGTERM");
  close();
});

// Close all docker connections on exit
globalThis.addEventListener("unload", () => {
  console.log("🔁💥🔁 unload event");
  close();
});

export const docker = dockerClient;
