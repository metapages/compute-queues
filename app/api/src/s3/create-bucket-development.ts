import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts';

const region = Deno.env.get("AWS_DEFAULT_REGION")!;
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID")!
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!
const AWS_ENDPOINT = Deno.env.get("AWS_ENDPOINT")!

if (!AWS_ENDPOINT || !AWS_ENDPOINT.includes("minio"))  {
  console.log('Non minio endpoint, skipping bucket creation.');
  Deno.exit(0);
}


const config = {
  // this is from docker-compose:
  endPoint: "minio",
  useSSL: false,
  port: 9000,
  region,
  accessKey: AWS_ACCESS_KEY_ID,
  secretKey: AWS_SECRET_ACCESS_KEY,
  pathStyle: true,
};
console.log(`config`, config);
const client = new S3Client(config);


const existsResults = await client.bucketExists("localbucket");
if (!existsResults) {
  await client.makeBucket("localbucket");
  console.log("👉 Bucket created: 'localbucket'");
} else {
  console.log('✅ Bucket already exists');
}


