import { useStore } from '../store';

export const useWorkersCount = () => {
  const workers = useStore((state) => state.workers);
  return workers?.workers?.length || 0;
};
