import { useServerState } from './serverStateHook';

export const useWorkersCount = () => {
  const {workers} = useServerState();
  return workers?.workers?.length || 0;
};
