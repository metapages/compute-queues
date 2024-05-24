import { useServerState } from "./serverStateHook";

export const useWorkersCount = () => {
  const serverState = useServerState();
  const state = serverState.state;
  return state?.workers ? state.workers.length : 0;
};
