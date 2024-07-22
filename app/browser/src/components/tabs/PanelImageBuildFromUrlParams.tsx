import {
  ReactNode,
  useCallback,
} from 'react';

import { DockerJobDefinitionParamsInUrlHash } from '/@/shared';
import { useFormik } from 'formik';
import * as yup from 'yup';

import { DeleteIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  InputGroup,
  Link,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useHashParamJson } from '@metapages/hash-query';

import { ButtonModalEditor } from '../generic/ButtonModalEditor';

const validationSchema = yup.object({
  buildArgs: yup.string().optional(),
  context: yup.string().optional(),
  filename: yup.string().optional(),
  dockerfile: yup.string().optional(),
  image: yup.string(),
  target: yup.string().optional(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

export const PanelImageBuildFromUrlParams: React.FC<{
  onSave?: () => void;
}> = ({ onSave }) => {
  const [jobDefinitionBlob, setJobDefinitionBlob] =
    useHashParamJson<DockerJobDefinitionParamsInUrlHash>("job");

  const onSubmit = useCallback(
    (values: FormType) => {
      const newJobDefinitionBlob = { ...jobDefinitionBlob };

      if (!values.image) {
        delete newJobDefinitionBlob.image;
      }

      if (values.image) {
        newJobDefinitionBlob.image = values.image;
        delete newJobDefinitionBlob.build;
      } else if (
        !values.buildArgs &&
        !values.context &&
        !values.filename &&
        !values.dockerfile &&
        !values.target
      ) {
        delete newJobDefinitionBlob.build;
      } else {
        newJobDefinitionBlob.build = {};
        // build and image are mutually exclusive
        delete newJobDefinitionBlob.image;
        if (values.buildArgs) {
          newJobDefinitionBlob.build.buildArgs = values.buildArgs
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        }

        if (values.context) {
          newJobDefinitionBlob.build.context = values.context;
        }

        if (values.filename) {
          newJobDefinitionBlob.build.filename = values.filename;
        }

        if (values.target) {
          newJobDefinitionBlob.build.target = values.target;
        }
      }

      // console.log('PanelImageBuildFromUrlParams newJobDefinitionBlob', newJobDefinitionBlob);

      setJobDefinitionBlob(newJobDefinitionBlob);
      onSave?.();
    },
    [jobDefinitionBlob, onSave, setJobDefinitionBlob]
  );

  const updateDockerfile = useCallback(
    (content: string) => {
      const newJobDefinitionBlob = { ...jobDefinitionBlob };
      if (content) {
        if (!newJobDefinitionBlob.build) {
          newJobDefinitionBlob.build = {};
        }
        newJobDefinitionBlob.build.dockerfile = content;
        delete newJobDefinitionBlob.build.filename;
        delete newJobDefinitionBlob.image;
      } else {
        delete newJobDefinitionBlob.build.dockerfile;
      }
      setJobDefinitionBlob(newJobDefinitionBlob);
      onSave?.();
    },
    [jobDefinitionBlob, onSave, setJobDefinitionBlob]
  );

  const deleteDockerfile = useCallback(
    () => {
      const newJobDefinitionBlob = { ...jobDefinitionBlob };
      if (!newJobDefinitionBlob.build) {
        return;
      }
      delete newJobDefinitionBlob.build.dockerfile;
      if (Object.keys(newJobDefinitionBlob.build).length === 0) {
        delete newJobDefinitionBlob.build;
      }
      setJobDefinitionBlob(newJobDefinitionBlob);
      onSave?.();
    },
    [jobDefinitionBlob, onSave, setJobDefinitionBlob]
  );

  

  const formik = useFormik({
    initialValues: {
      buildArgs: jobDefinitionBlob?.build?.buildArgs?.join(","),
      context: jobDefinitionBlob?.build?.context,
      image: jobDefinitionBlob?.image,
      dockerfile: jobDefinitionBlob?.build?.dockerfile,
      filename: jobDefinitionBlob?.build?.filename,
      target: jobDefinitionBlob?.build?.target,
    },
    onSubmit,
    validationSchema,
  });

  const deleteImage = useCallback(
    () => {
      formik.setFieldValue("image", "");
      const newJobDefinitionBlob = { ...jobDefinitionBlob };
      delete newJobDefinitionBlob.image;
      setJobDefinitionBlob(newJobDefinitionBlob);
      onSave?.();
    },
    [formik, jobDefinitionBlob, onSave, setJobDefinitionBlob]
  );

  const isImageSet = !!formik.values.image;
  const isBuildSet =
    !!jobDefinitionBlob?.build?.dockerfile ||
    !!formik.values.buildArgs ||
    !!formik.values.context ||
    !!formik.values.filename ||
    !!formik.values.target;

  return (
    <VStack
      borderWidth="1px"
      p={4}
      borderRadius="lg"
      alignItems="stretch"
      width="100%"
      // spacing="4px"
    >
      <form onSubmit={formik.handleSubmit}>
        {[
          "image",
          "dockerfile",
          "context",
          "filename",
          "target",
          "buildArgs",
        ].map((key) => {
          if (key === "dockerfile") {
            return (
              <Box key={key}>
                <FormLabel><Link
                  isExternal
                  href="https://docs.docker.com/build/building/packaging/#dockerfile"
                >
                  Dockerfile:
                </Link></FormLabel>
                <HStack w="100%" justifyContent="space-between">
                <HStack w="100%" >
                <ButtonModalEditor
                    content={jobDefinitionBlob?.build?.dockerfile}
                    onUpdate={updateDockerfile}
                    button={{isDisabled: isImageSet, ["aria-label"]: "edit dockerfile"}}
                    />
                  <Text bg="lightgrey">{jobDefinitionBlob?.build?.dockerfile?.split("\n").find(s => s.startsWith("FROM "))}</Text>
                  </HStack>
                  <HStack>
                    {jobDefinitionBlob?.build?.dockerfile ? <IconButton
                    size="md"
                    colorScheme="red"
                    aria-label="delete dockerfile"
                    onClick={deleteDockerfile}
                    icon={<DeleteIcon />}
                  ></IconButton> : null}
                  
                  
                  </HStack>
                </HStack>
              </Box>
            );
          }

          let labelJsx: ReactNode = key;
          switch (key) {
            case "image":
              labelJsx = (
                <Link isExternal href="https://hub.docker.com/">
                  Docker image name
                </Link>
              );
              break;
            case "context":
              labelJsx = (
                <Link
                  isExternal
                  href="https://docs.docker.com/build/building/context/#git-repositories"
                >
                  git repository url context
                </Link>
              );
              break;

            case "filename":
              labelJsx = (
                <Link
                  isExternal
                  href="https://docs.docker.com/build/building/packaging/#filenames"
                >
                  Dockerfile name
                </Link>
              );
              break;

            case "target":
              labelJsx = (
                <Link
                  isExternal
                  href="https://docs.docker.com/build/building/multi-stage/#stop-at-a-specific-build-stage"
                >
                  target
                </Link>
              );
              break;

            case "buildArgs":
              labelJsx = (
                <Link
                  isExternal
                  href="https://docs.docker.com/reference/cli/docker/buildx/build/#build-arg"
                >
                  build args, comma separated
                </Link>
              );

            default:
            // TODO: add the others
          }

          return (
            <VStack w="100%" key={key}>
              <FormControl key={key}>
                <FormLabel htmlFor={key}>{labelJsx}:</FormLabel>
                <HStack>
                <InputGroup>
                  <Input
                    width="100%"
                    id={key}
                    name={key}
                    type="text"
                    variant="filled"
                    isDisabled={
                      (key !== "image" && isImageSet) ||
                      (key === "image" && isBuildSet && !formik.values.image)
                    }
                    onChange={formik.handleChange}
                    value={(formik.values as any)[key] || ""}
                  />
                </InputGroup>
                {key === "image" ? (
                <IconButton
                    size="md"
                    colorScheme="red"
                    aria-label="delete image"
                    onClick={deleteImage}
                    icon={<DeleteIcon />}
                    isDisabled={!isImageSet}
                  ></IconButton>) : null}
                  </HStack>
              </FormControl>
              {key === "image" ? (
                <>
                  <Divider key={key + "divider"} />
                  <FormLabel key={key + "formlabel"}>
                    Or build the image:
                  </FormLabel>
                </>
              ) : null}
            </VStack>
          );
        })}
        <Button alignSelf="flex-end" type="submit" colorScheme="green" mr={3}>
          ✅ OK
        </Button>
      </form>
    </VStack>
  );
};
