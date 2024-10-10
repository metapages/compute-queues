import { Command } from 'cliffy';

import { workerUpgrade } from './workerUpgrade.ts';

export const workerCommand = new Command()
  .description("Worker commands")
  .action(function () {
    this.showHelp();
  })
  .command("upgrade", workerUpgrade);
