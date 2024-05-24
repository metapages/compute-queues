import { DockerJobDefinitionProvider } from "./hooks/jobDefinitionHook";
import { ServerStateProvider } from "./hooks/serverStateHook";
import { TabMenu } from "./routes/TabMenu";

export const App: React.FC = () => {
  return (
    <ServerStateProvider>
      <DockerJobDefinitionProvider>
        <TabMenu />
      </DockerJobDefinitionProvider>
    </ServerStateProvider>
  );
};
