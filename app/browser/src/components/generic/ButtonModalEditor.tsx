import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { EditIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  HStack,
  IconButton,
  IconButtonProps,
  Modal,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  useDisclosure,
} from '@chakra-ui/react';
import { MetaframeStandaloneComponent } from '@metapages/metapage-embed-react';

export interface EditorJsonProps {
  content: string;
  onUpdate: (s: string) => void;
  button?: IconButtonProps;
}

export const ButtonModalEditor: React.FC<EditorJsonProps> = ({
  content,
  onUpdate,
  button,
}) => {
  // console.log('content', content);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [value, setValue] = useState(content);
  // const valueInitialOnce = useRef({ text: content });
  // const valueInitialOnceLoaded = useRef(false);

  useEffect(() => {
    setValue(content);
  }, [content]);

  const onSave = useCallback(() => {
    onUpdate(value);
    onClose();
    // valueInitialOnce.current = undefined;
    // valueInitialOnceLoaded.current = false;
  }, [value, onUpdate, onClose]);

  const onOutputs = useCallback(
    (outputs: any) => {
      if (outputs["text"] === undefined || outputs["text"] === null) {
        return;
      }
      const newValue = outputs["text"];
      setValue(newValue);
      // onUpdate(newValue);
      // onClose();
    },
    [onUpdate, onClose]
  );

  // if (valueInitialOnceLoaded.current) {
  //   // valueInitialOnceLoaded.current = true;
  //   valueInitialOnce.current = undefined;
  // } else {
  //   valueInitialOnceLoaded.current = true;
  //   valueInitialOnce.current = { text: content }; 
  // }

  return (
    <>
      <IconButton
        size="md"
        colorScheme="blue"
        // aria-label="edit"
        onClick={onOpen}
        icon={<EditIcon />}
        {...button}
      ></IconButton>

      <Modal isOpen={isOpen} onClose={onClose} size="full">
        <ModalOverlay />
        <ModalContent maxW="70rem">
          <ModalHeader>
            <HStack w="100%" justifyContent="space-between"><Box>Edit</Box> <Button colorScheme='green' mr={3} onClick={onSave}>
              Save
            </Button></HStack>
            </ModalHeader>
            
          <div>
            <MetaframeStandaloneComponent
              url="https://editor.mtfm.io/#?hm=disabled&options=JTdCJTIyYXV0b3NlbmQlMjIlM0F0cnVlJTJDJTIyaGlkZW1lbnVpZmlmcmFtZSUyMiUzQXRydWUlMkMlMjJtb2RlJTIyJTNBJTIyc2glMjIlN0Q="
              inputs={{text: value}}
              onOutputs={onOutputs as any}
            />
          </div>
        </ModalContent>
          {/* <ModalCloseButton /> */}
      </Modal>
    </>
  );
};
