import fetchRetry from "fetch-retry";
import stringify from "safe-stable-stringify";
import { create } from "mutative";
import { DataRef, DockerJobDefinitionInputRefs } from "./types.ts";

export const shaDockerJob = async (job: DockerJobDefinitionInputRefs): Promise<string> => {

  const jobReadyForSha = create(job, (draft :DockerJobDefinitionInputRefs) => {
    // Remove any presignedurl/... from the URLs
    const configFiles = draft.configFiles;
    if (configFiles) {
      Object.keys(configFiles).forEach(key => {
        if (configFiles[key].type === "url" && (configFiles[key] as DataRef<string>)?.value.includes("/presignedurl/")) {
          const tokens = (configFiles[key] as DataRef<string>).value.split("/presignedurl/");
          configFiles[key].value = tokens[0];
        }
      });
    }

    // Remove any presignedurl/... from the URLs
    const inputs = draft.inputs;
    if (inputs) {
      Object.keys(inputs).forEach(key => {
        if (inputs[key].type === "url" && (inputs[key] as DataRef<string>)?.value.includes("/presignedurl/")) {
          const tokens = (inputs[key] as DataRef<string>).value.split("/presignedurl/");
          inputs[key].value = tokens[0];
        }
      });
    }
  });

  return shaObject(jobReadyForSha);
};

export const shaObject = async (obj: any): Promise<string> => {
  const orderedStringFromObject = stringify(obj);
  const msgBuffer = new TextEncoder().encode(orderedStringFromObject);
  return sha256Buffer(msgBuffer);
};

export const sha256Buffer = async (buffer: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
};

export const fetchRobust = fetchRetry(fetch, {
  retries: 8,
  // eslint-disable-next-line
  retryDelay: (attempt: number, _error: any, _response: any) => {
    return Math.pow(2, attempt) * 400; // 500, 1000, 2000, 4000, 5000
  },
  // eslint-disable-next-line
  retryOn: (attempt: number, error: any, response: Response | null) => {
    // retry on any network error, or 4xx or 5xx status codes
    if (error !== null || (response && response.status >= 400)) {
      if (attempt > 7) {
        if (error) {
          console.error(error);
        }
        console.log(
          `Retried too many times: response.status=${response?.status} response.statusText=${response?.statusText} attempt number ${attempt + 1} url=${response?.url}`,
        );
        return false;
      }
      return true;
    }
    return false;
  },
});
