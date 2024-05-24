import { useCallback } from 'react';

import { EditIcon } from '@chakra-ui/icons';
import {
  IconButton,
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  useDisclosure,
} from '@chakra-ui/react';
import { MetaframeStandaloneComponent } from '@metapages/metapage-embed-react';

export interface EditorJsonProps {
  content: string;
  onUpdate: (s: string) => void;
}

export const ButtonModalEditor: React.FC<EditorJsonProps> = ({
  content,
  onUpdate,
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const onOutputs = useCallback(
    (outputs: any) => {
      if (outputs["text"] === undefined || outputs["text"] === null) {
        return;
      }
      const newValue = outputs["text"];
      onUpdate(newValue);
      onClose();
    },
    [onUpdate, onClose]
  );

  return (
    <>
      <IconButton
        size="md"
        colorScheme="blue"
        aria-label="edit"
        onClick={onOpen}
        icon={<EditIcon />}
      ></IconButton>

      <Modal isOpen={isOpen} onClose={onClose} size="full">
        <ModalOverlay />
        <ModalContent maxW="70rem">
          <ModalHeader>Edit</ModalHeader>
          <ModalCloseButton />
          <div>
            <MetaframeStandaloneComponent
              url="https://editor.mtfm.io/#?hm=disabled&options=JTdCJTIyaGlkZW1lbnVpZmlmcmFtZSUyMiUzQXRydWUlMkMlMjJtb2RlJTIyJTNBJTIyc2glMjIlMkMlMjJ0aGVtZSUyMiUzQSUyMnZzLWRhcmslMjIlN0Q="
              inputs={{ text: content }}
              onOutputs={onOutputs as any}
            />
          </div>
        </ModalContent>
      </Modal>
    </>
  );
};
