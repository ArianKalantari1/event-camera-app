import path from 'node:path';
import { env } from '@/lib/env';
import { LocalStorage } from './local';
import { S3Storage } from './s3';
import type { StorageDriver } from './types';

let cached: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (cached) return cached;
  const e = env();

  cached =
    e.STORAGE_DRIVER === 's3'
      ? new S3Storage({
          bucket: e.S3_BUCKET!,
          region: e.S3_REGION,
          endpoint: e.S3_ENDPOINT || undefined,
          accessKeyId: e.S3_ACCESS_KEY_ID!,
          secretAccessKey: e.S3_SECRET_ACCESS_KEY!,
          forcePathStyle: e.S3_FORCE_PATH_STYLE,
        })
      : new LocalStorage(path.resolve(process.cwd(), e.LOCAL_STORAGE_DIR), e.SESSION_SECRET);

  return cached;
}

/** Test helper. */
export function resetStorageCache(): void {
  cached = null;
}

export * from './keys';
export * from './types';
