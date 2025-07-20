import React, { useCallback, useEffect, useState } from "react";

import debounce from "lodash/debounce";
import { useQueue } from "/@/hooks/useQueue";

import { LockIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Hide,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftAddon,
  InputRightElement,
  Tooltip,
} from "@chakra-ui/react";
import { isIframe } from "@metapages/metapage";
import { House, Lock, LockOpen, WifiHigh } from "@phosphor-icons/react";

const isInIframe = isIframe();

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
        {isInIframe ? (
          <Tooltip
            label={ignoreQueueOverride ? "Metapage ignored, queue set here" : "Queue set from metapage"}
            placement="top">
            <IconButton
              aria-label={ignoreQueueOverride ? "Disable local override" : "Enable local override"}
              icon={<Icon as={ignoreQueueOverride ? LockOpen : Lock} weight="bold" />}
              onClick={() => setIgnoreQueueOverride(!ignoreQueueOverride)}
              size="sm"
              _hover={{ bg: "gray.300" }}
              bg="none"
              p={"3px"}
              borderRadius={5}
              boxSize="7"
              transition="transform 0.2s"
            />
          </Tooltip>
        ) : null}

        <HStack gap={0} flexShrink={0} minW="auto">
          {ignoreQueueOverride || !isInIframe ? (
            <HStack spacing={2} align="center">
              <Button
                size="sm"
                onClick={toggleLocalMode}
                // colorScheme={isLocalMode ? "blue" : "gray"}
                colorScheme="blue"
                // variant={isLocalMode ? "solid" : "outline"}
                variant="outline"
                aria-label={isLocalMode ? "Switch to Cloud" : "Switch to Local"}
                minW="60px">
                <Hide below="md">{isLocalMode ? "Local" : "Cloud"}</Hide>
              </Button>
            </HStack>
          ) : (
            <Hide below="md">
              <Box>Metapage set</Box>
            </Hide>
          )}
        </HStack>

        <InputGroup size="md" flexGrow={1} minW="0" fontFamily="monospace">
          <Hide below="md">
            <InputLeftAddon h="32px" fontSize="sm" fontWeight="semibold" bg="transparent" border="none">
              <Hide below="sm">
                <Icon as={isLocalMode ? House : WifiHigh} flexShrink={0} weight="bold" color="gray.500" />
              </Hide>
            </InputLeftAddon>
          </Hide>
          <Input
            h="32px"
            value={isLocalMode ? "local" : inputValue}
            onChange={handleInputChange}
            fontSize="sm"
            isDisabled={!ignoreQueueOverride && isInIframe}
            pr={!queue && !isLocalMode ? "100px" : "8px"}
          />
          <InputRightElement h="32px" w="auto" pr={2} zIndex={1}>
            {!ignoreQueueOverride ? (
              !isInIframe ? null : (
                <LockIcon color="gray.500" boxSize={3} />
              )
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
