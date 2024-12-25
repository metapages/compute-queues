import {
  DockerJobDefinitionMetadata,
  DockerJobDefinitionRow,
  DockerJobState,
  InputsRefs,
  StateChangeValueFinished,
} from "/@shared/client";
import stringify from "safe-stable-stringify";

// eslint-disable-next-line
export const encodeOptions = (options: any): string => {
  const text: string = stringify(options) || "";
  const b64 = btoa(encodeURIComponent(text));
  return b64;
};

export const capitalize = (str: string): string => {
  if (!str.length) return str;
  return str[0].toUpperCase() + str.slice(1, str.length);
};

export const getDynamicInputsCount = (currentJobDefinition: DockerJobDefinitionMetadata | undefined) => {
  return currentJobDefinition?.definition?.inputs ? Object.keys(currentJobDefinition.definition.inputs).length : 0;
};

export const getDynamicInputs = (currentJobDefinition: DockerJobDefinitionMetadata | undefined): InputsRefs => {
  return currentJobDefinition?.definition?.inputs || {};
};

export const getOutputs = (job?: DockerJobDefinitionRow) => {
  if (!job?.state || job.state !== DockerJobState.Finished) {
    return {};
  }
  const result = (job.value as StateChangeValueFinished).result;
  if (result && result.outputs) {
    return result.outputs;
  }
  return {};
};
