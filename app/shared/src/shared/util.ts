import fetchRetry from 'fetch-retry';
import stringify from 'safe-stable-stringify';

// import { DockerJobDefinitionInputRefs } from './types.ts';

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
    return Math.pow(2, attempt) * 500; // 500, 1000, 2000, 4000, 5000
  },
  retryOn: (attempt:number, error:any, response:Response | null) => {
    // retry on any network error, or 4xx or 5xx status codes
    if (error !== null || (response && response.status >= 400)) {
      console.log(`retrying, attempt number ${attempt + 1}`);
      console.error(error);
      // (async() => {
      //   response?.statusText
      // })();
      console.error(response?.statusText);
      return true;
    }
    return false;
  },
});

