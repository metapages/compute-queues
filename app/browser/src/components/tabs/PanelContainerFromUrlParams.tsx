import {
  ChangeEvent,
  ReactNode,
  useCallback,
} from 'react';

import { DockerJobDefinitionParamsInUrlHash } from '/@/shared';
import { useFormik } from 'formik';
import * as yup from 'yup';

import {
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  InputGroup,
  Link,
  Switch,
  VStack,
} from '@chakra-ui/react';
import {
  useHashParamBoolean,
  useHashParamJson,
} from '@metapages/hash-query';

const validationSchema = yup.object({
  command: yup.string().optional(),
  debug: yup.boolean().optional(),
  entrypoint: yup.string().optional(),
  gpu: yup.boolean().optional(),
  workdir: yup.string().optional(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

export const PanelContainerFromUrlParams: React.FC<{
  onSave?: () => void;
}> = ({ onSave }) => {
  const [jobDefinitionBlob, setJobDefinitionBlob] =
    useHashParamJson<DockerJobDefinitionParamsInUrlHash>("job");
  const [debug, setDebug] = useHashParamBoolean("debug");

  const onSubmit = useCallback(
    (values: FormType) => {
      const newJobDefinitionBlob = {...jobDefinitionBlob};


      if (values.workdir) {
        newJobDefinitionBlob.workdir = values.workdir;
      }

      newJobDefinitionBlob.command = values.command;
      newJobDefinitionBlob.entrypoint = values.entrypoint;
      newJobDefinitionBlob.gpu = values.gpu;

      // console.log('PanelContainerFromUrlParams newJobDefinitionBlob', newJobDefinitionBlob);

      setJobDefinitionBlob(newJobDefinitionBlob);
      setDebug(values.debug!!);
      if (onSave) {
        onSave();
      }
    },
    [jobDefinitionBlob, onSave, setJobDefinitionBlob, setDebug]
  );

  const formik = useFormik({
    initialValues: {
      command: jobDefinitionBlob?.command,
      debug,
      entrypoint: jobDefinitionBlob?.entrypoint,
      gpu: jobDefinitionBlob?.gpu,
      workdir: jobDefinitionBlob?.workdir,
    },
    onSubmit,
    validationSchema,
  });

  // Custom handler for Switch onChange
  const handleSwitchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { name, checked } = event.target;
      formik.setFieldValue(name, checked);
      formik.submitForm();
    },
    [formik]
  );

  return (
    <VStack w="100%" alignItems="stretch">
      <form onSubmit={formik.handleSubmit}>
        <Heading size="sm">Configure docker batch job </Heading>

        <VStack alignItems="stretch" width="100%" spacing="4px" pt="9px">
          <VStack
            borderWidth="1px"
            p={4}
            borderRadius="lg"
            alignItems="stretch"
            width="100%"
            // spacing="4px"
          >
            <Heading size="xs">Docker container</Heading>

            {["command", "entrypoint", "workdir"].map((key) => {
              let labelJsx: ReactNode;
              switch (key) {
                
                case "command":
                  labelJsx = (
                    <Link
                      isExternal
                      href="https://docs.docker.com/reference/dockerfile/#cmd"
                    >
                      command
                    </Link>
                  );
                  break;
                case "entrypoint":
                  labelJsx = (
                    <Link
                      isExternal
                      href="https://docs.docker.com/reference/dockerfile/#entrypoint"
                    >
                      entrypoint
                    </Link>
                  );
                  break;
                case "workdir":
                  labelJsx = (
                    <Link
                      isExternal
                      href="https://docs.docker.com/reference/dockerfile/#workdir"
                    >
                      workdir
                    </Link>
                  );
                  break;
              }

              return (
                <FormControl key={key}>
                  <FormLabel htmlFor={key}>{labelJsx}:</FormLabel>
                  <InputGroup>
                    <Input
                      width="100%"
                      id={key}
                      name={key}
                      type="text"
                      variant="filled"
                      onChange={formik.handleChange}
                      value={(formik.values as any)[key] || ""}
                    />
                  </InputGroup>
                </FormControl>
              );
            })}

            <FormControl>
              <FormLabel htmlFor="gpu">
                GPU (if worker supported, equavalent to "--gpus all")
              </FormLabel>

              <Switch
                id="gpu"
                name="gpu"
                onChange={handleSwitchChange}
                isChecked={formik.values.gpu}
              />
            </FormControl>
          </VStack>

          <br />
          {/* <Divider /> */}

          <VStack
            borderWidth="1px"
            p={4}
            borderRadius="lg"
            alignItems="stretch"
            width="100%"
            spacing="4px"
          >
            <Heading size="xs">Misc</Heading>
            <br />

            <FormControl>
              <FormLabel htmlFor="debug">Debug</FormLabel>
              <Switch
                id="debug"
                name="debug"
                onChange={handleSwitchChange}
                isChecked={formik.values.debug}
              />
            </FormControl>
          </VStack>

          <Button alignSelf="flex-end" type="submit" colorScheme="green" mr={3}>
            ✅ OK
          </Button>
        </VStack>

        {/* {error ? <Message type="error" message={error} /> : null} */}
      </form>
    </VStack>
  );
};
