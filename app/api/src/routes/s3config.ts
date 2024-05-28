import { S3Client } from 'npm:@aws-sdk/client-s3@3.582.0';

const Bucket :string = Deno.env.get("AWS_S3_BUCKET") || "metaframe-asman-test";
const AWS_DEFAULT_REGION :string = Deno.env.get("AWS_DEFAULT_REGION") || "us-west-2";
const AWS_ENDPOINT :string | undefined = Deno.env.get("AWS_ENDPOINT") || undefined;
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID")!
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!

// console.log('Bucket', Bucket);
// console.log('AWS_DEFAULT_REGION', AWS_DEFAULT_REGION);
// console.log('endpoint', endpoint);
// console.log('AWS_ACCESS_KEY_ID', AWS_ACCESS_KEY_ID);
// console.log('AWS_SECRET_ACCESS_KEY', AWS_SECRET_ACCESS_KEY);

export const bucketParams = { 
  Bucket,
  ContentType: "application/octet-stream",
 };


const config = {
  sslEnabled: AWS_ENDPOINT?.startsWith("http:") ? false : undefined,
    credentials:{
      accessKeyId:AWS_ACCESS_KEY_ID,
      secretAccessKey:AWS_SECRET_ACCESS_KEY
  },
  region: AWS_DEFAULT_REGION,
  endpoint: AWS_ENDPOINT,
  forcePathStyle: AWS_ENDPOINT ? true : undefined,
  signatureVersion: 'v4',
};

export const s3Client = new S3Client(config);

// const data = await s3Client.send(new ListBucketsCommand({...bucketParams}));
// console.log('data', data);
