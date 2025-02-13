// Store process references for cleanup
export const processes: {
  dockerd?: Deno.ChildProcess;
} = {};

// Wait for Docker daemon to be ready
export async function waitForDocker() {
  Deno.stdout.writeSync(
    new TextEncoder().encode("Waiting for docker daemon.."),
  );
  while (true) {
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
      if (success) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  console.log("✅");
}
