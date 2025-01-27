import {
  Container,
  Icon,
  Modal,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Tooltip,
  useDisclosure,
} from "@chakra-ui/react";
import { Queue as QueueIcon } from "@phosphor-icons/react";
import React from "react";
import { Queue } from "/@/components/sections/queue/Queue";
import { useQueue } from "/@/hooks/useQueue";
import { useStore } from "/@/store";

export const QueueIconAndModal: React.FC = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const workers = useStore(state => state.workers);
  const { resolvedQueue } = useQueue();
  const workerCount = workers?.workers ? Object.keys(workers.workers).length : 0;
  const isNoWorkers = workerCount === 0;
  // const backgroundColor = !queue ? "red.300" : isNoWorkers ? "orange" : "none";
  const color = !resolvedQueue ? undefined : isNoWorkers ? "orange" : "none";
  const textColor = !resolvedQueue ? (isOpen ? undefined : "red.300") : isNoWorkers ? undefined : undefined;

  return (
    <>
      {/* {!queue ? (
        <Text align={"start"} color={"red"} fontWeight={500}>
          Please enter a queue:
        </Text>
      ) : isNoWorkers ? (
        <Text align={"start"} color={"red"} fontWeight={500}>
          No workers in the queue
        </Text>
      ) : null} */}
      <Tooltip
        defaultIsOpen={!resolvedQueue && !isOpen}
        label={
          !resolvedQueue
            ? "Set a queue key"
            : isNoWorkers
              ? `Queue workers: ${workerCount}`
              : `Queue workers: ${workerCount}`
        }>
        <Icon
          as={QueueIcon}
          _hover={{ bg: "gray.300" }}
          color={color}
          // bg={isOpen ? "gray.300" : backgroundColor}
          bg={isOpen ? "gray.300" : "none"}
          textColor={textColor}
          p={"3px"}
          borderRadius={5}
          boxSize="6"
          onClick={onOpen}
        />
      </Tooltip>
      <Modal isOpen={isOpen} onClose={onClose} size={"100%"}>
        <ModalOverlay backdropFilter="blur(1px)" />
        <ModalContent h={"90%"} w={"90%"}>
          <ModalHeader p={0} h={"headerHeight"} borderBottom={"1px"}></ModalHeader>
          <Container p={3} m={0} overflow={"scroll"} minWidth={"100%"} h={"100%"}>
            <Queue />
          </Container>
        </ModalContent>
      </Modal>
    </>
  );
};
