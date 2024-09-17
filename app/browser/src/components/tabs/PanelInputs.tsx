import { useCallback } from "react";
import {
  Button,
  Table,
  Tr,
  Tbody,
  Td,
  Icon,
  VStack,
  useDisclosure,
  Text,
  FormControl,
  HStack,
  Input,
  InputGroup,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Flex,
  Container,
} from "@chakra-ui/react";
import { Plus, File } from '@phosphor-icons/react';
import { useHashParamJson } from "@metapages/hash-query"  ;
import { useFormik } from "formik"  ;
import * as yup from "yup";
import { ButtonDeleteWithConfirm } from "../generic/ButtonDeleteWithConfirm";

import { ButtonModalEditor } from "../generic/ButtonModalEditor";
import { PanelHeader } from '../generic/PanelHeader';
import PanelContainer from '../generic/PanelContainer';

export type JobInputs = { [key: string]: string };

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
        <Text>Input Files</Text>
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

export const InputRow: React.FC<{
  name: string;
  content: string;
  onDelete: (name: string) => void;
  onUpdate: (name: string, content: string) => void;
}> = ({ name, content, onDelete, onUpdate }) => {
  const onUpdateMemoized = useCallback(
    (contentUpdate: string) => onUpdate(name, contentUpdate),
    [name, onUpdate]
  );

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

const validationSchema = yup.object({
  value: yup.string(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

export const AddInputButtonAndModal: React.FC<{
  add: (input: string) => void;
  showText: boolean;
}> = ({ add, showText }) => {
  const { isOpen, onClose, onToggle } = useDisclosure();

  const onSubmit = useCallback(
    (values: FormType) => {
      if (values.value) {
        add(values.value);
      }
      formik.resetForm();
      onClose();
    },
    [onClose, add]
  );

  const formik = useFormik({
    initialValues: {
      value: "",
    },
    onSubmit,
    validationSchema,
  });

  const closeAndClear = useCallback(() => {
    formik.resetForm();
    onClose();
  }, [formik, onClose]);

  return (
    <>
      <HStack onClick={onToggle} aria-label="add input"
      >
        <Icon as={Plus} 
          boxSize={'1.3rem'} />
        {
          showText &&
          <Text size={'med'}>New File</Text>
        }
      </HStack>

      <Modal isOpen={isOpen} onClose={closeAndClear}>
        <ModalOverlay sx={{right: 0, width: '50%'}} />
        <ModalContent>
          <ModalHeader><Text>New input (file) name</Text></ModalHeader>
          <form onSubmit={formik.handleSubmit}>
            <ModalBody>
              <FormControl>
                <InputGroup>
                  <Input
                    id="value"
                    name="value"
                    type="text"
                    variant="outline"
                    onChange={formik.handleChange}
                    value={formik.values.value}
                  />
                </InputGroup>
              </FormControl>
            </ModalBody>

            <ModalFooter>
              <Button type="submit" colorScheme="blackAlpha" mr={3}>
                Add
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
};
