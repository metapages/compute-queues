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
  Checkbox,
  Tooltip,
} from "@chakra-ui/react";
import { Cloud, Monitor, WifiHigh, WifiSlash } from "@phosphor-icons/react";
import React, { useCallback, useEffect, useState } from "react";
import debounce from "lodash/debounce";
import { useQueue } from "/@/hooks/useQueue";

export const QueueOverrideButtonAndLabel: React.FC = () => {
  const { resolvedQueue, queue, setQueue, isLocalMode, toggleLocalMode, ignoreQueueOverride, setIgnoreQueueOverride } =
    useQueue();
  const [inputValue, setInputValue] = useState(resolvedQueue);

  // Update input value when queue changes
  useEffect(() => {
    setInputValue(resolvedQueue);
  }, [resolvedQueue]);

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
        <Tooltip
          label={ignoreQueueOverride ? "Unselect to set queue from page" : "Select to set queue here"}
          placement="top">
          <Checkbox
            isChecked={ignoreQueueOverride}
            onChange={e => setIgnoreQueueOverride(e.target.checked)}
            size="sm"
            mr={2}
          />
        </Tooltip>

        <HStack gap={0} flexShrink={0} minW="auto">
          {ignoreQueueOverride ? (
            <>
              <Button
                isDisabled={!ignoreQueueOverride}
                size="sm"
                aria-label="Remote"
                onClick={toggleLocalMode}
                colorScheme={isLocalMode ? "gray" : "blue"}
                borderRadius="8px 0 0 8px"
                leftIcon={<Cloud weight="bold" />}>
                <Hide below="md">{"Remote"}</Hide>
              </Button>

              <Button
                isDisabled={!ignoreQueueOverride}
                size="sm"
                aria-label="Local"
                onClick={toggleLocalMode}
                colorScheme={isLocalMode ? "blue" : "gray"}
                borderRadius="0 8px 8px 0"
                leftIcon={<Monitor weight="bold" />}>
                <Hide below="md">{"Local"}</Hide>
              </Button>
            </>
          ) : (
            <Hide below="md">
              <Box>Set from page</Box>
            </Hide>
          )}
        </HStack>

        <Hide below="sm">
          <Icon as={isLocalMode ? WifiHigh : WifiSlash} flexShrink={0} weight="bold" />
        </Hide>

        <InputGroup size="md" flexGrow={1} minW="0" fontFamily="monospace">
          <Hide below="md">
            <InputLeftAddon h="32px" fontSize="sm" fontWeight="semibold">
              Queue
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
            {isLocalMode || !ignoreQueueOverride ? (
              <LockIcon color="gray.500" boxSize={3} />
            ) : !queue && !resolvedQueue ? (
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
