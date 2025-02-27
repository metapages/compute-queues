import { docker } from "/@/queue/dockerClient.ts";

export const DockerNetworkForJobs = "metaframe-container-worker-network";

export const ensureIsolateNetwork = async (log: boolean = true) => {
  const network = docker.getNetwork(DockerNetworkForJobs);
  if (log) {
    Deno.stdout.writeSync(
      new TextEncoder().encode(
        `Ensure docker network [${DockerNetworkForJobs}]...`,
      ),
    );
  }
  try {
    await network.inspect();
    if (log) {
      console.log(`exists ✅`);
    }
  } catch (_err) {
    if (log) {
      Deno.stdout.writeSync(new TextEncoder().encode("creating..."));
    } else {
      console.log("Re-creating network, it might have been deleted by docker");
    }
    await docker.createNetwork({
      Name: DockerNetworkForJobs,
      Driver: "bridge",
      // Internal: false, // Setting to true would block internet access
      EnableIPv6: false,
      Options: {
        "com.docker.network.bridge.enable_ip_masquerade": "true", // Enables internet access
        "com.docker.network.bridge.enable_icc": "false", // Disables inter-container communication
      },
      Labels: {
        "container.mtfm.io": "true",
      },
    });
    if (log) {
      console.log(`✅`);
    }
  }
};
