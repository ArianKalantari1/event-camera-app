import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertValidKey } from './keys';
import type { ObjectInfo, PresignedUpload, StorageDriver } from './types';

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * Plain S3 API only — no provider-specific features anywhere in here.
 *
 * That is the whole reason the AWS-versus-Azure decision can stay deferred:
 * moving providers is an environment change and a bucket copy, not a rewrite.
 * Cloudflare R2 is the intended target because a gallery is almost entirely
 * egress, and R2 does not charge for it.
 */
export class S3Storage implements StorageDriver {
  readonly name = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async presignUpload(key: string, contentType: string, expiresInSeconds = 300): Promise<PresignedUpload> {
    assertValidKey(key);
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
    // The signature covers Content-Type, so the browser must send exactly this.
    return { url, method: 'PUT', headers: { 'content-type': contentType }, expiresInSeconds };
  }

  async signedReadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    assertValidKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async head(key: string): Promise<ObjectInfo | null> {
    assertValidKey(key);
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { bytes: res.ContentLength ?? 0, mime: res.ContentType ?? null };
    } catch {
      return null;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    assertValidKey(key);
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let token: string | undefined;

    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key);
      if (keys.length) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: { Objects: keys, Quiet: true },
          }),
        );
        deleted += keys.length;
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);

    return deleted;
  }
}
