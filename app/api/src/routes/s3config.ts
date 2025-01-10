import { ListBucketsCommand, S3Client } from "aws-sdk/client-s3";

// import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts';

const Bucket: string = Deno.env.get("AWS_S3_BUCKET") || "metaframe-asman-test";
const AWS_REGION: string = Deno.env.get("AWS_REGION") || "us-west-2";
const AWS_ENDPOINT: string | undefined = "http://minio:9000"; //Deno.env.get("AWS_ENDPOINT");
const AWS_ACCESS_KEY_ID: string = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_ACCESS_KEY: string = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;

// console.log("Bucket", Bucket);
// console.log("AWS_REGION", AWS_REGION);
// console.log("AWS_ENDPOINT", AWS_ENDPOINT);
// console.log("AWS_ACCESS_KEY_ID", AWS_ACCESS_KEY_ID);

export const bucketParams = {
  Bucket,
  ContentType: "application/octet-stream",
};

const config = {
  sslEnabled: AWS_ACCESS_KEY_ID.includes("minio") ? false : true,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  region: AWS_REGION,
  endpoint: AWS_ACCESS_KEY_ID?.includes("minio") ? AWS_ENDPOINT : undefined,
  forcePathStyle: AWS_ENDPOINT ? true : undefined,
  signatureVersion: "v4",
  fdjksalfj: "fdjksalfj",
};

console.dir(config, { depth: null });

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
// console.log('data', data);

// Connecting to a local MinIO server:
// export const s3Client = new S3Client({
//   endPoint: new URL(AWS_ENDPOINT).hostname,
//   port: AWS_ENDPOINT.includes("minio") ? 9000 : 443,
//   useSSL: AWS_ENDPOINT.includes("minio") ? false : true, //AWS_ENDPOINT?.startsWith("http:") ? false : undefined,
//   region: AWS_REGION,
//   accessKey: AWS_ACCESS_KEY_ID,
//   secretKey: AWS_SECRET_ACCESS_KEY,
//   bucket: Bucket,
//   pathStyle: AWS_ENDPOINT ? true : undefined,
// });
// for await (const obj of s3client.listObjects({ prefix: "data/concepts/" })) {
// for await (const obj of s3Client.listObjects({  })) {
//   console.log(obj);
// }
