import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';

import { workerUpgrade } from './workerUpgrade.ts';

export const workerCommand = new Command()
  .description("Worker commands")
  .action(function () {
    this.showHelp();
  })
  .command("upgrade", workerUpgrade);
