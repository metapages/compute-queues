import React, { useCallback } from "react";
import { HStack, Text, useToast } from "@chakra-ui/react";
import { useStore } from "../../store";
import { PanelHeaderContainer } from "./PanelHeaderContainer";
import { LogsMode } from "../sections/logs/DisplayLogs";

interface ConsoleHeaderProps {
  title: string;
  showSplit: boolean;
  showCombine: boolean;
  mode: LogsMode;
}

export const ConsoleHeader: React.FC<ConsoleHeaderProps> = ({ title, showSplit, showCombine, mode }) => {
  const setRightPanelContext = useStore(state => state.setRightPanelContext);
  // const setRunLogs = useStore(state => state.setRunLogs);
  // const setBuildLogs = useStore(state => state.setBuildLogs);

  const onSplit = () => {
    setRightPanelContext("stderr");
  };
  const onCombine = () => {
    setRightPanelContext(null);
  };

  // const clearLogs = () => {
  //   setBuildLogs(null);
  //   setRunLogs(null);
  // };

  const copyLogsToClipboard = useStore(state => state.copyLogsToClipboard);
  const toast = useToast();
  const onCopyClick = useCallback(() => {
    copyLogsToClipboard(mode);
    toast({
      position: "bottom-right",
      duration: 2000,
      isClosable: true,
      render: () => (
        <Text p={3} bg="gray.200" color="gray.700" borderRadius="md">
          Logs copied to clipboard
        </Text>
      ),
    });
  }, [mode, copyLogsToClipboard, toast]);

  return (
    <PanelHeaderContainer bg={"gray.100"}>
      <HStack justify={"space-between"} px={3} w={"100%"}>
        <Text fontSize={"0.7rem"}>{title.toUpperCase()}</Text>
        <HStack>
          <Text cursor={"pointer"} fontSize={"0.7rem"} onClick={onCopyClick}>
            Copy
          </Text>

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
          {/* <Text cursor={"pointer"} fontSize={"0.7rem"} onClick={clearLogs}>
            Clear
          </Text> */}
        </HStack>
      </HStack>
    </PanelHeaderContainer>
  );
};
