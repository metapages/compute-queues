import { Command } from "@cliffy/command";

import { jobCommand } from "./commands/job.ts";
import { workerCommand } from "./commands/worker/worker.ts";

await new Command()
  .description("Metapage compute CLI")
  .name("mtpg")
  .version("v1.0.0")
  .help({
    types: false,
    hints: false,
    // colors: true,
    // long: false,
  })
  .env(
    "API_SERVER_ADDRESS=<value:string>",
    "Custom API queue server",
    {
      global: true,
      required: false,
    },
  )
  .action(function () {
    this.showHelp();
  })
  // Put all the sub-commands here
  .command("job", jobCommand)
  .command("worker", workerCommand)
  // end sub-commands

  .reset()
  .action(function () {
    this.showHelp();
  })
  .parse(Deno.args);
