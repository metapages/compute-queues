import { useCallback } from "react";
import {
  Button,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  VStack,
  useDisclosure,
  FormControl,
  HStack,
  IconButton,
  Input,
  InputGroup,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Tag,
  Divider,
} from "@chakra-ui/react";
import { AddIcon } from "@chakra-ui/icons";
import { useHashParamJson } from "@metapages/hash-query";
import { useFormik } from "formik";
import * as yup from "yup";
import { ButtonDeleteWithConfirm } from "./generic/ButtonDeleteWithConfirm";
import { ButtonModalEditor } from "./generic/ButtonModalEditor";

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
    <VStack width="100%" p={2} alignItems="flex-start">
      <HStack width="100%" justifyContent="flex-begin">
        <AddInputButtonAndModal add={addNewInput} />
      </HStack>
      <Divider />
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th textAlign="left">Name</Th>
            <Th textAlign="right">Edit</Th>
            <Th textAlign="right">Delete</Th>
          </Tr>
        </Thead>
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
    </VStack>
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
        <Tag>{name}</Tag>
      </Td>
      <Td textAlign="right">
        <ButtonModalEditor content={content} onUpdate={onUpdateMemoized} />
      </Td>
      <Td textAlign="right">
        <ButtonDeleteWithConfirm callback={() => onDelete(name)} />
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
}> = ({ add }) => {
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
      <IconButton
        size="md"
        onClick={onToggle}
        colorScheme="blue"
        aria-label="add input"
        icon={<AddIcon />}
      />

      <Modal isOpen={isOpen} onClose={closeAndClear}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>New input (file) name:</ModalHeader>
          <form onSubmit={formik.handleSubmit}>
            <ModalBody>
              <FormControl>
                <InputGroup>
                  <Input
                    id="value"
                    name="value"
                    type="text"
                    variant="filled"
                    onChange={formik.handleChange}
                    value={formik.values.value}
                  />
                </InputGroup>
              </FormControl>
            </ModalBody>

            <ModalFooter>
              <Button type="submit" colorScheme="green" mr={3}>
                Add
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
};
