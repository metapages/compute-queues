import { useCallback, useState } from 'react';

import { useStore } from '/@/store';
import { useFormik } from 'formik';

import { WifiHigh, WifiSlash } from '@phosphor-icons/react';
import * as yup from 'yup';

import {
  Alert,
  AlertIcon,
  Button,
  FormControl,
  HStack,
  Icon,
  Input,
  InputGroup,
  Tag,
  Text,
} from '@chakra-ui/react';
import { useHashParam } from '@metapages/hash-query';

const validationSchema = yup.object({
  queue: yup.string(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

export const QueueButtonAndLabel: React.FC = () => {
  const [queue, setQueue] = useHashParam("queue", "");
  const [showInput, setShowInput] = useState(false);
  const isServerConnected = useStore((state) => state.isServerConnected);

  const onSubmit = useCallback(
    (values: FormType) => {
      setQueue(values.queue);
      formik.setFieldValue("queue", values.queue);
      // commenting this out because it makes the initial value persist 
      // uncomment to return to this behavior
      // formik.resetForm();
      setShowInput(false);
    },
    [setQueue]
  );

  const formik = useFormik({
    initialValues: {
      queue,
    },
    onSubmit,
    validationSchema,
  });

  return (
    <HStack width="100%">
      <Icon as={queue && isServerConnected ? WifiHigh : WifiSlash}
        size="lg"
        color={!(queue && isServerConnected) && 'red'}
        aria-label="edit docker job queue"
      />
      <Text p={2}>
        Queue key:
      </Text>
      { showInput ? 
        <>
          <form onSubmit={formik.handleSubmit}>
            <HStack>
              <FormControl>
                <InputGroup>
                  <Input
                    id="queue"
                    name="queue"
                    type="text"
                    onChange={formik.handleChange}
                    value={formik.values.queue}
                    />
                </InputGroup>
              </FormControl>
              <Button type="submit" colorScheme="green" size={'sm'} mr={0}>
                Add
              </Button>
            </HStack>
            {/* {error ? <Message type="error" message={error} /> : null} */}
          </form>
        </> :
        <HStack gap={5}>
          {queue ? <Tag>{queue}</Tag> : null}{" "}
          <Text onClick={() => setShowInput(true)}>Edit</Text>
        </HStack>
      }

      {!queue || queue === "" ? (
        <Alert status="error">
          <AlertIcon />
          ◀️ You must connect to a queue
        </Alert>
      ) : null}
    </HStack>
  );
};