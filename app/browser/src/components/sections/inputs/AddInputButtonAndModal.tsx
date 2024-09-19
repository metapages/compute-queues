import { 
  useDisclosure, 
  HStack, 
  Icon, 
  Modal, 
  ModalOverlay, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  InputGroup, 
  Input, 
  ModalFooter, 
  Button,
  Text,
} from "@chakra-ui/react";
import { Plus } from "@phosphor-icons/react";
import { useFormik } from "formik";
import { FormControl } from "formik-chakra-ui";
import { useCallback } from "react";
import * as yup from "yup";

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
              <FormControl name={"value"}>
                <InputGroup>
                  <Input
                    id="value"
                    name="value"
                    type="text"
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