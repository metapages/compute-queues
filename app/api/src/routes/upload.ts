import { Context } from 'https://deno.land/x/hono@v4.1.0-rc.1/mod.ts';
import { PutObjectCommand } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';

import { DataRefType } from '../shared/mod.ts';
import {
  bucketParams,
  s3Client,
} from './s3config.ts';

export const uploadHandler = async (c: Context) => {
    const hash: string | undefined = c.req.param("hash");

    if (!hash) {
        c.status(400)
        return c.text('Missing hash');
    }
    // console.log('params', params);

    // Add headers for
    // https://www.reddit.com/r/aws/comments/j5lhhn/limiting_the_s3_put_file_size_using_presigned_urls/
    // In your service that's generating pre-signed URLs, use the Content-Length header as part of the V4 signature (and accept object size as a parameter from the app). In the client, specify the Content-Length when uploading to S3.
    // Your service can then refuse to provide a pre-signed URL for any object larger than some configured size.
    //  ContentLength: 4
    // ContentMD5?: string;
    // ContentType?: string;
    const command = new PutObjectCommand({ ...bucketParams, Key: hash, });
    try {

        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        // console.log('url', url);
        return c.json({
            url, ref: {
                // value: hash, // no http means we know it's an internal address, workers will know how to reach
                type: DataRefType.hash,
                hash,
            }
        });
    } catch (err) {
        console.error('uploadHandler error', err);
        c.status(500)
        return c.text('Failed to get signed URL');
    }
}
