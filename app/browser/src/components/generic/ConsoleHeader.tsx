import React from 'react';
import {
    HStack, Text, Flex,
} from '@chakra-ui/react';
import { useStore } from '../../store';
import { defaultBorder } from '../../styles/theme';

interface ConsoleHeaderProps {
    title: string;
    showSplit: boolean;
    showCombine: boolean
}

export const ConsoleHeader: React.FC<ConsoleHeaderProps> = ({title, showSplit, showCombine}) => {
  const setRightPanelContext = useStore((state) => state.setRightPanelContext);
  const setRunLogs = useStore((state) => state.setRunLogs);

  const onSplit = () => {
    setRightPanelContext('stderr');
  }
  const onCombine = () => {
    setRightPanelContext(null);
  }
  return <Flex zIndex={2} w={'100%'} h={'1.5rem'} borderBottom={defaultBorder} bgColor={'black.3'} >
    <HStack justify={'space-between'} px={3} w={'100%'}>
        <Text color={'gray.39'} fontSize={'0.7rem'}>{title.toUpperCase()}</Text>
        <HStack>
          { showSplit && <Text cursor={'pointer'} color={'gray.39'} fontSize={'0.7rem'} onClick={onSplit}>Split</Text> }
          { showCombine && <Text cursor={'pointer'} color={'gray.39'} fontSize={'0.7rem'} onClick={onCombine}>Combine</Text> }
          <Text cursor={'pointer'} color={'gray.39'} fontSize={'0.7rem'} onClick={() => setRunLogs(null)}>Clear</Text>
        </HStack>
    </HStack>
  </Flex>
};