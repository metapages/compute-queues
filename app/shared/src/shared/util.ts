import fetchRetry from 'fetch-retry';
import stringify from 'safe-stable-stringify';

export const shaObject = async (obj :any) :Promise<string> => { 
    const orderedStringFromObject = stringify(obj);
    const msgBuffer = new TextEncoder().encode(orderedStringFromObject);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

export const fetchRobust = fetchRetry(fetch, {
  retries: 8,
  retryDelay: (attempt:number, error:any, response:any) => {
    return Math.pow(2, attempt) * 400; // 500, 1000, 2000, 4000, 5000
  },
  retryOn: (attempt:number, error:any, response:Response | null) => {
    // retry on any network error, or 4xx or 5xx status codes
    if (error !== null || (response && response.status >= 400)) {      
      if (attempt > 7) {
        if (error) {
          console.error(error);
        }
        console.log(`Retried too many times: response.status=${response?.status} response.statusText=${response?.statusText} attempt number ${attempt + 1} url=${response?.url}`);
        return false;
      }
      return true;
    }
    return false;
  },
});

export const encodeOptions = (options :any) :string => {
  const text :string = stringify(options) || "";
  var b64 = btoa(encodeURIComponent(text));
  return b64;
};

export const capitalize = (str: string): string => {
  if (!str.length) return str;
  return str[0].toUpperCase() + str.slice(1, str.length);
}