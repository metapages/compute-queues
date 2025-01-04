import { assertEquals } from "std/assert";

import {
  convertStringToDockerCommand,
  generateDockerImageTag,
} from "/@/queue/utils.ts";

Deno.test("git url to docker image without url fragments", () => {
  const url =
    "https://github.com/metapages/metapage-docker-job-test-run-from-repo.git";
  const dockerTag = generateDockerImageTag(url);
  // TODO: automatically get the git hash
  assertEquals(
    dockerTag,
    "metapages/metapage-docker-job-test-run-from-repo:latest",
  );
});

Deno.test("git url to docker image WITH url fragments", () => {
  const url =
    "https://github.com/metapages/metapage-docker-job-test-run-from-repo.git#3c2df0dd05c0";
  const dockerTag = generateDockerImageTag(url);
  // TODO: automatically get the git hash
  assertEquals(
    dockerTag,
    "metapages/metapage-docker-job-test-run-from-repo:3c2df0dd05c0",
  );
});

Deno.test("parse command strings", () => {
  const command = "echo $FOO";
  const commandArray = convertStringToDockerCommand(command, { FOO: "bar" });
  assertEquals(commandArray, ["echo", "bar"]);
});
