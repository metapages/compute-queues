import React from "react";
import { Divider, VStack } from "@chakra-ui/react";
import { SectionIO } from "./SectionIO";

export const TabConfigureDefinition: React.FC = () => {
  return (
    <VStack w="100%" alignItems="stretch">
      <VStack alignItems="stretch" width="100%" pb={"2rem"}>
        <VStack p={2} alignItems="stretch" width="100%" gap={"1.5rem"}>
          <Divider />
          <SectionIO />
          <Divider />
        </VStack>
      </VStack>
    </VStack>
  );
};
