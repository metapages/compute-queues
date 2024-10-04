import React from "react";
import { HStack, Text } from "@chakra-ui/react";
import { useStore } from "../../store";
import { PanelHeaderContainer } from "./PanelHeaderContainer";

interface ConsoleHeaderProps {
  title: string;
  showSplit: boolean;
  showCombine: boolean;
}

export const ConsoleHeader: React.FC<ConsoleHeaderProps> = ({ title, showSplit, showCombine }) => {
  const setRightPanelContext = useStore(state => state.setRightPanelContext);
  const setRunLogs = useStore(state => state.setRunLogs);
  const setBuildLogs = useStore(state => state.setBuildLogs);

  const onSplit = () => {
    setRightPanelContext("stderr");
  };
  const onCombine = () => {
    setRightPanelContext(null);
  };

  const clearLogs = () => {
    setBuildLogs(null);
    setRunLogs(null);
  };
  return (
    <PanelHeaderContainer bg={"gray.100"}>
      <HStack justify={"space-between"} px={3} w={"100%"}>
        <Text fontSize={"0.7rem"}>{title.toUpperCase()}</Text>
        <HStack>
          {showSplit && (
            <Text cursor={"pointer"} fontSize={"0.7rem"} onClick={onSplit}>
              Split
            </Text>
          )}
          {showCombine && (
            <Text cursor={"pointer"} fontSize={"0.7rem"} onClick={onCombine}>
              Combine
            </Text>
          )}
          <Text cursor={"pointer"} fontSize={"0.7rem"} onClick={clearLogs}>
            Clear
          </Text>
        </HStack>
      </HStack>
    </PanelHeaderContainer>
  );
};
