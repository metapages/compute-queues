import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';

import { docker } from '../queue/dockerClient.ts';

export const testCommand = new Command()
  .name("test")
  .description("Test and iterate")
  
  .action(async (options:any) => {
    

    const image = await docker.getImage("deepchemio/deepchem:2.6.1");
    const info = await image.inspect();
    console.log("image", info.Size)

    console.log("Ensure volume")
    const vol = docker.getVolume("worker-job-shared");
    try {
      await vol.inspect();
    } catch(err) {
      console.log("Creating volume")
      await docker.createVolume({
        Name: "worker-job-shared",
        "Labels": {
          "container.mtfm.io": "true",
      },
      });
    }
    const volData = await vol.inspect();
    console.log('volData', volData);
    
  });
