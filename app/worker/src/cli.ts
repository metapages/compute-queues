import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';

import { runCommand } from './commands/run.ts';

// running in docker doesn't automatically kill on ctrl-c
// https://github.com/nodejs/node/issues/4182
Deno.addSignalListener("SIGINT", () => {
  console.log("Maybe do some cleanup? Tell the server we are exiting?");
  console.log("SIGINT exiting...");
  Deno.exit(0);
});



Deno.addSignalListener("SIGTERM", () => {
  console.log("Maybe do some cleanup? Tell the server we are exiting?");
  console.log("SIGINT exiting...");
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
    // end sub-commands
    
    .reset()
    .action(function () {
      this.showHelp();
    })
    
    .parse(Deno.args);



    