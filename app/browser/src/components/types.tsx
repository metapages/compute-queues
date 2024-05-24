import { DockerJobDefinitionInputRefs } from '/@/shared';

export type DockerJobDefinitionParamsInUrlHash = Omit<DockerJobDefinitionInputRefs, "inputs">;

// this is the actual job definition consumed by the workers
export interface DockerJobDefinitionMetadata {
  definition: DockerJobDefinitionInputRefs;
  nocache: boolean;
}
