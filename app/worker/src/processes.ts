// Store process references for cleanup
export const processes: {
  dockerd?: Deno.ChildProcess;
} = {};

// Wait for Docker daemon to be ready
export async function waitForDocker() {
  Deno.stdout.writeSync(
    new TextEncoder().encode("Waiting for docker daemon.."),
  );

  let attempts=0;

  while (attempts < 10) {
    Deno.stdout.writeSync(
      new TextEncoder().encode("."),
    );
    try {
      const curl = new Deno.Command("curl", {
        args: ["-s", "--unix-socket", "/var/run/docker.sock", "http/_ping"],
        stdout: "null",
        stderr: "null",
      });
      const { success } = await curl.output();
      if (success) {
        console.log("✅");
        return;
      }
    } catch (error) {
      console.error(`Attempt ${attempts + 1} failed with error:`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++
  }

  console.log("❌ Failed to reach the docker daemon within the timeout period. Is it running and available at /var/run/docker.sock?");
  Deno.exit(1);
}
