import { Command } from "cliffy/command";

import { jobAdd } from "/@/commands/jobAdd.ts";
import { jobAwait } from "/@/commands/jobAwait.ts";

export const jobCommand = new Command()
  .description("Commands for submitting and monitoring jobs to the API server")
  .action(function () {
    this.showHelp();
  })
  .command("add", jobAdd)
  .reset()
  .command("await", jobAwait);
