import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Box,
  Button,
  HStack,
  Icon,
  IconButton,
  IconButtonProps,
  Modal,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  useDisclosure,
  Text,
} from '@chakra-ui/react';
import { MetaframeStandaloneComponent } from '@metapages/metapage-embed-react';
import { defaultBorder, headerHeight } from '/@/styles/theme';
import { Check } from '@phosphor-icons/react';
import { encodeOptions } from '/@/shared';

export interface EditorJsonProps {
  content: string;
  onUpdate: (s: string) => void;
  button?: IconButtonProps;
  fileName?: string;
}

export const ButtonModalEditor: React.FC<EditorJsonProps> = ({
  content,
  onUpdate,
  button,
  fileName,
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [value, setValue] = useState(content);
  const options = useRef('');
  useEffect(() => {
    setValue(content);
  }, [content]);

  useEffect(() => {
    setValue(content);
    const fileExtension = fileName?.split('.').pop();
    options.current = encodeOptions({
      autosend: true, 
      hidemenuififrame: true, 
      mode: fileExtension || 'sh', 
      theme: "mf-default",
    });
  }, [content]);

  const onSave = useCallback(() => {
    onUpdate(value);
    onClose();
  }, [value, onUpdate, onClose]);

  const onOutputs = useCallback(
    (outputs: any) => {
      if (outputs["text"] === undefined || outputs["text"] === null) {
        return;
      }
      const newValue = outputs["text"];
      setValue(newValue);
    },
    [onUpdate, onClose]
  );

  return (
    <>
      <IconButton
        size="md"
        fontWeight={400}
        variant={'unstyled'}
        onClick={onOpen}
        {...button}
      >
        <Text>
            Edit    
        </Text>
      </IconButton>
      <Modal id={'edit-modal-right'} isOpen={isOpen} onClose={onClose} size="full">
        <ModalOverlay backdropFilter='blur(1px)'/>
        <ModalContent maxW="50%">
          <ModalHeader p={0} h={headerHeight} borderBottom={defaultBorder}>
            <HStack w="100%" justifyContent="space-between">
              <Text px={'2rem'} fontWeight={400}>
                {fileName}
              </Text>
              <Button
                w={'8rem'}
                bg={'black.10'}
                px={'2rem'}
                borderLeft={defaultBorder} 
                borderRadius={0} 
                leftIcon={
                  <Icon color='green' pb={'0.2rem'} boxSize={'1.5rem'} as={Check}/>
                } 
                variant={'unstyled'} 
                onClick={onSave}
                display={'flex'}
                >
                <Text pr={'1rem'} display={'flex'} color='green'>Save</Text>
              </Button>
            </HStack>
            </ModalHeader>
            
          <div>
            <MetaframeStandaloneComponent
              url={`https://editor.mtfm.io/#?hm=disabled&options=${options.current}`}
              inputs={{text: value}}
              onOutputs={onOutputs as any}
            />
          </div>
        </ModalContent>
      </Modal>
    </>
  );
};
