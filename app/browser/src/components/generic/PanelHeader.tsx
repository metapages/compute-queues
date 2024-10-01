import React from 'react';
import {
    HStack, Text, Icon, Flex,
} from '@chakra-ui/react';
import { X } from '@phosphor-icons/react';
import { useStore } from '../../store';
import { defaultBorder } from '../../styles/theme';

interface PanelHeaderProps {
    title: string;
    onSave?: () => void;
    preserveCase?: boolean;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({title, onSave, preserveCase}) => {
    const setRightPanelContext = useStore((state) => state.setRightPanelContext);
    const titleText = preserveCase ? title : title.toUpperCase();
    return <Flex zIndex={2} w={'100%'} h={'1.5rem'} minH={'1.5rem'} borderBottom={defaultBorder} >
      <HStack justify={'space-between'} px={3} w={'100%'}>
         <Text color={'gray.39'} fontSize={'0.7rem'}>{titleText}</Text>
         <HStack>
            { onSave && <Text cursor={'pointer'} color={'gray.39'} fontSize={'0.7rem'} onClick={onSave}>Save</Text> }
            <Icon boxSize={'1rem'} as={X} onClick={() => setRightPanelContext(null)}></Icon>
         </HStack>
      </HStack>
    </Flex>
};