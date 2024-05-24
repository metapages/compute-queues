import { useCallback } from "react";
import { useHashParamJson, useHashParamBoolean } from "@metapages/hash-query";
import {
  Input,
  Switch,
  Button,
  FormControl,
  FormLabel,
  InputGroup,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Heading,
  Divider,
  ModalCloseButton,
} from "@chakra-ui/react";
import { useFormik } from "formik";
import * as yup from "yup";
import { DockerJobDefinitionParamsInUrlHash } from "./types";

const validationSchema = yup.object({
  image: yup.string(),
  command: yup.string(),
  entrypoint: yup.string(),
  workdir: yup.string(),
  cache: yup.boolean(),
  debug: yup.boolean(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

export const JobInputFromUrlParams: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {

  // console.log(`JobInputFromUrlParams ${isOpen} `);



  const [jobDefinitionBlob, setJobDefinitionBlob] =
    useHashParamJson<DockerJobDefinitionParamsInUrlHash>("job");
  const [nocache, setnocache] = useHashParamBoolean("nocache");
  const [debug, setDebug] = useHashParamBoolean("debug");

  const onSubmit = useCallback(
    (values: FormType) => {
      const newJobDefinitionBlob = {} as DockerJobDefinitionParamsInUrlHash;
      if (values.image) {
        newJobDefinitionBlob.image = values.image;
      }

      if (values.workdir) {
        newJobDefinitionBlob.workdir = values.workdir;
      }

      newJobDefinitionBlob.command = values.command;
      newJobDefinitionBlob.entrypoint = values.entrypoint;

      setJobDefinitionBlob(newJobDefinitionBlob);
      setnocache(!values.cache);
      setDebug(values.debug!!);
      onClose();
    },
    [onClose, setJobDefinitionBlob, setnocache, setDebug]
  );

  const formik = useFormik({
    initialValues: {
      debug,
      image: jobDefinitionBlob?.image,
      command: jobDefinitionBlob?.command, //?.join(" "),
      entrypoint: jobDefinitionBlob?.entrypoint, //?.join(" "),
      workdir: jobDefinitionBlob?.workdir,
      cache: !nocache,
    },
    onSubmit,
    validationSchema,
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Configure docker batch job</ModalHeader>
        <ModalCloseButton />
        <form onSubmit={formik.handleSubmit}>
          <ModalBody>
            <Heading size="xs" textAlign="center">
              Docker container:
            </Heading>
            <br />

            <Stack direction="column" spacing="4px">
              {["image", "command", "entrypoint", "workdir"].map((key) => (
                <FormControl key={key}>
                  <FormLabel htmlFor={key}>{key}:</FormLabel>
                  <InputGroup>
                    <Input
                      id={key}
                      name={key}
                      type="text"
                      variant="filled"
                      onChange={formik.handleChange}
                      value={(formik.values as any)[key] || ""}
                    />
                  </InputGroup>
                </FormControl>
              ))}

              <br />
              <Divider />
              <Heading size="xs" textAlign="center">
                Misc:
              </Heading>

              <FormControl>
                <FormLabel htmlFor="nocache">Cache</FormLabel>
                <Switch
                  id="nocache"
                  name="cache"
                  onChange={formik.handleChange}
                  isChecked={formik.values.cache}
                />
              </FormControl>

              <FormControl>
                <FormLabel htmlFor="debug">Debug</FormLabel>
                <Switch
                  id="debug"
                  name="debug"
                  onChange={formik.handleChange}
                  isChecked={formik.values.debug}
                />
              </FormControl>
            </Stack>
          </ModalBody>

          <ModalFooter>
            <Button type="submit" colorScheme="green" mr={3}>
              ✅ OK
            </Button>
          </ModalFooter>
          {/* {error ? <Message type="error" message={error} /> : null} */}
        </form>
      </ModalContent>
    </Modal>
  );
};
