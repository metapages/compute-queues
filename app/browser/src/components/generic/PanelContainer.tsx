import React from "react";
import { useStyleConfig, VStack } from "@chakra-ui/react";

// eslint-disable-next-line
export const PanelContainer: React.FC<any> = props => {
  const { size, variant, ...rest } = props;
  const styles = useStyleConfig("PanelContainer", { size, variant });
  return <VStack gap={0} sx={styles} {...rest} />;
};
