import React, { useCallback, useState } from "react";

import { useFormik } from "formik";
import * as yup from "yup";

import {
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Icon,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Table,
  Tbody,
  Td,
  Text,
  Tr,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import { useHashParamJson } from "@metapages/hash-query/react-hooks";
import {
  isEmptyMetaframeDefinition,
  MetaframeDefinitionV1,
} from "@metapages/metapage";
import { DownloadSimple, Plus, UploadSimple } from "@phosphor-icons/react";

import { ButtonDeleteWithConfirm } from "../../generic/ButtonDeleteWithConfirm";

const validationSchema = yup.object({
  name: yup.string(),
  type: yup.string().optional(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

export const SectionIO: React.FC = () => {
  const { isOpen, onClose, onToggle } = useDisclosure();
  const [isInput, setIsInput] = useState(true);
  const [definition, setDefinition] = useHashParamJson<
    MetaframeDefinitionV1 | undefined
  >("definition");

  const deleteInput = useCallback(
    (isInput: boolean, name: string) => {
      const newIoValues = { ...definition };
      if (isInput) {
        delete newIoValues.inputs[name];
      } else {
        delete newIoValues.outputs[name];
      }
      newIoValues.version = "1";

      if (isEmptyMetaframeDefinition(newIoValues)) {
        setDefinition(undefined);
      } else {
        setDefinition(newIoValues);
      }
    },
    [definition, setDefinition],
  );

  const onSubmit = useCallback(
    (values: FormType) => {
      if (values.name) {
        const newIoValues = { ...definition };
        const typeThing = values.type ? { type: values.type } : {};
        if (isInput) {
          newIoValues.inputs = {
            ...newIoValues.inputs,
            [values.name]: typeThing,
          };
        } else {
          newIoValues.outputs = {
            ...newIoValues.outputs,
            [values.name]: typeThing,
          };
        }
        setDefinition(newIoValues);
      }
      onClose();
    },
    [onClose, isInput, definition, setDefinition],
  );

  const formik = useFormik({
    initialValues: {
      name: "",
      type: undefined,
    },
    onSubmit,
    validationSchema,
  });

  const toggleInputModal = useCallback(() => {
    setIsInput(true);
    onToggle();
  }, [isInput, onToggle]);

  const toggleOutputModal = useCallback(() => {
    setIsInput(false);
    onToggle();
  }, [isInput, onToggle]);

  return (
    <>
      <VStack
        w={"100%"}
        p={6}
        gap={5}
        justifyContent="flex-start"
        alignItems="stretch"
      >
        <HStack
          alignItems="flex-start"
          width="100%"
          justifyContent="space-between"
        >
          <VStack alignItems={"flex-start"}>
            <Text fontWeight={600}>
              Define Inputs and Outputs (for the metapage connection editor)
            </Text>
          </VStack>
        </HStack>
        <HStack w="100%" justifyContent="space-between" alignItems="flex-start">
          <VStack justifyContent="flex-start" w="50%">
            <Button
              variant="ghost"
              leftIcon={<Icon as={DownloadSimple} boxSize={6} />}
              rightIcon={<Icon as={Plus} boxSize={6} />}
              onClick={toggleInputModal}
              aria-label="add input"
            >
              Inputs
            </Button>

            <Table px={5} variant="simple" borderBottom="none" border="none">
              <Tbody borderBottom="none" border="none">
                {(definition?.inputs ? Object.keys(definition.inputs) : []).map(
                  (name, i) => (
                    <IORow
                      key={name}
                      isInput={true}
                      name={name}
                      type={definition.inputs[name].type}
                      onDelete={() => deleteInput(true, name)}
                    />
                  ),
                )}
              </Tbody>
            </Table>
          </VStack>

          <VStack justifyContent="flex-start" w="50%">
            <Button
              variant="ghost"
              leftIcon={<Icon as={UploadSimple} boxSize={6} />}
              rightIcon={<Icon as={Plus} boxSize={6} />}
              onClick={toggleOutputModal}
              aria-label="add output"
            >
              Outputs
            </Button>

            <Table px={5} variant="simple">
              <Tbody>
                {(definition?.outputs ? Object.keys(definition.outputs) : [])
                  .map((name, i) => (
                    <IORow
                      key={name}
                      isInput={false}
                      name={name}
                      type={definition.outputs[name].type}
                      onDelete={() => deleteInput(false, name)}
                    />
                  ))}
              </Tbody>
            </Table>
          </VStack>
        </HStack>
      </VStack>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Text>Add {isInput ? "Input" : "Output"}:</Text>
          </ModalHeader>
          <form onSubmit={formik.handleSubmit}>
            <ModalBody>
              <VStack spacing={4}>
                <FormControl>
                  <FormLabel htmlFor="name">Name</FormLabel>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    onChange={formik.handleChange}
                    value={formik.values.name}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel htmlFor="type">Type (optional)</FormLabel>
                  <Input
                    id="type"
                    name="type"
                    type="text"
                    onChange={formik.handleChange}
                    value={formik.values.type}
                  />
                </FormControl>
              </VStack>
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

export const IORow: React.FC<{
  isInput: boolean;
  name: string;
  type: string;
  onDelete: (isInput: boolean, name: string) => void;
}> = ({ isInput, name, type, onDelete }) => {
  return (
    <Tr>
      <Td border="none">
        <HStack gap={3}>
          <Text fontSize={"12"} whiteSpace={"normal"}>
            {name} {type ? `(${type})` : ""}
          </Text>
        </HStack>
      </Td>
      <Td border="none">
        <Flex align={"center"} justify={"flex-end"} gap={3}>
          <ButtonDeleteWithConfirm
            callback={() => onDelete(isInput, name)}
            iconColor="gray.300"
          />
        </Flex>
      </Td>
    </Tr>
  );
};
