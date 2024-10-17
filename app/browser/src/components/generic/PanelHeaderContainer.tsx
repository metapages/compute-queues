import React from "react";
import { Flex, useStyleConfig } from "@chakra-ui/react";

// eslint-disable-next-line
export const PanelHeaderContainer: React.FC<any> = props => {
  const { size, variant, ...rest } = props;
  const styles = useStyleConfig("PanelHeaderContainer", { size, variant });
  return <Flex zIndex={2} w={"100%"} h={6} sx={styles} {...rest} />;
};
