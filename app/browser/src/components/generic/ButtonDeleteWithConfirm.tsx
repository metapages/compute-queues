import React, { useCallback, useEffect } from "react";
import { useKeyPress } from "@react-typed-hooks/use-key-press";
import {
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  IconButton,
  useDisclosure,
} from "@chakra-ui/react";
import { DeleteIcon } from "@chakra-ui/icons";

// Delete button with a confirmation modal
export const ButtonDeleteWithConfirm: React.FC<{
  callback: (_?: any) => any;
  result?: { loading?: boolean; error?: any; data?: any };
  modalHeader?: string;
}> = ({ callback, result, modalHeader = "Confirm deletion?" }) => {
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




    <IconButton size="md" colorScheme="blue" aria-label='delete' onClick={onOpen} icon={<DeleteIcon/>}></IconButton>

    {/* <Button onClick={onOpen}>Open Modal</Button> */}

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          {/* <ModalHeader>{modalHeader}</ModalHeader> */}
          <ModalCloseButton />
          <ModalBody>
          {modalHeader}
          </ModalBody>

          <ModalFooter>
            <Button colorScheme='grey' mr={3} onClick={onClose}>
            Cancel
            </Button>
            <Button  colorScheme='red' onClick={onClickDelete}><DeleteIcon/> {` `}OK</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>



      {/* {modalOpen ? (
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(!modalOpen)}
          // this is rubbish
          onActionClick={async (
            e: React.MouseEvent<HTMLElement, MouseEvent>,
            data: ModalProps
          ) => {
            e.preventDefault();
            if (e.currentTarget.innerText === "Yes") {
            }
          }}
        >
          <Header icon="archive" />
          <Modal.Content>
            <p>{modalHeader}</p>
          </Modal.Content>
          <Modal.Actions>
            <Button color="blue" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <ButtonReactive
              text="Yes"
              color="red"
              icon="delete"
              result={result}
              props={{ negative: true }}
              onClick={onClickDelete}
            />
          </Modal.Actions>
        </Modal>
      ) : null}

      <Button icon onClick={() => setModalOpen(true)}>
        <Icon name="delete" />
      </Button> */}
    </>
  );
};
