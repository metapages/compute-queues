import { Tr, Td, HStack, Icon, Flex, Text } from '@chakra-ui/react';
import { File } from '@phosphor-icons/react';
import { useCallback } from 'react';
import { ButtonDeleteWithConfirm } from '/@/components/generic/ButtonDeleteWithConfirm';
import { ButtonModalEditor } from '/@/components/generic/ButtonModalEditor';

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
        <HStack gap={3}>
          <Icon as={File}></Icon>
          <Text>{name}</Text>
        </HStack>
      </Td>
      <Td>
        <Flex align={'center'} justify={'flex-end'} gap={3}>
          <ButtonModalEditor fileName={name} content={content} onUpdate={onUpdateMemoized} />
          <ButtonDeleteWithConfirm callback={() => onDelete(name)} />
        </Flex>
      </Td>
    </Tr>
  );
};
