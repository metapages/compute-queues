/**
 * Utility functions for GPU detection and testing
 */

/**
 * Check if the host system has NVIDIA GPUs available
 * This function attempts multiple detection methods:
 * 1. Check if nvidia-smi command is available and working
 * 2. Check for NVIDIA device files in /dev
 * 3. Check for NVIDIA driver modules
 */
export async function hasGpusAvailable(): Promise<boolean> {
  try {
    // Method 1: Try nvidia-smi command
    const nvidiaSmiCheck = await checkNvidiaSmi();
    if (nvidiaSmiCheck) {
      return true;
    }

    // Method 2: Check for NVIDIA device files
    const deviceFilesCheck = await checkNvidiaDeviceFiles();
    if (deviceFilesCheck) {
      return true;
    }

    // Method 3: Check for NVIDIA driver modules
    const driverModulesCheck = await checkNvidiaDriverModules();
    if (driverModulesCheck) {
      return true;
    }

    return false;
  } catch (error) {
    console.log(`GPU detection failed: ${error}`);
    return false;
  }
}

/**
 * Check if nvidia-smi command is available and returns GPU information
 */
async function checkNvidiaSmi(): Promise<boolean> {
  try {
    const command = new Deno.Command("nvidia-smi", {
      args: ["--query-gpu=count", "--format=csv,noheader,nounits"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout } = await command.output();

    if (code === 0) {
      const output = new TextDecoder().decode(stdout).trim();
      const gpuCount = parseInt(output, 10);
      return !isNaN(gpuCount) && gpuCount > 0;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check for NVIDIA device files in /dev
 */
async function checkNvidiaDeviceFiles(): Promise<boolean> {
  try {
    // Check for main NVIDIA control device
    const nvidiaCtl = await Deno.stat("/dev/nvidiactl").catch(() => null);
    if (!nvidiaCtl) {
      return false;
    }

    // Check for at least one GPU device
    for (let i = 0; i < 8; i++) {
      try {
        await Deno.stat(`/dev/nvidia${i}`);
        return true; // Found at least one GPU device
      } catch {
        continue;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if NVIDIA driver modules are loaded
 */
async function checkNvidiaDriverModules(): Promise<boolean> {
  try {
    const command = new Deno.Command("lsmod", {
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout } = await command.output();

    if (code === 0) {
      const output = new TextDecoder().decode(stdout);
      return output.includes("nvidia");
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Skip test if no GPUs are available
 * This function should be called at the beginning of GPU tests
 */
export function skipIfNoGpus(testName: string) {
  return async () => {
    const hasGpus = await hasGpusAvailable();
    if (!hasGpus) {
      console.log(`⏭️  Skipping "${testName}" - No GPUs detected on host system`);
      return;
    }

    throw new Error("This function should be used with conditional test execution");
  };
}

/**
 * Get the number of available GPUs on the system
 */
export async function getGpuCount(): Promise<number> {
  try {
    const command = new Deno.Command("nvidia-smi", {
      args: ["--query-gpu=count", "--format=csv,noheader,nounits"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout } = await command.output();

    if (code === 0) {
      const output = new TextDecoder().decode(stdout).trim();
      const gpuCount = parseInt(output, 10);
      return !isNaN(gpuCount) ? gpuCount : 0;
    }

    return 0;
  } catch {
    return 0;
  }
}
