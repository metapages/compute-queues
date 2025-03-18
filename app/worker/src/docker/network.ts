import { docker } from "/@/queue/dockerClient.ts";

export const DockerNetworkForJobs = "metaframe-container-worker-network";

export const ensureIsolateNetwork = async () => {
  const network = docker.getNetwork(DockerNetworkForJobs);
  try {
    await network.inspect();
  } catch (_err) {
    Deno.stdout.writeSync(
      new TextEncoder().encode(
        "Re-creating network, it might have been deleted by docker...",
      ),
    );
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
    console.log(`✅`);
  }
};
