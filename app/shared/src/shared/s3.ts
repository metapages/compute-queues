import { type DataRef, DataRefType } from "/@/shared/types.ts";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from "aws-sdk/client-s3";
import { ms } from "ms";
import { getSignedUrl } from "aws-sdk/s3-request-presigner";

// import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts';
const OneDayInSeconds = (ms("1 day") as number) / 1000;

const Bucket: string = Deno.env.get("AWS_S3_BUCKET") || "metaframe-asman-test";
const AWS_REGION: string = Deno.env.get("AWS_REGION") || "us-west-2";
const AWS_ENDPOINT: string | undefined = Deno.env.get("AWS_ENDPOINT");
const AWS_ACCESS_KEY_ID: string = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_ACCESS_KEY: string = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;

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
  endpoint: AWS_ACCESS_KEY_ID?.includes("minio")
    ? "http://minio:9000"
    : undefined,
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
    ContentType: "application/json",
  });

  const urlUpload = await getSignedUrl(s3Client, command, {
    expiresIn: OneDayInSeconds,
  });

  // Then upload directly to S3/MinIO using the presigned URL
  const responseUpload = await fetch(urlUpload, {
    // @ts-ignore: TS2353
    method: "PUT",
    // @ts-ignore: TS2353
    redirect: "follow",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
  if (!responseUpload.ok) {
    throw new Error(`Failed to upload URL: ${urlUpload}`);
  }
  await responseUpload.text();

  const ref: DataRef = {
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

const getObject = async (Key: string): Promise<string | undefined> => {
  const command = new GetObjectCommand({ ...bucketParams, Key });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: OneDayInSeconds,
  });

  const response = await fetch(url, {
    // @ts-ignore: TS2353
    method: "GET",
    // @ts-ignore: TS2353
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Failed to upload URL: ${url}`);
  }
  const text = await response.text();
  return text;
};
