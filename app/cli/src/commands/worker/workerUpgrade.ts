import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';
import { compareVersions } from 'https://deno.land/x/compare_versions/mod.ts';

export const workerUpgrade = new Command()
  .description("Update all workers to a new version")
  .option("-v, --version [version:string]", "Version")
  .action(
    async (
      options: {
        version?: string | undefined | boolean;
      },
    ) => {
      await updateContainers("metapage/metaframe-docker-worker", options?.version as string|undefined);
    }
  );

// Function to execute shell commands
async function runCommand(cmd: string, args: string[], captureOutput = true) {
  const command = new Deno.Command(cmd, {
    args,
    stdout: captureOutput ? "piped" : "inherit",
    stderr: captureOutput ? "piped" : "inherit",
  });

  // const child = command.spawn();

  const { code, stdout, stderr } = await command.output();
  if (captureOutput) {
    // const rawOutput = await process.output();
    // const rawError = await process.stderrOutput();
    // process.close();
    if (code === 0) {
      return new TextDecoder().decode(stdout).trim();
    } else {
      console.error(new TextDecoder().decode(stderr));
      throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
    }
  } else {
    // process.close();
    if (code !== 0) {
      throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
    }
  }
}

// Function to get all running containers
async function getAllRunningContainers() {
  const output = await runCommand("docker",[
    "ps",
    "--format",
    "{{.ID}}:{{.Image}}",
  ]);
  return output ? output.split("\n") : [];
}

// Function to filter running containers by image prefix
async function getRunningContainersByImagePrefix(imagePrefix: string) {
  const containers = await getAllRunningContainers();
  // Filter containers that have the image prefix
  return containers
    .filter((container) => {
      const [, image] = container.split(":");
      return image.startsWith(imagePrefix);
    })
    .map((container) => container.split(":")[0]); // Return container IDs
}

// Function to get container details
async function getContainerDetails(containerId: string) {
  const inspectOutput = await runCommand("docker",[    
    "inspect",
    containerId,
    "--format",
    `
    {
      "Name": "{{.Name}}",
      "Image": "{{.Config.Image}}",
      "Volumes": [
        {{- range $i, $e := .Mounts }}{{if $i}},{{end}}{
          "Source": {{json $e.Source}},
          "Destination": {{json $e.Destination}},
          "Mode": {{json $e.Mode}},
          "RW": {{json $e.RW}}
        }{{ end }}
      ],
      "RestartPolicy": "{{.HostConfig.RestartPolicy.Name}}",
      "Cmd": [{{ range $i, $e := .Config.Cmd }}{{if $i}},{{end}}{{json $e}}{{ end }}]
    }
    `,
  ]);

  const details = JSON.parse(inspectOutput!);
  return details;
}

// Function to start a new container with updated image version
async function startNewContainer(details: any, newImageVersion: string) {
  const newImage = details.Image.split(":")[0] + ":" + newImageVersion;
  const args = [
    "run",
    "-d", // Run detached
    "--name",
    details.Name.substring(1), // Remove leading slash in container name
    "--restart",
    details.RestartPolicy,
    // "--label",
    // "app=my-app", // Keep label or customize as needed
    ...details.Volumes.flatMap((v: any) => ["-v", `${v.Source}:${v.Destination}`]), // Map volumes
    newImage,
    ...details.Cmd, // Start with the same command
  ];

  await runCommand("docker", args, false);
  console.log(`Started new container ${details.Name} with image ${newImage}`);
}

// Function to stop and remove old container
async function stopAndRemoveContainer(containerId: string) {
  await runCommand("docker", ["stop", containerId], false);
  await runCommand("docker", ["rm", containerId], false);
  console.log(`Stopped and removed old container ${containerId}`);
}

// Main function to update containers
async function updateContainers(imagePrefix: string, newVersion?: string) {

  getLatestVersionFromDockerHub
  if (!newVersion) {
    const latestVersion = await getLatestVersionFromDockerHub(imagePrefix);
    if (!latestVersion) {
      console.error(`Failed to fetch the latest version for image: ${imagePrefix}`);
      return;
    }
    newVersion = latestVersion;
  }
  const runningContainers = await getRunningContainersByImagePrefix(imagePrefix);  
  for (const containerId of runningContainers) {
    const details = await getContainerDetails(containerId);
    const currentVersion = details.Image.split(":")[1];
    if (currentVersion !== newVersion) {
      
      // Stop and remove old container
      await stopAndRemoveContainer(containerId);

      // Start new container with updated version
      await startNewContainer(details, newVersion);
    } else {
      console.log(`Container ${details.Name} is already using version ${newVersion}`);
    }
  }
}

// Function to fetch the latest version from DockerHub
async function getLatestVersionFromDockerHub(imageName: string): Promise<string | null> {
  // DockerHub API URL for listing tags
  const url = `https://registry.hub.docker.com/v2/repositories/${imageName}/tags?page_size=100`;

  try {
    // Fetch the tag information from DockerHub
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch tags from DockerHub for image: ${imageName}`);
      return null;
    }

    // Parse the response to extract tag names
    const data = await response.json();
    let tags = data.results.map((tag: any) => tag.name);

    if (tags.length === 0) {
      console.warn(`No tags found for image: ${imageName}`);
      return null;
    }

    tags = tags.filter((tag: string) => tag.match(/^\d+\.\d+\.\d+$/)); // Filter out non-semver tags

    // Use your semver comparison function to get the latest version
    const latestVersion = getLatestSemverVersion(tags);
    return latestVersion;
  } catch (error:any) {
    console.error(`Error fetching tags from DockerHub: ${error.message}`);
    return null;
  }
}

// Dummy semver comparison function for illustration; replace with your own implementation
function getLatestSemverVersion(versions: string[]): string {
  // Assuming you have a function that sorts and finds the latest semver version.
  return versions.sort((a, b) => compareVersions(a, b)).pop() || "";
}