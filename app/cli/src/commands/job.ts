import { Command } from 'cliffy';

import { jobAdd } from './jobAdd.ts';
import { jobAwait } from './jobAwait.ts';

export const jobCommand = new Command()
  .description("Commands for submitting and monitoring jobs to the API server")
  .action(function () {
    this.showHelp();
  })
  .command("add", jobAdd)
  .reset()
  .command("await", jobAwait);
