import { createDockerClient } from "/@/docker/client.ts";

Deno.addSignalListener("SIGUSR1", () => {
  console.log("GOT SIGUSR1");
});

Deno.addSignalListener("SIGTERM", () => {
  console.log("GOT SIGTERM");
});

const { docker: dockerClient, close } = createDockerClient(8343);
// Close all docker connections on exit
globalThis.addEventListener("unload", () => {
  console.log("🔁💥🔁 unload event");
  close();
});

export const docker = dockerClient;
