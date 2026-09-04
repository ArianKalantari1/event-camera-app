import { crc32 } from './crc32';

/**
 * A streaming ZIP writer, store method only.
 *
 * No compression, deliberately. The payload is JPEG and PNG, which deflate
 * cannot meaningfully shrink — compressing them would burn CPU on every export
 * to save almost nothing, and store lets each entry be written the moment its
 * bytes are in hand.
 *
 * Streaming matters because the alternative is holding an entire event's media
 * in memory. Each entry's header is written after its buffer is read, so sizes
 * and checksums are known up front and no data descriptors are needed.
 *
 * Written rather than taken from a package because it is eighty lines and the
 * shape of a ZIP is fixed; a dependency here would be larger than the thing it
 * replaced.
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** Above this an archive needs ZIP64, which this writer does not implement. */
const MAX_ENTRIES = 65535;
const MAX_BYTES = 0xffffffff;

interface CentralEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

function u32(value: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value >>> 0, true);
  return b;
}

function u16(value: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, value & 0xffff, true);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export interface ZipSource {
  /** Path inside the archive. Sanitised by the caller. */
  name: string;
  /** Resolves the bytes only when this entry is reached, never all at once. */
  read: () => Promise<Uint8Array | null>;
}

/**
 * Names are written into an archive a person will extract, so anything that
 * could escape the extraction directory is removed rather than escaped.
 */
export function safeEntryName(name: string): string {
  return (
    name
      .replace(/\\/g, '/')
      .split('/')
      .filter((part) => part && part !== '.' && part !== '..')
      .join('/')
      .replace(/[\x00-\x1f:*?"<>|]/g, '_')
      .slice(0, 180) || 'file'
  );
}

export function zipStream(sources: ZipSource[]): ReadableStream<Uint8Array> {
  if (sources.length > MAX_ENTRIES) {
    throw new Error(`Too many files for a single archive (${sources.length}).`);
  }

  const encoder = new TextEncoder();
  const central: CentralEntry[] = [];
  let offset = 0;
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // Loops rather than returning empty. A pull that enqueues nothing is not
      // guaranteed to be retried promptly, and a skipped entry would otherwise
      // stall the stream instead of moving on to the next file.
      while (index < sources.length) {
        const source = sources[index++];
        const bytes = await source.read();
        // A missing object skips its entry rather than failing the archive: one
        // deleted file should not cost the organizer every other photo.
        if (!bytes) continue;

        const name = encoder.encode(safeEntryName(source.name));
        const crc = crc32(bytes);

        if (offset + bytes.length > MAX_BYTES) {
          controller.error(new Error('Archive is too large; export in smaller batches.'));
          return;
        }

        const header = concat([
          u32(LOCAL_SIG),
          u16(20), // version needed
          u16(0), // flags
          u16(0), // method: store
          u16(0), // time
          u16(0), // date
          u32(crc),
          u32(bytes.length), // compressed
          u32(bytes.length), // uncompressed
          u16(name.length),
          u16(0), // extra length
          name,
        ]);

        central.push({ name, crc, size: bytes.length, offset });
        controller.enqueue(header);
        controller.enqueue(bytes);
        offset += header.length + bytes.length;
        return;
      }

      const directoryStart = offset;
      for (const entry of central) {
        const record = concat([
          u32(CENTRAL_SIG),
          u16(20), // version made by
          u16(20), // version needed
          u16(0),
          u16(0), // method: store
          u16(0),
          u16(0),
          u32(entry.crc),
          u32(entry.size),
          u32(entry.size),
          u16(entry.name.length),
          u16(0),
          u16(0), // comment length
          u16(0), // disk number
          u16(0), // internal attrs
          u32(0), // external attrs
          u32(entry.offset),
          entry.name,
        ]);
        controller.enqueue(record);
        offset += record.length;
      }

      controller.enqueue(
        concat([
          u32(EOCD_SIG),
          u16(0),
          u16(0),
          u16(central.length),
          u16(central.length),
          u32(offset - directoryStart),
          u32(directoryStart),
          u16(0),
        ]),
      );
      controller.close();
    },
  });
}
