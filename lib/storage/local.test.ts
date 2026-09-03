import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalStorage, signLocal, verifyLocal } from './local';
import { originalKey, derivedKey, eventPrefix } from './keys';

const SECRET = 'test-secret-of-sufficient-length';
const EVENT = '11111111-2222-3333-4444-555555555555';
const ASSET = '66666666-7777-8888-9999-000000000000';

let root: string;
let store: LocalStorage;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-store-'));
  store = new LocalStorage(root, SECRET);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('round trip', () => {
  it('stores and returns the same bytes', async () => {
    const key = originalKey(EVENT, ASSET, 'image/jpeg');
    await store.put(key, Buffer.from('hello'), 'image/jpeg');
    expect((await store.get(key))?.toString()).toBe('hello');
    expect(await store.head(key)).toEqual({ bytes: 5, mime: null });
  });

  it('reports absent objects as null rather than throwing', async () => {
    const key = originalKey(EVENT, ASSET, 'image/jpeg');
    expect(await store.get(key)).toBeNull();
    expect(await store.head(key)).toBeNull();
  });

  it('deletes', async () => {
    const key = originalKey(EVENT, ASSET, 'image/jpeg');
    await store.put(key, Buffer.from('x'), 'image/jpeg');
    await store.delete(key);
    expect(await store.head(key)).toBeNull();
  });
});

describe('deletePrefix', () => {
  it('removes originals and derivatives together, so retention leaves nothing', async () => {
    await store.put(originalKey(EVENT, ASSET, 'image/jpeg'), Buffer.from('a'), 'image/jpeg');
    await store.put(derivedKey(EVENT, ASSET, 'thumb'), Buffer.from('b'), 'image/jpeg');

    expect(await store.deletePrefix(eventPrefix(EVENT))).toBe(2);
    expect(await store.head(originalKey(EVENT, ASSET, 'image/jpeg'))).toBeNull();
    expect(await store.head(derivedKey(EVENT, ASSET, 'thumb'))).toBeNull();
  });

  it('is idempotent, so a retry after a partial run is safe', async () => {
    expect(await store.deletePrefix(eventPrefix(EVENT))).toBe(0);
    expect(await store.deletePrefix(eventPrefix(EVENT))).toBe(0);
  });
});

describe('path safety', () => {
  it('refuses to write outside the storage root', async () => {
    await expect(store.put('events/../../escape.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow();
  });

  it('refuses malformed keys before they reach the filesystem', async () => {
    await expect(store.put('not/a/valid/key.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow(
      /invalid storage key/,
    );
  });
});

describe('signed URLs', () => {
  it('mints a URL carrying the key, expiry and signature', async () => {
    const key = originalKey(EVENT, ASSET, 'image/jpeg');
    const { url, method, headers } = await store.presignUpload(key, 'image/jpeg');
    const parsed = new URL(url, 'http://localhost');
    expect(method).toBe('PUT');
    expect(headers['content-type']).toBe('image/jpeg');
    expect(parsed.searchParams.get('key')).toBe(key);
    expect(parsed.searchParams.get('sig')).toBeTruthy();
  });

  it('accepts a signature it produced', () => {
    const expires = Date.now() + 60_000;
    const sig = signLocal(SECRET, 'PUT', 'k', expires);
    expect(verifyLocal(SECRET, 'PUT', 'k', expires, sig)).toBe(true);
  });

  it('rejects an expired signature even though it is otherwise valid', () => {
    const expires = Date.now() - 1;
    const sig = signLocal(SECRET, 'PUT', 'k', expires);
    expect(verifyLocal(SECRET, 'PUT', 'k', expires, sig)).toBe(false);
  });

  it('does not let a read signature be replayed as a write', () => {
    const expires = Date.now() + 60_000;
    const readSig = signLocal(SECRET, 'GET', 'k', expires);
    expect(verifyLocal(SECRET, 'PUT', 'k', expires, readSig)).toBe(false);
  });

  it('does not let a signature for one key be used for another', () => {
    const expires = Date.now() + 60_000;
    const sig = signLocal(SECRET, 'GET', 'key-a', expires);
    expect(verifyLocal(SECRET, 'GET', 'key-b', expires, sig)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const expires = Date.now() + 60_000;
    const sig = signLocal('another-secret', 'GET', 'k', expires);
    expect(verifyLocal(SECRET, 'GET', 'k', expires, sig)).toBe(false);
  });

  it('rejects a tampered expiry, so extending the window needs the secret', () => {
    const expires = Date.now() + 60_000;
    const sig = signLocal(SECRET, 'GET', 'k', expires);
    expect(verifyLocal(SECRET, 'GET', 'k', expires + 60_000, sig)).toBe(false);
  });

  it('rejects a non-numeric expiry', () => {
    expect(verifyLocal(SECRET, 'GET', 'k', Number.NaN, 'whatever')).toBe(false);
  });
});
