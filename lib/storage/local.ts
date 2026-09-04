import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertValidKey } from './keys';
import type { ObjectInfo, PresignedUpload, StorageDriver } from './types';

/**
 * Filesystem driver for development.
 *
 * It mints signed URLs pointing at an app route rather than returning a file
 * path, so the client-side upload and gallery code is byte-identical to what
 * runs against R2. A driver that behaved differently would let a bug hide until
 * the first deploy.
 */
export class LocalStorage implements StorageDriver {
  readonly name = 'local' as const;

  constructor(
    private readonly root: string,
    private readonly secret: string,
  ) {}

  private filePath(key: string): string {
    assertValidKey(key);
    const full = path.resolve(this.root, key);
    const rootResolved = path.resolve(this.root);
    // Belt and braces: the key pattern already forbids traversal, but a path
    // that escapes the root must never reach the filesystem.
    if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
      throw new Error('Refusing to write outside the storage root');
    }
    return full;
  }

  async presignUpload(key: string, contentType: string, expiresInSeconds = 300): Promise<PresignedUpload> {
    assertValidKey(key);
    const expires = Date.now() + expiresInSeconds * 1000;
    const sig = signLocal(this.secret, 'PUT', key, expires);
    const params = new URLSearchParams({ key, expires: String(expires), sig });
    return {
      url: `/api/storage/local?${params.toString()}`,
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresInSeconds,
    };
  }

  async signedReadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    assertValidKey(key);
    const expires = Date.now() + expiresInSeconds * 1000;
    const sig = signLocal(this.secret, 'GET', key, expires);
    const params = new URLSearchParams({ key, expires: String(expires), sig });
    return `/api/storage/local?${params.toString()}`;
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const stat = await fs.stat(this.filePath(key));
      return { bytes: stat.size, mime: null };
    } catch {
      return null;
    }
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const file = this.filePath(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.filePath(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.filePath(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<number> {
    const dir = path.resolve(this.root, prefix);
    const rootResolved = path.resolve(this.root);
    if (!dir.startsWith(rootResolved + path.sep)) return 0;
    let count = 0;
    try {
      const walk = async (d: string): Promise<void> => {
        for (const entry of await fs.readdir(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) await walk(full);
          else {
            await fs.rm(full, { force: true });
            count += 1;
          }
        }
      };
      await walk(dir);
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // Absent prefix deletes nothing, which is the correct outcome.
    }
    return count;
  }
}

export function signLocal(secret: string, method: string, key: string, expires: number): string {
  return createHmac('sha256', secret).update(`${method}\n${key}\n${expires}`).digest('base64url');
}

/** Verifies a local signed URL. Expiry is checked before the signature compare. */
export function verifyLocal(
  secret: string,
  method: string,
  key: string,
  expires: number,
  sig: string,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(expires) || expires <= now) return false;
  const expected = Buffer.from(signLocal(secret, method, key, expires));
  const given = Buffer.from(sig);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
