import { Command } from "@cliffy/command";

import { workerUpgrade } from "/@/commands/worker/workerUpgrade.ts";

export const workerCommand = new Command()
  .description("Worker commands")
  .action(function () {
    this.showHelp();
  })
  .command("upgrade", workerUpgrade);
