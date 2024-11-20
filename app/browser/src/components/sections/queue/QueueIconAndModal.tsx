import React from "react";
import {
  Tooltip,
  Icon,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Container,
} from "@chakra-ui/react";
import { Queue as QueueIcon } from "@phosphor-icons/react";
import { Queue } from "/@/components/sections/queue/Queue";
import { useStore } from "/@/store";
import { useHashParam } from "@metapages/hash-query";

export const QueueIconAndModal: React.FC = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const workers = useStore(state => state.workers);
  const [queue] = useHashParam("queue", "");
  const isNoWorkers = !workers?.workers || Object.keys(workers.workers).length === 0;
  let toolTipText = "Queue";
  if (!queue) {
    toolTipText = "Enter a queue";
  } else if (isNoWorkers) {
    toolTipText = "No workers in queue";
  }
  return (
    <>
      <Tooltip bg={toolTipText !== "Queue" && 'red.600'} label={toolTipText}>
        <Icon
          as={QueueIcon}
          _hover={{ bg: queue ? "gray.300" : 'red.100' }}
          bg={isOpen ? "gray.300" : "none"}
          p={"3px"}
          borderRadius={5}
          boxSize="6"
          color={(!queue || isNoWorkers) && 'red'}
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
