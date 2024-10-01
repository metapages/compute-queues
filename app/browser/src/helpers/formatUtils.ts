import stringify from "safe-stable-stringify";
import {
  DockerJobDefinitionMetadata,
  DockerJobDefinitionRow,
  DockerJobState,
  InputsRefs,
  JobInputs,
  StateChangeValueWorkerFinished,
} from "/@/shared";

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

export const getInputsCount = (
  currentJobDefinition: DockerJobDefinitionMetadata | undefined,
  hashParamInputs: JobInputs | undefined,
) => {
  const incomingInputsCount = currentJobDefinition?.definition?.inputs
    ? Math.max(
        0,
        Object.keys(currentJobDefinition.definition.inputs).length -
          (hashParamInputs ? Object.keys(hashParamInputs).length : 0),
      )
    : 0;
  return incomingInputsCount;
};

export const getDynamicInputs = (
  currentJobDefinition: DockerJobDefinitionMetadata | undefined,
  hashParamInputs: JobInputs | undefined,
): InputsRefs => {
  const inputs: InputsRefs = { ...currentJobDefinition.definition?.inputs };
  for (const key of Object.keys(hashParamInputs || {})) {
    delete inputs[key];
  }
  return inputs;
};

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
