import { useDockerJobDefinition } from './hooks/jobDefinitionHook';
import { serverWebsocket } from './hooks/serverWebsocket';
// import { TabMenu } from './routes/TabMenu';
import { Main } from "/@/routes/Main";

export const App: React.FC = () => {
  // This creates the server websocket connection and gets/sets state on the store
  serverWebsocket();
  // Get the job definition from the URL and metaframe inputs, set in the store
  useDockerJobDefinition();
  return (
    <Main />
  );
};
