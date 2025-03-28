import { useHashParam } from "@metapages/hash-query/react-hooks";

export const useMaxJobDuration = (): [string | undefined, (v?: string | undefined) => void] => {
  const [maxJobDuration, setMaxJobDuration] = useHashParam("maxjobduration");
  return [maxJobDuration, setMaxJobDuration];
};
