import React, { useCallback, useEffect, useRef, useState } from "react";

import { encodeOptions } from "/@/helpers";

import {
  Button,
  HStack,
  Icon,
  IconButton,
  IconButtonProps,
  Modal,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { MetaframeStandaloneComponent } from "@metapages/metapage-react";
import { Check } from "@phosphor-icons/react";

export interface EditorJsonProps {
  content: string;
  onUpdate: (s: string) => void;
  button?: IconButtonProps;
  fileName?: string;
}

export const ButtonModalEditor: React.FC<EditorJsonProps> = ({ content, onUpdate, button, fileName }) => {
  // 650
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [value, setValue] = useState(content);
  const options = useRef("");
  useEffect(() => {
    setValue(content);
  }, [content]);

  useEffect(() => {
    setValue(content);
    const fileExtension = fileName?.split(".").pop();
    options.current = encodeOptions({
      autosend: true,
      hidemenuififrame: true,
      mode: fileExtension || "sh",
      theme: "mf-default",
    });
  }, [content]);

  const onSave = useCallback(() => {
    onUpdate(value);
    onClose();
  }, [value, onUpdate, onClose]);

  const onOutputs = useCallback(
    // eslint-disable-next-line
    (outputs: any) => {
      if (outputs["text"] === undefined || outputs["text"] === null) {
        return;
      }
      const newValue = outputs["text"];
      setValue(newValue);
    },
    [onUpdate, onClose],
  );

  return (
    <>
      <IconButton size="md" variant={"unstyled"} onClick={onOpen} {...button}>
        <Text>Edit</Text>
      </IconButton>
      <Modal id={"edit-modal-right"} isOpen={isOpen} onClose={onClose} size="full">
        <ModalOverlay backdropFilter="blur(1px)" />
        <ModalContent maxW="90%" height="100vh">
          <ModalHeader p={0} borderBottom={"1px"}>
            <HStack w="100%" justifyContent="space-between">
              <Text px={"2rem"} fontWeight={400}>
                {fileName}
              </Text>
              <Button
                w={"8rem"}
                bg={"gray.300"}
                px={"2rem"}
                borderLeft={"1px"}
                borderRadius={0}
                leftIcon={<Icon color="green" pb={"0.2rem"} boxSize={"1.5rem"} as={Check} />}
                variant={"unstyled"}
                onClick={onSave}
                display={"flex"}>
                <Text pr={"1rem"} display={"flex"} color="green">
                  Save
                </Text>
              </Button>
            </HStack>
          </ModalHeader>
          <MetaframeStandaloneComponent
            url={`https://editor.mtfm.io/#?hm=disabled&options=${options.current}`}
            inputs={{ [fileName]: value }}
            onOutputs={onOutputs}
          />
        </ModalContent>
      </Modal>
    </>
  );
};
