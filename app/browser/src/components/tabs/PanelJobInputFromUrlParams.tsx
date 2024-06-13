import {
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
  image: yup.string(),
  command: yup.string(),
  entrypoint: yup.string(),
  workdir: yup.string(),
  cache: yup.boolean(),
  debug: yup.boolean(),
  gpu: yup.boolean(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

export const PanelJobInputFromUrlParams: React.FC<{
  onSave?: () => void;
}> = ({ onSave }) => {
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
      newJobDefinitionBlob.gpu = values.gpu;

      setJobDefinitionBlob(newJobDefinitionBlob);
      setnocache(!values.cache);

      setDebug(values.debug!!);
      if (onSave) {
        onSave();
      }
    },
    [onSave, setJobDefinitionBlob, setnocache, setDebug]
  );

  const formik = useFormik({
    initialValues: {
      debug,
      image: jobDefinitionBlob?.image,
      command: jobDefinitionBlob?.command,
      entrypoint: jobDefinitionBlob?.entrypoint,
      workdir: jobDefinitionBlob?.workdir,
      cache: !nocache,
      gpu: jobDefinitionBlob?.gpu,
    },
    onSubmit,
    validationSchema,
  });

  return (
    <VStack w="100%" alignItems="stretch" >
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
            <Heading size="xs" >
              Docker container
            </Heading>

            {["image", "command", "entrypoint", "workdir"].map((key) => {
              
              let labelJsx :ReactNode;
              switch(key) {
                case "image":
                  labelJsx = <><Link isExternal href="https://hub.docker.com/" >docker image name</Link>{` / `}<Link isExternal href="https://docs.docker.com/build/building/context/#git-repositories" >git repository url</Link></>;
                  break;
                case "command":
                  labelJsx = <Link isExternal href="https://docs.docker.com/reference/dockerfile/#cmd" >command</Link>;
                  break;
                case "entrypoint":
                  labelJsx = <Link isExternal href="https://docs.docker.com/reference/dockerfile/#entrypoint" >entrypoint</Link>;
                  break;
                case "workdir":
                  labelJsx = <Link isExternal href="https://docs.docker.com/reference/dockerfile/#workdir" >workdir</Link>;
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
                onChange={formik.handleChange}
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
            <Heading size="xs">
              Misc
            </Heading>
            <br />

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
