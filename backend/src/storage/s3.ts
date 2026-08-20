import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { env } from '../env.js'
import type { StorageAdapter } from './index.js'

/**
 * Production storage. Written against the S3 API, which Cloudflare R2 also
 * speaks — so this same class works with R2, Backblaze B2, MinIO or real AWS
 * S3, and only the endpoint changes.
 *
 * R2 is the intended target because it charges nothing for egress, and egress
 * is the cost that would otherwise dominate an image-heavy site.
 */
export class S3Storage implements StorageAdapter {
  readonly name = 's3'
  private readonly client: S3Client
  private readonly bucket: string

  constructor() {
    // env.ts has already verified these are present when STORAGE_DRIVER=s3.
    this.bucket = env.S3_BUCKET!
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    })
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Images are content-addressed by a uuid in the key and never change,
        // so they can be cached effectively forever.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  urlFor(key: string): string {
    return `${env.S3_PUBLIC_BASE_URL!.replace(/\/$/, '')}/${key}`
  }
}
