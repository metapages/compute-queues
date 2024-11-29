import React, { useCallback, useEffect, useState } from "react";

import { PanelContainer } from "/@/components/generic/PanelContainer";
import { PanelHeader } from "/@/components/generic/PanelHeader";
import { AddInputButtonAndModal } from "/@/components/sections/inputs/AddInputButtonAndModal";
import { InputRow } from "/@/components/sections/inputs/InputRow";
import { downloadFile, getDynamicInputs } from "/@/helpers";
import { InputsRefs, JobInputs } from "/@/shared/types";
import { useStore } from "/@/store";

import { Container, HStack, Icon, Spacer, Table, Tbody, Td, Text, Tr } from "@chakra-ui/react";
import { useHashParamJson } from "@metapages/hash-query/react-hooks";
import { ArrowDown } from "@phosphor-icons/react";

export const PanelInputs: React.FC = () => {
  const clientJobDefinition = useStore(state => state.newJobDefinition);
  const [jobInputs, setJobInputs] = useHashParamJson<JobInputs | undefined>("inputs");
  const [dynamicInputs, setDynamicInputs] = useState<InputsRefs>({});
  useEffect(() => {
    setDynamicInputs(getDynamicInputs(clientJobDefinition));
  }, [clientJobDefinition, jobInputs]);

  const addNewInput = useCallback(
    (name: string) => {
      setJobInputs({ ...jobInputs, [name]: "" });
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

  return (
    <PanelContainer gap={4}>
      <PanelHeader title={`Inputs`} />
      <HStack px={4} width="100%" justifyContent="space-between">
        <Text>{`Container mounted scripts + config:`}</Text>
        <AddInputButtonAndModal add={addNewInput} showText={false} />
      </HStack>
      <Container>
        <Table px={5} variant="simple">
          <Tbody>
            {names.map(name => (
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

      <HStack px={4} py={10} width="100%" justifyContent="space-between">
        <Text>{`/inputs/<dynamic from upstream>   (${dynamicInputs ? Object.keys(dynamicInputs).length : 0})`}</Text>
        <Spacer />
      </HStack>
      <Container>
        <Table variant="simple">
          <Tbody>
            {Object.keys(dynamicInputs).map(name => (
              <Tr key={name} justifyContent={"space-between"}>
                <Td>
                  <HStack p={2} justifyContent={"space-between"}>
                    <Text>{name}</Text>
                    <Icon
                      onClick={() => downloadFile(name, dynamicInputs[name])}
                      boxSize={"1.4rem"}
                      as={ArrowDown}></Icon>
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Container>
    </PanelContainer>
  );
};
