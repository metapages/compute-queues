import { useCallback } from 'react';

import { PanelContainer } from '/@/components/generic/PanelContainer';
import { PanelHeader } from '/@/components/generic/PanelHeader';
import { AddInputButtonAndModal } from '/@/components/sections/inputs/AddInputButtonAndModal';
import { InputRow } from '/@/components/sections/inputs/InputRow';
import { JobInputs } from '/@/shared/types';
import { useStore } from '/@/store';

import { Container, HStack, Table, Tbody, Text } from '@chakra-ui/react';
import { useHashParamJson } from '@metapages/hash-query';
import { getInputsCount } from '../../helpers/util';

export const PanelInputs: React.FC = () => {
  const clientJobDefinition = useStore(state => state.newJobDefinition);
  const [jobInputs, setJobInputs] = useHashParamJson<JobInputs | undefined>('inputs');

  const addNewInput = useCallback(
    (name: string) => {
      setJobInputs({ ...jobInputs, [name]: '' });
    },
    [jobInputs, setJobInputs],
  );

  const deleteInput = useCallback(
    (name: string) => {
      const newJobDefinitionBlob = { ...jobInputs };
      delete newJobDefinitionBlob[name];
      setJobInputs(newJobDefinitionBlob);
    },
    [jobInputs, setJobInputs],
  );

  const updateInput = useCallback(
    (name: string, content: string) => {
      const newJobDefinitionBlob = { ...jobInputs };
      newJobDefinitionBlob[name] = content;
      setJobInputs(newJobDefinitionBlob);
    },
    [jobInputs, setJobInputs],
  );

  const names: string[] = jobInputs ? Object.keys(jobInputs).sort() : [];
  const incomingInputsCount = getInputsCount(clientJobDefinition, jobInputs);

  return (
    <PanelContainer gap={4}>
      <PanelHeader title={`Inputs (${incomingInputsCount}) = dynamic - static (below)`} />
      <HStack px={4} width='100%' justifyContent='space-between'>
        <Text>{'/inputs/<scripts>'}</Text>
        <AddInputButtonAndModal add={addNewInput} showText={false} />
      </HStack>
      <Container>
        <Table px={5} variant='simple'>
          <Tbody>
            {names.map(name => (
              <InputRow
                key={name}
                name={name}
                content={jobInputs?.[name] ?? ''}
                onDelete={deleteInput}
                onUpdate={updateInput}
              />
            ))}
          </Tbody>
        </Table>
      </Container>
    </PanelContainer>
  );
};
