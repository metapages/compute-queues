import { LockIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftAddon,
  InputRightElement,
  Hide,
} from "@chakra-ui/react";
import { Cloud, Monitor, WifiHigh, WifiSlash } from "@phosphor-icons/react";
import React, { useCallback, useEffect, useState } from "react";
import debounce from "lodash/debounce";
import { useQueue } from "/@/hooks/useQueue";

export const QueueOverrideButtonAndLabel: React.FC = () => {
  const { queue, setQueue, isLocalMode, toggleLocalMode } = useQueue();
  const [inputValue, setInputValue] = useState(queue);

  // Update input value when queue changes
  useEffect(() => {
    setInputValue(queue);
  }, [queue]);

  // Debounced queue update
  const debouncedSetQueue = useCallback(
    debounce((value: string) => {
      setQueue(value);
    }, 1000),
    [setQueue],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      debouncedSetQueue.cancel();
    };
  }, [debouncedSetQueue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    debouncedSetQueue(value);
  };

  return (
    <HStack w="100%" justifyContent="center" spacing={2} py={1} px={1}>
      <HStack maxW="1200px" w="100%" spacing={2} minW="0">
        <HStack gap={0} flexShrink={0} minW="auto">
          <Button
            size="sm"
            aria-label="Remote"
            onClick={toggleLocalMode}
            colorScheme={isLocalMode ? "gray" : "blue"}
            borderRadius="8px 0 0 8px">
            <Cloud weight="bold" />
            <Hide below="md">{"Remote"}</Hide>
          </Button>

          <Button
            size="sm"
            aria-label="Local"
            onClick={toggleLocalMode}
            colorScheme={isLocalMode ? "blue" : "gray"}
            borderRadius="0 8px 8px 0">
            <Monitor weight="bold" />
            <Hide below="md">{"Local"}</Hide>
          </Button>
        </HStack>

        <Hide below="sm">
          <Icon as={isLocalMode ? WifiHigh : WifiSlash} flexShrink={0} weight="bold" />
        </Hide>

        <InputGroup size="md" flexGrow={1} minW="0" fontFamily="monospace">
          <Hide below="md">
            <InputLeftAddon h="32px" fontSize="sm" fontWeight="semibold">
              Queue Key
            </InputLeftAddon>
          </Hide>
          <Input
            h="32px"
            value={isLocalMode ? "local" : inputValue}
            onChange={handleInputChange}
            isDisabled={isLocalMode}
            fontSize="sm"
            pr={!queue && !isLocalMode ? "100px" : "8px"}
          />
          <InputRightElement h="32px" w="auto" pr={2} zIndex={1}>
            {isLocalMode ? (
              <LockIcon color="gray.500" boxSize={3} />
            ) : !queue ? (
              <Box
                bg="red.500"
                color="white"
                fontSize="sm"
                px={1}
                py={1}
                borderRadius="md"
                position="absolute"
                right="8px"
                maxW="150px"
                isTruncated>
                Queue required
              </Box>
            ) : null}
          </InputRightElement>
        </InputGroup>
      </HStack>
    </HStack>
  );
};
