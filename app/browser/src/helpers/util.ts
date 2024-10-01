import {
  DockerJobDefinitionMetadata,
  DockerJobDefinitionRow,
  DockerJobState,
  JobInputs,
  StateChangeValueWorkerFinished,
} from '/@/shared';

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
