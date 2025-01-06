import React, { useCallback, useEffect } from "react";
import { useKeyPress } from "@react-typed-hooks/use-key-press";
import {
  Button,
  Container,
  HStack,
  Icon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalOverlay,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { TrashSimple } from "@phosphor-icons/react";

// Delete icon with a confirmation modal
export const ButtonDeleteWithConfirm: React.FC<{
  callback: () => void;
  modalHeader?: string;
  iconColor?: string;
}> = ({ callback, iconColor, modalHeader = "Confirm deletion?" }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const onClickDelete = useCallback(() => {
    callback();
    onClose();
  }, [callback, onClose]);

  const isEnterPressed = useKeyPress({ targetKey: "Enter" });
  useEffect(() => {
    if (isEnterPressed && isOpen) {
      callback();
      onClose();
    }
  }, [callback, onClose, isEnterPressed]);

  return (
    <>
      <Icon color={iconColor} as={TrashSimple} aria-label="delete" onClick={onOpen} />
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalCloseButton />
          <ModalBody>
            <Container h={"4rem"} pt={"1rem"}>
              <Text fontSize={"1rem"} align={"center"}>
                {modalHeader}
              </Text>
            </Container>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button colorScheme="gray" onClick={onClose} size="sm">
                Cancel
              </Button>
              <Button colorScheme="red" onClick={onClickDelete} size="sm">
                Delete
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};
