import { useHashParamBoolean } from '@metapages/hash-query';

export const useOptionResolveDataRefs = () => {
  const [resolveDatarefs, setResolveDatarefs] = useHashParamBoolean("resolverefs");
  return[ resolveDatarefs, setResolveDatarefs ];
};
