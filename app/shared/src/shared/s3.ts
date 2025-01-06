import { type DataRef, DataRefType } from "/@/shared/types.ts";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from "aws-sdk/client-s3";

// import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts';

const Bucket: string = Deno.env.get("AWS_S3_BUCKET") || "metaframe-asman-test";
const AWS_REGION: string = Deno.env.get("AWS_REGION") || "us-west-2";
const AWS_ENDPOINT: string | undefined = "http://minio:9000"; //Deno.env.get("AWS_ENDPOINT");
const AWS_ACCESS_KEY_ID: string = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_ACCESS_KEY: string = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;

console.log("Bucket", Bucket);
console.log("AWS_REGION", AWS_REGION);
console.log("AWS_ENDPOINT", AWS_ENDPOINT);
console.log("AWS_ACCESS_KEY_ID", AWS_ACCESS_KEY_ID);

export const bucketParams = {
  Bucket,
  ContentType: "application/octet-stream",
};

const config = {
  sslEnabled: AWS_ACCESS_KEY_ID?.includes("minio") ? false : true,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  region: AWS_REGION,
  endpoint: AWS_ACCESS_KEY_ID?.includes("minio") ? AWS_ENDPOINT : undefined,
  forcePathStyle: AWS_ENDPOINT ? true : undefined,
  signatureVersion: "v4",
};

export const s3Client = new S3Client(config);
try {
  const data = await s3Client.send(new ListBucketsCommand({ ...bucketParams }));
  console.log(
    "ListBucketsCommand Buckets:",
    data?.Buckets?.map((b) => b.Name),
  );
} catch (err) {
  console.error(`Failed to ListBucketsCommand: ${err}`);
}

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
  console.log(`sending to s3`, key);
  const response = await s3Client.send(command);
  console.log(`sending to s3 response`, response);
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
  return new Promise((resolve /* , reject */) => {
    const deleteObjectCommand = new DeleteObjectCommand({
      ...bucketParams,
      Key,
    });

    s3Client
      .send(deleteObjectCommand)
      .then(() => {
        resolve();
      })
      .catch((err: unknown) => {
        console.log(`Ignored error deleting object ${Key} from S3: ${err}`);
        resolve();
        // swallow errors
      });
  });
};

const getObject = (Key: string): Promise<string | undefined> => {
  return new Promise((resolve, reject) => {
    const getObjectCommand = new GetObjectCommand({ ...bucketParams, Key });

    s3Client.send(getObjectCommand)
      .then((response) => {
        // Store all of data chunks returned from the response data stream
        // into an array then use Array#join() to use the returned contents as a String
        const responseDataChunks: unknown[] = [];

        // Handle an error while streaming the response body
        response.Body?.once("error", (err: Error) => reject(err));

        // Attach a 'data' listener to add the chunks of data to our array
        // Each chunk is a Buffer instance
        response.Body?.on(
          "data",
          (chunk: unknown) => responseDataChunks.push(chunk),
        );

        // Once the stream has no more data, join the chunks into a string and return the string
        response.Body?.once("end", () => resolve(responseDataChunks.join("")));
      })
      .catch((err: unknown) => {
        // swallow errors
        // Handle the error or throw
        console.log(`Ignored error getting object ${Key} from S3: ${err}`);
        // return reject(err);
        resolve(undefined);
      });
  });
};
