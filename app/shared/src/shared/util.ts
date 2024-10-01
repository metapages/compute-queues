import fetchRetry from 'fetch-retry';
import stringify from 'safe-stable-stringify';
import {
  DataRef,
  dataRefToBuffer,
  dataRefToDownloadLink,
  DockerJobDefinitionMetadata,
  DockerJobDefinitionRow,
  DockerJobState,
  InputsRefs,
  JobInputs,
  StateChangeValueWorkerFinished,
} from '/@/shared';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

export const shaObject = async (obj :any) :Promise<string> => { 
    const orderedStringFromObject = stringify(obj);
    const msgBuffer = new TextEncoder().encode(orderedStringFromObject);
    return sha256Buffer(msgBuffer);
}

export const sha256Buffer = async (buffer :Uint8Array) :Promise<string> => { 
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
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


export const getInputsCount = (currentJobDefinition: DockerJobDefinitionMetadata | undefined, hashParamInputs: JobInputs | undefined) => {
  const incomingInputsCount = currentJobDefinition?.definition?.inputs ? 
    Math.max(0, Object.keys(currentJobDefinition.definition.inputs).length - (hashParamInputs ? Object.keys(hashParamInputs).length : 0)) :
    0;
  return incomingInputsCount;
}

export const getDynamicInputs = (currentJobDefinition: DockerJobDefinitionMetadata | undefined, hashParamInputs: JobInputs | undefined) :InputsRefs => {
  const inputs :InputsRefs = {...currentJobDefinition.definition?.inputs};
  for (const key of Object.keys(hashParamInputs || {})) {
    delete inputs[key];
  }
  return inputs;
}

export const getOutputs = (job?: DockerJobDefinitionRow) => {
  if (!job?.state || job.state !== DockerJobState.Finished) {
    return {};
  }
  const result = (job.value as StateChangeValueWorkerFinished).result;
  if (result && result.outputs) {
    return result.outputs;
  }
  return {};
};

export const downloadFile = async (name: string, ref: DataRef) => {
  // use dataRefToBuffer?
  const url = await dataRefToDownloadLink(ref);
  // Create a new link element
  const link = document.createElement('a');
  link.href = url;
  link.download = name;

  // Set the link text content for display purposes (optional)
  link.textContent = `Download ${name}`;

  // Append the link to the body (or another container)
  document.body.appendChild(link);

  // Trigger a click on the link to download the file
  link.click();

  // Clean up the URL object after the download
  URL.revokeObjectURL(url);
  document.body.removeChild(link);
}

export const zipAndDownloadDatarefs = async (refs: InputsRefs, name:string) => {
  const blobs :{ blob: Blob; name: string }[] = [];
  for (const [name, ref] of Object.entries(refs)) {
    const buffer = await dataRefToBuffer(ref);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    blobs.push({blob, name});
  }
  zipAndDownloadBlobs(name, blobs);
}

export const zipAndDownloadBlobs = (name:string, blobs: { blob: Blob; name: string }[]) => {
  const zip = new JSZip();

  // Add blobs to zip
  blobs.forEach((blobObj, index) => {
    zip.file(blobObj.name || `file${index + 1}`, blobObj.blob);
  });

  // Generate zip file and trigger download
  zip.generateAsync({ type: "blob" }).then(function (content) {
    // Use FileSaver to save the generated zip
    saveAs(content, `${name}-downloaded-files.zip`);
  });
}

