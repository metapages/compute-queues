import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';

import { jobAdd } from './jobAdd.ts';
import { jobAwait } from './jobAwait.ts';

export const jobCommand = new Command()
  // .name("job")
  .description("Job commands")
  .action(function () {
    this.showHelp();
  })
  .command("add", jobAdd)
  .reset()
  .command("await", jobAwait);
