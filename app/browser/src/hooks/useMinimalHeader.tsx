import { useMediaQuery } from "@chakra-ui/react";

export const useMinimalHeader = () => {
  const [isTallerThan200] = useMediaQuery("(min-height: 200px)");
  return !isTallerThan200;
};
