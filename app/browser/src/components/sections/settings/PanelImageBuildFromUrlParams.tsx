import {
  ReactNode,
  useCallback,
  useState,
} from 'react';

import { DockerJobDefinitionParamsInUrlHash } from '/@/shared';
import { useFormik } from 'formik';
import * as yup from 'yup';

import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Icon,
  Input,
  InputGroup,
  Radio,
  RadioGroup,
  Text,
  VStack,
} from '@chakra-ui/react';
import { TrashSimple } from '@phosphor-icons/react';
import { useHashParamJson } from '@metapages/hash-query';

import { ButtonModalEditor } from '/@/components/generic/ButtonModalEditor';
import { FormLink } from '/@/components/generic/FormLink';

const validationSchema = yup.object({
  buildArgs: yup.string().optional(),
  context: yup.string().optional(),
  filename: yup.string().optional(),
  dockerfile: yup.string().optional(),
  image: yup.string(),
  target: yup.string().optional(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

const linkMap = {
  image: "https://hub.docker.com/",
  command: "https://docs.docker.com/reference/dockerfile/#cmd",                           
  dockerfile: "https://docs.docker.com/build/building/packaging/#dockerfile",
  context: "https://docs.docker.com/build/building/context/#git-repositories",
  filename: "https://docs.docker.com/build/building/packaging/#filenames",
  target: "https://docs.docker.com/build/building/multi-stage/#stop-at-a-specific-build-stage",
  buildArgs: "https://docs.docker.com/reference/cli/docker/buildx/build/#build-arg",
}

const labelMap = {
  image: "docker image name",
  context: "Git Repo URL",
  filename: "Dockerfile Name",
  buildArgs: "Build Args",
}
const labelSubMap = {
  buildArgs: "Comma Separated",
}

export const PanelImageBuildFromUrlParams: React.FC<{
  onSave?: () => void;
}> = ({ onSave }) => {
  const [value, setValue] = useState('useExisting')
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
        if (jobDefinitionBlob?.build?.dockerfile) {
          newJobDefinitionBlob.build.dockerfile = jobDefinitionBlob.build.dockerfile;
        }
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
      console.log(newJobDefinitionBlob)
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
      console.log(newJobDefinitionBlob.image)
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

  const existingImageInputs = () => {
    return <FormControl  pl={'1rem'} key={'image'}>
      {/* <FormLabel htmlFor={'image'}>
        <FormLink href={linkMap['image']} label={labelMap['image']}/>
      </FormLabel> */}
      <InputGroup>
        <Input
          width="100%"
          size={'sm'}
          id={'image'}
          name={'image'}
          type="text"
          variant="outline"
          onChange={formik.handleChange}
          value={(formik.values as any)['image'] || ""}
        />
      </InputGroup>
    </FormControl>
  }


  const externalImageInputs = () => {
    return <VStack pl={'1rem'} gap={'1.5rem'} w={'100%'}>
      <FormControl>
        <Box key={'dockerfile'}>
          <HStack w="100%" justifyContent="space-between" alignContent={'flex-start'}>
            <VStack gap={0} alignItems={'flex-start'}>
              <FormLabel h={'1rem'}>
                <FormLink href={linkMap["dockerfile"]} label={'dockerfile'}/>
              </FormLabel>
              <Text fontSize={'xs'} color="gray.400">{jobDefinitionBlob?.build?.dockerfile?.split("\n").find(s => s.startsWith("FROM "))}</Text>
            </VStack>
            <HStack>
              <ButtonModalEditor
                content={jobDefinitionBlob?.build?.dockerfile}
                onUpdate={updateDockerfile}
                button={{isDisabled: isImageSet, ["aria-label"]: "edit dockerfile"}}
                />
              {jobDefinitionBlob?.build?.dockerfile ? <Icon
                  size="md"
                  aria-label="delete dockerfile"
                  onClick={deleteDockerfile}
                  as={TrashSimple}
                ></Icon> : null
              }
            </HStack>
          </HStack>
        </Box>
      </FormControl>
      {[
          "context",
          "filename",
          "target",
          "buildArgs"
        ].map((key) => {
          let labelJsx: ReactNode = <FormLink href={linkMap[key]} label={labelMap[key] || key} />;
          return (
            <VStack w="100%" key={key}>
              <FormControl key={key}>
                <FormLabel htmlFor={key}>
                    {labelJsx}
                    {
                      labelSubMap[key] && 
                      <Text fontSize={'xs'} color="gray.400">{labelSubMap[key]}</Text>
                    }
                </FormLabel>
                <HStack>
                <InputGroup>
                  <Input
                    width="100%"
                    id={key}
                    name={key}
                    size={'sm'}
                    type="text"
                    variant="outline"
                    isDisabled={
                      (key !== "image" && isImageSet) ||
                      (key === "image" && isBuildSet && !formik.values.image)
                    }
                    onChange={formik.handleChange}
                    value={(formik.values as any)[key] || ""}
                  />
                </InputGroup>
                  </HStack>
              </FormControl>
            </VStack>
          );
        })}
    </VStack>
  }

  const onSetValue = (val) => {
    if (val === 'fromRepo') {
      localStorage.setItem('dockerImage', formik.values.image);
      deleteImage();
    } else {
      const prevImage = localStorage.getItem('dockerImage');
      formik.setFieldValue("image", prevImage);
    }
    setValue(val)
  };

  return (
    <form onSubmit={formik.handleSubmit}>
      <VStack gap={'2rem'}>
        <FormControl>
          <RadioGroup onChange={onSetValue} value={value}>
            <VStack align={'flex-start'} gap={5}>
              <Radio value='useExisting' colorScheme={'blackAlpha'}>
                <Text>Use Existing Image</Text>
              </Radio>
              {value === 'useExisting' && existingImageInputs()}
              <Radio value='fromRepo' colorScheme={'blackAlpha'}>
                <Text>Build Image from Repo</Text>
              </Radio>
              {value === 'fromRepo' && externalImageInputs()}
            </VStack>
          </RadioGroup>
        </FormControl>
        <Button alignSelf="center" type="submit" colorScheme="green" size="sm">
          Save
        </Button>
      </VStack>
    </form>
  );
};