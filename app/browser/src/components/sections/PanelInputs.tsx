import { useCallback } from "react";
import {
  Button,
  Table,
  Tbody,
  Text,
  HStack,
  Container,
} from "@chakra-ui/react";
import { useHashParamJson } from "@metapages/hash-query"  ;
import { JobInputs } from "/@/shared/types";

import { PanelHeader } from '/@/components/generic/PanelHeader';
import { PanelContainer } from '/@/components/generic/PanelContainer';
import { AddInputButtonAndModal } from "/@/components/sections/inputs/AddInputButtonAndModal";
import { InputRow } from "/@/components/sections/inputs/InputRow";

export const PanelInputs: React.FC = () => {
  const [jobInputs, setJobInputs] = useHashParamJson<JobInputs | undefined>(
    "inputs"
  );

  const addNewInput = useCallback(
    (name: string) => {
      setJobInputs({ ...jobInputs, [name]: "" });
    },
    [jobInputs, setJobInputs]
  );

  const deleteInput = useCallback(
    (name: string) => {
      const newJobDefinitionBlob = { ...jobInputs };
      delete newJobDefinitionBlob[name];
      setJobInputs(newJobDefinitionBlob);
    },
    [jobInputs, setJobInputs]
  );

  const updateInput = useCallback(
    (name: string, content: string) => {
      const newJobDefinitionBlob = { ...jobInputs };
      newJobDefinitionBlob[name] = content;
      setJobInputs(newJobDefinitionBlob);
    },
    [jobInputs, setJobInputs]
  );

  const names: string[] = jobInputs ? Object.keys(jobInputs).sort() : [];

  return (
    <PanelContainer>
      <PanelHeader title={'Inputs'} />
      <HStack px={4} width="100%" justifyContent="space-between">
        <Text>{"/inputs/<files>"}</Text>
        <AddInputButtonAndModal add={addNewInput} showText={false} />
      </HStack>
      <Container>
        <Table variant="simple">
          <Tbody>
            {names.map((name) => (
              <InputRow
                key={name}
                name={name}
                content={jobInputs?.[name] ?? ""}
                onDelete={deleteInput}
                onUpdate={updateInput}
              />
            ))}
          </Tbody>
        </Table>
      </Container>
      <HStack as={Button} bg={'none'} _hover={{bg: 'none'}}>
        <AddInputButtonAndModal showText={true} add={addNewInput} />
      </HStack>
    </PanelContainer>
  );
};