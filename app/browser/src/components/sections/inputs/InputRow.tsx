import React, { useCallback } from "react";

import { ButtonDeleteWithConfirm } from "/@/components/generic/ButtonDeleteWithConfirm";
import { ButtonModalEditor } from "/@/components/generic/ButtonModalEditor";

import { Flex, HStack, Icon, Td, Text, Tr } from "@chakra-ui/react";
import { File } from "@phosphor-icons/react";

export const InputRow: React.FC<{
  name: string;
  content: string;
  onDelete: (name: string) => void;
  onUpdate: (name: string, content: string) => void;
}> = ({ name, content, onDelete, onUpdate }) => {
  const onUpdateMemoized = useCallback((contentUpdate: string) => onUpdate(name, contentUpdate), [name, onUpdate]);

  return (
    <Tr>
      <Td>
        <HStack gap={0}>
          <Icon as={File} mr={3}></Icon>
          {name.startsWith("/") ? null : <Text as="span">/inputs/</Text>}
          <Text as="span">{name}</Text>
        </HStack>
      </Td>
      <Td>
        <Flex align={"center"} justify={"flex-end"} gap={3}>
          <ButtonModalEditor fileName={name} content={content} onUpdate={onUpdateMemoized} />
          <ButtonDeleteWithConfirm callback={() => onDelete(name)} />
        </Flex>
      </Td>
    </Tr>
  );
};
