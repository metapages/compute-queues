import { DataRef, DataRefType } from "@metapages/compute-queues-shared";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "npm:@aws-sdk/client-s3@3.717.0";

import { bucketParams, s3Client as client } from "../routes/s3config.ts";

export const putJsonToS3 = async (key: string, data: any): Promise<DataRef> => {
  const command = new PutObjectCommand({
    ...bucketParams,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  });
  // Send the command to S3
  // @ts-ignore
  const response = await client.send(command);
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

export const deleteFromS3 = async <T>(Key: string): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    const deleteObjectCommand = new DeleteObjectCommand({
      ...bucketParams,
      Key,
    });
    try {
      // @ts-ignore
      const response: any = await client.send(deleteObjectCommand);
      resolve();
    } catch (err) {
      console.log(`Ignored error deleting object ${Key} from S3: ${err}`);
      resolve();
      // swallow errors
    }
  });
};

const getObject = async (Key: string): Promise<string | undefined> => {
  return new Promise(async (resolve, reject) => {
    const getObjectCommand = new GetObjectCommand({ ...bucketParams, Key });

    try {
      // @ts-ignore
      const response: any = await client.send(getObjectCommand);

      // Store all of data chunks returned from the response data stream
      // into an array then use Array#join() to use the returned contents as a String
      let responseDataChunks: any[] = [];

      // Handle an error while streaming the response body
      response.Body.once("error", (err: Error) => reject(err));

      // Attach a 'data' listener to add the chunks of data to our array
      // Each chunk is a Buffer instance
      response.Body.on("data", (chunk: any) => responseDataChunks.push(chunk));

      // Once the stream has no more data, join the chunks into a string and return the string
      response.Body.once("end", () => resolve(responseDataChunks.join("")));
    } catch (err) {
      // swallow errors
      // Handle the error or throw
      console.log(`Ignored error getting object ${Key} from S3: ${err}`);
      // return reject(err);
      resolve(undefined);
    }
  });
};
