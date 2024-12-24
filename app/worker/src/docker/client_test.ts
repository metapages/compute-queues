import { createDockerClient } from "/@/docker/client.ts";

Deno.test("test docker building", async () => {
  const { docker, close } = createDockerClient(3078);
  try {
    const stream = await docker.buildImage("", {
      remote:
        "https://github.com/metapages/metapage-docker-job-test-run-from-repo.git#main",
      t: "metapages/metapage-docker-job-test-run-from-repo",
    });
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(
        stream,
        (err: unknown, res: unknown) => err ? reject(err) : resolve(res),
        (progressEvent: Event) => {
          console.log(progressEvent);
        },
      );
    });
    console.log("Built image");
  } catch (error) {
    console.error("Error building image:", error);
    close();
    throw error;
  }
  close();
});
