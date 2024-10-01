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
  Text,
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

  return (
    <>
      {!queue ? (
        <Text align={"start"} color={"red"} fontWeight={500}>
          Please enter a queue:
        </Text>
      ) : isNoWorkers ? (
        <Text align={"start"} color={"red"} fontWeight={500}>
          No workers in the queue
        </Text>
      ) : null}
      <Tooltip label={"Queue"}>
        <Icon
          as={QueueIcon}
          _hover={{ bg: "gray.300" }}
          bg={isOpen ? "gray.300" : "none"}
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
