import fetchRetry from "fetch-retry";
import stringify from "safe-stable-stringify";

// eslint-disable-next-line
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
