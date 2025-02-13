import { Command } from "@cliffy/command";

import { runCommand } from "/@/commands/run.ts";
import { testCommand } from "/@/commands/test.ts";
import { processes } from "/@/processes.ts";

const args = Deno.args;

// running in docker doesn't automatically kill on ctrl-c
// https://github.com/nodejs/node/issues/4182
Deno.addSignalListener("SIGINT", () => {
  console.log("SIGINT Cleaning up processes...");
  if (processes.dockerd) {
    processes.dockerd.kill("SIGINT");
  }
  Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", () => {
  console.log("SIGTERM Cleaning up processes...");
  if (processes.dockerd) {
    processes.dockerd.kill("SIGTERM");
  }
  Deno.exit(0);
});

await new Command()
  .description("Commands for running a metapage worker")
  .name("worker")
  .version("v1.0.0")
  .help({
    types: false,
    hints: false,
  })
  .action(function () {
    this.showHelp();
  })
  // Put all the sub-commands here
  .command("run", runCommand)
  .command("test", testCommand)
  // end sub-commands
  .reset()
  .action(function () {
    this.showHelp();
  })
  .parse(args);
