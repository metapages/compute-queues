import React from "react";
import { serverWebsocket } from "/@/hooks/serverWebsocket";
import { useDockerJobDefinition } from "/@/hooks/useDockerJobDefinition";
import { useSendJobOutputs } from "/@/hooks/useSendJobOutputs";
import { Main } from "/@/components/Main";

export const App: React.FC = () => {
  // Get the job definition from the URL and metaframe inputs, set in the store
  useDockerJobDefinition();
  // This creates the server websocket connection and gets/sets state on the store
  serverWebsocket();
  // if a job is finished, send the outputs to the metaframe
  useSendJobOutputs();

  return <Main />;
};
