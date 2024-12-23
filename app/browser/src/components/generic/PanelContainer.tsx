import React from "react";

import { useStyleConfig, VStack } from "@chakra-ui/react";

// eslint-disable-next-line
export const PanelContainer: React.FC<any> = (props) => {
  const { size, variant, ...rest } = props;
  const styles = useStyleConfig("PanelContainer", { size, variant });
  return (
    <VStack
      gap={0}
      // border={"1px solid red"}
      minHeight="100vh"
      height="100vh"
      overflow={"hidden"}
      width={"100%"}
      sx={styles}
      {...rest}
    />
  );
};
