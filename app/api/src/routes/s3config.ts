import {
  ListBucketsCommand,
  S3Client,
} from 'npm:@aws-sdk/client-s3@3.582.0';

// import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts';

const Bucket :string = Deno.env.get("AWS_S3_BUCKET") || "metaframe-asman-test";
const AWS_REGION :string = Deno.env.get("AWS_REGION") || "us-west-2";
const AWS_ENDPOINT :string | undefined = Deno.env.get("AWS_ENDPOINT");
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID")!
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!

console.log('Bucket', Bucket);
console.log('AWS_REGION', AWS_REGION);
console.log('AWS_ENDPOINT', AWS_ENDPOINT);
console.log('AWS_ACCESS_KEY_ID', AWS_ACCESS_KEY_ID);
console.log('AWS_SECRET_ACCESS_KEY', AWS_SECRET_ACCESS_KEY);

export const bucketParams = { 
  Bucket,
  ContentType: "application/octet-stream",
 };


const config = {
  sslEnabled: AWS_ENDPOINT ? false : true,
    credentials:{
      accessKeyId:AWS_ACCESS_KEY_ID,
      secretAccessKey:AWS_SECRET_ACCESS_KEY
  },
  region: AWS_REGION,
  endpoint: AWS_ENDPOINT,
  forcePathStyle: AWS_ENDPOINT ? true : undefined,
  signatureVersion: 'v4',
};

export const s3Client = new S3Client(config);
try {
  const data = await s3Client.send(new ListBucketsCommand({...bucketParams}));
} catch(err) {
  console.error(err);
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


