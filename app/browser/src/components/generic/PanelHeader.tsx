import React from "react";
import { HStack, Text, Icon } from "@chakra-ui/react";
import { X } from "@phosphor-icons/react";
import { useStore } from "../../store";
import { PanelHeaderContainer } from "./PanelHeaderContainer";

interface PanelHeaderProps {
  title: string;
  onSave?: () => void;
  preserveCase?: boolean;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ title, onSave, preserveCase }) => {
  const setRightPanelContext = useStore(state => state.setRightPanelContext);
  const titleText = preserveCase ? title : title.toUpperCase();
  return (
    <PanelHeaderContainer>
      <HStack justify={"space-between"} px={3} w={"100%"}>
        <Text fontSize={"0.7rem"}>{titleText}</Text>
        <HStack>
          {onSave && (
            <Text cursor={"pointer"} fontSize={"0.7rem"} onClick={onSave}>
              Save
            </Text>
          )}
          <Icon boxSize={"1rem"} as={X} onClick={() => setRightPanelContext(null)}></Icon>
        </HStack>
      </HStack>
    </PanelHeaderContainer>
  );
};
