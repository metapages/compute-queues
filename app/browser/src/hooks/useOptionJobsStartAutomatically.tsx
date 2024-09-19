import { useHashParamBoolean } from '@metapages/hash-query';
import { ChangeEvent, useCallback } from 'react';

export const useOptionJobsStartAutomatically = () :[boolean, (event: ChangeEvent<HTMLInputElement>) => void] => {
  const [jobsStartAutomatically, setJobsStartAutomatically] = useHashParamBoolean("autostart");
  const toggleJobsStartAutomatically = useCallback((event: ChangeEvent<HTMLInputElement>) :void => {
    setJobsStartAutomatically(!jobsStartAutomatically);
  }, [
    jobsStartAutomatically, setJobsStartAutomatically
  ]);
  return [jobsStartAutomatically, toggleJobsStartAutomatically];
};
