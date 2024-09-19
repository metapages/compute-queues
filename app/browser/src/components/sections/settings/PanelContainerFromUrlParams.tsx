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
  Input,
  InputGroup,
  Switch,
  VStack,
  Text,
  Divider,
  Link,
} from '@chakra-ui/react';
import {
  useHashParamBoolean,
  useHashParamJson,
} from '@metapages/hash-query';
import { FormLink } from '/@/components/generic/FormLink';
import { useOptionJobsStartAutomatically } from '/@/hooks/useOptionJobsStartAutomatically';

const validationSchema = yup.object({
  command: yup.string().optional(),
  debug: yup.boolean().optional(),
  entrypoint: yup.string().optional(),
  gpu: yup.boolean().optional(),
  workdir: yup.string().optional(),
  jobsStartAutomatically: yup.boolean().optional(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

const linkMap = {
  workdir: "https://docs.docker.com/reference/dockerfile/#workdir",
  entrypoint: "https://docs.docker.com/reference/dockerfile/#entrypoint",    
  command: "https://docs.docker.com/reference/dockerfile/#cmd",                           
}

export const PanelContainerFromUrlParams: React.FC = () => {
  const [jobDefinitionBlob, setJobDefinitionBlob] =
    useHashParamJson<DockerJobDefinitionParamsInUrlHash>("job");
  const [debug, setDebug] = useHashParamBoolean("debug");
  const [jobsStartAutomatically, toggleJobsStartAutomatically] = useOptionJobsStartAutomatically();

  const onSubmit = useCallback(
    (values: FormType) => {
      const newJobDefinitionBlob = {...jobDefinitionBlob};


      if (values.workdir) {
        newJobDefinitionBlob.workdir = values.workdir;
      }

      newJobDefinitionBlob.command = values.command;
      newJobDefinitionBlob.entrypoint = values.entrypoint;
      newJobDefinitionBlob.gpu = values.gpu;

      setJobDefinitionBlob(newJobDefinitionBlob);
      setDebug(!!values.debug);
    },
    [jobDefinitionBlob, setJobDefinitionBlob, setDebug, toggleJobsStartAutomatically]
  );

  const formik = useFormik({
    initialValues: {
      command: jobDefinitionBlob?.command,
      debug: !!debug,
      entrypoint: jobDefinitionBlob?.entrypoint,
      gpu: jobDefinitionBlob?.gpu,
      workdir: jobDefinitionBlob?.workdir,
      jobsStartAutomatically,
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
        <VStack alignItems="stretch" width="100%" pb={'2rem'}>
          <VStack
            p={2}
            alignItems="stretch"
            width="100%"
            gap={'1.5rem'}
          >
            <Text align="center" fontWeight="bold">Container Settings</Text>
            
            {["command", "entrypoint", "workdir"].map((key) => {
              const labelJsx: ReactNode = <FormLink href={linkMap[key]} label={key} />;                
              return (
                <FormControl key={key}>
                  <FormLabel htmlFor={key}>{labelJsx}</FormLabel>
                  <InputGroup>
                    <Input
                      width="100%"
                      size={'sm'}
                      id={key}
                      name={key}
                      type="text"
                      variant="outline"
                      onChange={formik.handleChange}
                      value={(formik.values as any)[key] || ""}
                    />
                  </InputGroup>
                </FormControl>
              );
            })}

            <FormControl>
              <FormLabel htmlFor="gpu">
                <Text>GPU <Link href="https://docs.docker.com/engine/containers/resource_constraints/#access-an-nvidia-gpu">(if worker supported, roughly equivalent to "--gpus '"device=0"'")</Link></Text>
              </FormLabel>

              <Switch
                id="gpu"
                name="gpu"
                onChange={handleSwitchChange}
                isChecked={formik.values.gpu}
              />
            </FormControl>
            <Divider/>
            <Text align="center" fontWeight="bold">UI Settings</Text>
            <FormControl>
              <FormLabel htmlFor="debug">
                <Text>Debug</Text>
              </FormLabel>
              <Switch
                id="debug"
                name="debug"
                onChange={handleSwitchChange}
                isChecked={debug}
              />
            </FormControl>
            

            <Divider/>
            <Text align="center" fontWeight="bold">Misc Settings</Text>

            <FormControl>
              <FormLabel htmlFor="jobsStartAutomatically">
                <Text>Start Jobs Automatically</Text>
              </FormLabel>
              <Switch
                id="jobsStartAutomatically"
                name="jobsStartAutomatically"
                onChange={toggleJobsStartAutomatically}
                isChecked={jobsStartAutomatically}
              />
            </FormControl>
          </VStack>
          <Button alignSelf="center" type="submit" colorScheme="green" size="sm">
            Save
          </Button>
        </VStack>
        {/* {error ? <Message type="error" message={error} /> : null} */}
      </form>
    </VStack>
  );
};
