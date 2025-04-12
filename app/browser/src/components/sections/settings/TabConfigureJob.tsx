import React, { ChangeEvent, ReactNode, useCallback, useState } from "react";

import { useFormik } from "formik";
import * as yup from "yup";
import { FormLink } from "/@/components/generic/FormLink";
import { useMaxJobDuration } from "/@/hooks/useMaxJobDuration";
import { useOptionJobStartAutomatically } from "/@/hooks/useOptionJobStartAutomatically";
import { useOptionResolveDataRefs } from "/@/hooks/useOptionResolveDataRefs";
import { useOptionShowTerminalFirst } from "/@/hooks/useOptionShowTerminalFirst";
import { DockerJobDefinitionParamsInUrlHash } from "/@shared/client";

import {
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  Link,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useHashParamBoolean, useHashParamJson } from "@metapages/hash-query/react-hooks";
import { Plus, TrashSimple } from "@phosphor-icons/react";

const validationSchema = yup.object({
  command: yup.string().optional(),
  debug: yup.boolean().optional(),
  entrypoint: yup.string().optional(),
  gpu: yup.boolean().optional(),
  workdir: yup.string().optional(),
  shmSize: yup.string().optional(),
  jobStartAutomatically: yup.boolean().optional(),
  maxJobDuration: yup.string().optional(),
  newEnvVar: yup.string().optional(),
});

interface FormType extends yup.InferType<typeof validationSchema> {}

const labelToName = {
  command: "Command  (--cmd)",
  entrypoint: "Entrypoint  (--entrypoint)",
  workdir: "Workdir  (--workdir)",
  shmSize: "Shared Memory Size  (--shm-size)",
  maxJobDuration: "Maximum Job Duration (e.g. 5m or 2h)",
};

const linkMap = {
  workdir: "https://docs.docker.com/reference/dockerfile/#workdir",
  entrypoint: "https://docs.docker.com/reference/dockerfile/#entrypoint",
  command: "https://docs.docker.com/reference/dockerfile/#cmd",
  shmSize: "https://docs.docker.com/engine/containers/run/#user-memory-constraints",
};

export const TabConfigureJob: React.FC = () => {
  const [jobDefinitionBlob, setJobDefinitionBlob] = useHashParamJson<DockerJobDefinitionParamsInUrlHash>("job");
  const [debug, setDebug] = useHashParamBoolean("debug");
  const [jobStartAutomatically, toggleJobStartAutomatically] = useOptionJobStartAutomatically();
  const [showTerminalFirst, toggleShowTerminalFirst, loading] = useOptionShowTerminalFirst();
  const [resolveDataRefs, toggleResolveDataRefs] = useOptionResolveDataRefs();
  const [maxJobDuration, setMaxJobDuration] = useMaxJobDuration();
  const [newEnvVar, setNewEnvVar] = useState("");

  const onSubmit = useCallback(
    (values: FormType) => {
      const newJobDefinitionBlob = { ...jobDefinitionBlob };

      newJobDefinitionBlob.workdir = values.workdir;
      newJobDefinitionBlob.command = values.command;
      newJobDefinitionBlob.entrypoint = values.entrypoint;
      newJobDefinitionBlob.gpu = values.gpu;
      newJobDefinitionBlob.shmSize = values.shmSize;

      setJobDefinitionBlob(newJobDefinitionBlob);
      setDebug(!!values.debug);
      setMaxJobDuration(values.maxJobDuration);
    },
    [jobDefinitionBlob, setJobDefinitionBlob, setDebug, toggleJobStartAutomatically, setMaxJobDuration],
  );

  const handleAddEnvVar = useCallback(() => {
    if (!newEnvVar.trim()) return;

    const newJobDefinitionBlob = { ...jobDefinitionBlob };
    if (!newJobDefinitionBlob.env) {
      newJobDefinitionBlob.env = {};
    }
    const [key, value] = newEnvVar.trim().split("=");
    if (key && value) {
      newJobDefinitionBlob.env[key] = value;
      setJobDefinitionBlob(newJobDefinitionBlob);
      setNewEnvVar("");
    }
  }, [jobDefinitionBlob, newEnvVar, setJobDefinitionBlob]);

  const handleDeleteEnvVar = useCallback(
    (key: string) => {
      const newJobDefinitionBlob = { ...jobDefinitionBlob };
      if (newJobDefinitionBlob.env) {
        const { [key]: _, ...rest } = newJobDefinitionBlob.env;
        newJobDefinitionBlob.env = rest;
        setJobDefinitionBlob(newJobDefinitionBlob);
      }
    },
    [jobDefinitionBlob, setJobDefinitionBlob],
  );

  const formik = useFormik({
    initialValues: {
      command: jobDefinitionBlob?.command,
      debug: !!debug,
      entrypoint: jobDefinitionBlob?.entrypoint,
      gpu: jobDefinitionBlob?.gpu,
      workdir: jobDefinitionBlob?.workdir,
      jobStartAutomatically,
      shmSize: jobDefinitionBlob?.shmSize,
      maxJobDuration,
      newEnvVar,
    },
    onSubmit,
    validationSchema,
  });

  // Custom handler for Switch onChange
  const handleSwitchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const { name, checked } = event.target;
      formik.setFieldValue(name, checked);
      formik.submitForm();
    },
    [formik],
  );

  return (
    <VStack w="100%" alignItems="stretch">
      <form onSubmit={formik.handleSubmit}>
        <VStack alignItems="stretch" width="100%" pb={"2rem"}>
          <VStack p={2} alignItems="stretch" width="100%" gap={"1.5rem"}>
            <Text align="center" fontWeight="bold">
              <Link href="https://www.docker.com/" target="_blank" rel="noopener noreferrer">
                Docker
              </Link>{" "}
              Container Settings
            </Text>

            {["command", "entrypoint", "workdir", "shmSize", "maxJobDuration"].map(key => {
              const labelJsx: ReactNode = <FormLink href={linkMap[key]} label={labelToName[key]} />;
              return (
                <FormControl key={key}>
                  <FormLabel htmlFor={key}>{labelJsx}</FormLabel>
                  <InputGroup>
                    <Input
                      width="100%"
                      size={"sm"}
                      id={key}
                      name={key}
                      type="text"
                      variant="outline"
                      onChange={formik.handleChange}
                      value={formik.values[key] || ""}
                    />
                  </InputGroup>
                </FormControl>
              );
            })}

            {/* Environment Variables Section */}
            <Box>
              <Text align="center" fontWeight="bold" mb={2}>
                Environment Variables
              </Text>
              <VStack spacing={2} align="stretch">
                {Object.entries(jobDefinitionBlob?.env || {}).map(([key, value]) => (
                  <Flex key={key} align="center" justify="space-between">
                    <Text>{`${key}=${value}`}</Text>
                    <IconButton
                      color="gray.300"
                      variant="ghost"
                      icon={<Icon as={TrashSimple} boxSize={5} />}
                      aria-label="Delete environment variable"
                      size="md"
                      onClick={() => handleDeleteEnvVar(key)}
                    />
                  </Flex>
                ))}
                <HStack>
                  <Input
                    value={newEnvVar}
                    onChange={e => setNewEnvVar(e.target.value)}
                    placeholder="Add new environment variable (KEY=VALUE)"
                    size="sm"
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddEnvVar();
                      }
                    }}
                  />
                  <IconButton
                    variant="ghost"
                    aria-label="Add environment variable"
                    icon={<Plus />}
                    size="md"
                    onClick={handleAddEnvVar}
                  />
                </HStack>
              </VStack>
            </Box>

            <FormControl>
              <FormLabel htmlFor="gpu">
                <Text>
                  GPU{" "}
                  <Link href="https://docs.docker.com/engine/containers/resource_constraints/#access-an-nvidia-gpu">
                    {`(if worker supported, roughly equivalent to "--gpus '"device=0"'")`}
                  </Link>
                </Text>
              </FormLabel>

              <Switch id="gpu" name="gpu" onChange={handleSwitchChange} isChecked={formik.values.gpu} />
            </FormControl>
            <Divider />
            <Text align="center" fontWeight="bold">
              UI Settings
            </Text>
            <FormControl>
              <FormLabel htmlFor="debug">
                <Text>Debug</Text>
              </FormLabel>
              <Switch id="debug" name="debug" onChange={handleSwitchChange} isChecked={debug} />
            </FormControl>

            <Box>
              <Text mb={2} fontWeight="bold" color="black">
                Show terminal / code by default
              </Text>
              <Switch
                isDisabled={loading}
                isChecked={showTerminalFirst}
                onChange={toggleShowTerminalFirst}
                colorScheme="blue"
              />
              <Text fontSize="sm" color="gray.600" mt={1}>
                {showTerminalFirst ? "Terminal shown by default" : "Code shown by default"}
              </Text>
            </Box>

            <Divider />
            <Text align="center" fontWeight="bold">
              Misc Settings
            </Text>

            <FormControl>
              <FormLabel htmlFor="jobStartAutomatically">
                <Text>Run Job Automatically</Text>
              </FormLabel>
              <Switch
                id="jobStartAutomatically"
                name="jobStartAutomatically"
                onChange={toggleJobStartAutomatically}
                isChecked={jobStartAutomatically}
              />
            </FormControl>

            <FormControl>
              <FormLabel htmlFor="jobStartAutomatically">
                <Text>Resolve [data references] ▶️ [data] (send big data directly)</Text>
              </FormLabel>
              <Switch
                id="resolveDataRefs"
                name="resolveDataRefs"
                onChange={toggleResolveDataRefs}
                isChecked={resolveDataRefs}
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
