import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipStream, safeEntryName } from './zip';
import { crc32 } from './crc32';

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

const src = (name: string, body: string | null) => ({
  name,
  read: async () => (body === null ? null : new TextEncoder().encode(body)),
});

describe('crc32', () => {
  it('matches the published check value for "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('safeEntryName', () => {
  it('strips traversal so an extracted archive cannot escape its directory', () => {
    expect(safeEntryName('../../etc/passwd')).toBe('etc/passwd');
    expect(safeEntryName('/absolute/path.jpg')).toBe('absolute/path.jpg');
    expect(safeEntryName('a/../../b.jpg')).toBe('a/b.jpg');
  });

  it('removes characters that break extraction on common filesystems', () => {
    expect(safeEntryName('a:b*c?.jpg')).toBe('a_b_c_.jpg');
  });

  it('never returns an empty name', () => {
    expect(safeEntryName('../..')).toBe('file');
    expect(safeEntryName('')).toBe('file');
  });
});

describe('zipStream', () => {
  it('produces an archive a real unzip accepts', async () => {
    const buf = await collect(zipStream([src('a.txt', 'hello'), src('nested/b.txt', 'world')]));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    const file = path.join(dir, 'out.zip');
    fs.writeFileSync(file, buf);

    // Verified by an external implementation, not by re-reading our own writer.
    const listing = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
    expect(listing).toContain('a.txt');
    expect(listing).toContain('nested/b.txt');

    execFileSync('unzip', ['-q', file, '-d', dir]);
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('hello');
    expect(fs.readFileSync(path.join(dir, 'nested/b.txt'), 'utf8')).toBe('world');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('passes an integrity check', async () => {
    const buf = await collect(zipStream([src('a.txt', 'hello'), src('b.bin', 'x'.repeat(5000))]));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    const file = path.join(dir, 'out.zip');
    fs.writeFileSync(file, buf);
    const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    expect(out).toContain('No errors detected');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips a missing object instead of failing the whole archive', async () => {
    const buf = await collect(zipStream([src('a.txt', 'hello'), src('gone.txt', null), src('c.txt', 'there')]));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    const file = path.join(dir, 'out.zip');
    fs.writeFileSync(file, buf);
    const listing = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
    expect(listing).toContain('a.txt');
    expect(listing).toContain('c.txt');
    expect(listing).not.toContain('gone.txt');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('emits a well-formed empty archive: exactly the end-of-directory record', async () => {
    // A 22-byte EOCD is a structurally valid empty zip. unzip still exits
    // non-zero on one ("zipfile is empty"), which is why the export route
    // refuses to build an archive with nothing in it rather than sending this.
    const buf = await collect(zipStream([]));
    expect(buf.length).toBe(22);
    expect(buf.readUInt32LE(0)).toBe(0x06054b50);
    expect(buf.readUInt16LE(10)).toBe(0); // entries on this disk
  });

  it('sanitises names on the way in, so a hostile filename cannot escape', async () => {
    const buf = await collect(zipStream([src('../../../evil.txt', 'nope')]));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    const file = path.join(dir, 'out.zip');
    fs.writeFileSync(file, buf);
    const listing = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
    expect(listing).not.toContain('..');
    expect(listing).toContain('evil.txt');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
