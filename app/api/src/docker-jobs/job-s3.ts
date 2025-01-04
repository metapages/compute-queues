import { type DataRef, DataRefType } from "@metapages/compute-queues-shared";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "aws-sdk/client-s3";

import { bucketParams, s3Client as client } from "/@/routes/s3config.ts";

export const putJsonToS3 = async (
  key: string,
  data: unknown,
): Promise<DataRef> => {
  const command = new PutObjectCommand({
    ...bucketParams,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  });
  // Send the command to S3
  /* const response = */ void await client.send(command);
  const ref: DataRef = {
    // value: hash, // no http means we know it's an internal address, workers will know how to reach
    type: DataRefType.key,
    value: key,
  };
  return ref;
};

export const resolveDataRefFromS3 = async <T>(
  ref: DataRef<T>,
): Promise<T | undefined> => {
  if (!(ref?.type === DataRefType.key)) {
    console.error("DataRef type is not a key", ref.type);
  }
  if (typeof ref?.value !== "string") {
    console.error("DataRef value is not a string", ref);
    throw new Error("DataRef value is not a string");
  }
  return await getJsonFromS3(ref.value);
};

export const getJsonFromS3 = async <T>(key: string): Promise<T | undefined> => {
  try {
    const result = await getObject(key);
    if (!result) {
      return undefined;
    }
    return JSON.parse(result) as T;
  } catch (err) {
    console.log(`getJsonFromS3 error for key ${key} ${err}`);
  }
};

export const deleteFromS3 = (Key: string): Promise<void> => {
  return new Promise((resolve, _reject) => {
    const deleteObjectCommand = new DeleteObjectCommand({
      ...bucketParams,
      Key,
    });

    client.send(deleteObjectCommand)
      .then(() => {
        resolve();
      })
      .catch((err) => {
        console.log(`Ignored error deleting object ${Key} from S3: ${err}`);
        resolve();
        // swallow errors
      });
  });
};

const getObject = (Key: string): Promise<string | undefined> => {
  return new Promise((resolve, _reject) => {
    const getObjectCommand = new GetObjectCommand({ ...bucketParams, Key });

    client.send(getObjectCommand)
      .then((response) => {
        // Store all of data chunks returned from the response data stream
        // into an array then use Array#join() to use the returned contents as a String
        const responseDataChunks: unknown[] = [];

        // Handle an error while streaming the response body
        response.Body?.once("error", (err: Error) => {
          console.log(`Error streaming object ${Key} from S3: ${err}`);
          resolve(undefined); // Still swallowing, adjust if needed
        });

        // Attach a 'data' listener to add the chunks of data to our array
        response.Body?.on(
          "data",
          (chunk: unknown) => responseDataChunks.push(chunk),
        );

        // Once the stream has no more data, join the chunks into a string and return the string
        response.Body?.once("end", () => resolve(responseDataChunks.join("")));
      })
      .catch((err) => {
        // swallow errors
        // Handle the error or throw
        console.log(`Ignored error getting object ${Key} from S3: ${err}`);
        // return reject(err);
        resolve(undefined);
      });
  });
};
