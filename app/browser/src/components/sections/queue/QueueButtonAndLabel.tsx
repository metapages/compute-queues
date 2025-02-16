import React, { useCallback, useState } from "react";

import { useStore } from "/@/store";
import { useFormik } from "formik";

import { WifiHigh, WifiSlash } from "@phosphor-icons/react";
import * as yup from "yup";

import {
  Alert,
  AlertIcon,
  Button,
  FormControl,
  HStack,
  Icon,
  Input,
  InputGroup,
  Link,
  Tag,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { LocalModeToggle } from "./LocalModeToggle";
import { useQueue } from "/@/hooks/useQueue";
import { QueueOverrideButtonAndLabel } from "./QueueOverrideButtonAndLabel";

const validationSchema = yup.object({
  queue: yup.string(),
});
interface FormType extends yup.InferType<typeof validationSchema> {}

export const QueueButtonAndLabel: React.FC = () => {
  const { queue, setQueue, resolvedQueue, isLocalMode, ignoreQueueOverride } = useQueue();

  const [showInput, setShowInput] = useState(false);
  const isServerConnected = useStore(state => state.isServerConnected);

  const onSubmit = useCallback(
    (values: FormType) => {
      setQueue(values.queue);
      formik.setFieldValue("queue", values.queue);
      // commenting this out because it makes the initial value persist
      // uncomment to return to this behavior
      // formik.resetForm();
      setShowInput(false);
    },
    [setQueue],
  );

  const formik = useFormik({
    initialValues: {
      queue,
    },
    onSubmit,
    validationSchema,
  });

  return (
    <HStack width="100%" pl={"1rem"}>
      <QueueOverrideButtonAndLabel />
      <LocalModeToggle />
      <Tooltip
        label={
          isServerConnected
            ? `${isLocalMode ? "Local worker" : "Server"} is connected`
            : `${isLocalMode ? "Local worker" : "Server"} is not connected`
        }>
        <Icon
          // onFocus https://github.com/chakra-ui/chakra-ui/issues/5304#issuecomment-1102836734
          onFocus={e => e.preventDefault()}
          as={resolvedQueue && isServerConnected ? WifiHigh : WifiSlash}
          color={!(resolvedQueue && isServerConnected) && "red"}
          aria-label="edit docker job queue"
          boxSize="7"
        />
      </Tooltip>
      <Text p={2}>Queue:</Text>
      {showInput && ignoreQueueOverride ? (
        <>
          <form onSubmit={formik.handleSubmit}>
            <HStack>
              <FormControl>
                <InputGroup>
                  <Input
                    id="queue"
                    name="queue"
                    type="text"
                    disabled={isLocalMode}
                    onChange={formik.handleChange}
                    value={formik.values.queue}
                  />
                </InputGroup>
              </FormControl>
              {isLocalMode ? null : (
                <Button type="submit" colorScheme="green" size={"sm"} mr={0}>
                  OK
                </Button>
              )}
            </HStack>
            {/* {error ? <Message type="error" message={error} /> : null} */}
          </form>
        </>
      ) : (
        <HStack gap={5}>
          {resolvedQueue ? <Tag>{resolvedQueue}</Tag> : null}{" "}
          {isLocalMode || !ignoreQueueOverride ? null : <Text onClick={() => setShowInput(true)}>Edit</Text>}
        </HStack>
      )}

      {!resolvedQueue ? (
        <Alert status="error">
          <AlertIcon />
          <Link isExternal href="https://metapage.io/settings/queues">
            ◀️ You must connect to a queue
          </Link>
        </Alert>
      ) : null}
    </HStack>
  );
};
