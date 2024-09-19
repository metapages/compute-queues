import { useHashParamBoolean } from '@metapages/hash-query';

export const useOptionJobsStartAutomatically = () => {
  const [jobsStartAutomatically, setJobsStartAutomatically] = useHashParamBoolean("autostart");
  return[ jobsStartAutomatically, setJobsStartAutomatically ];
};
