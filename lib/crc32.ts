/**
 * CRC-32 (IEEE 802.3), the checksum both PNG chunks and ZIP entries require.
 *
 * Table-driven and shared, because two independent copies of a checksum is two
 * places for the same subtle bug.
 */

const TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(buf: Uint8Array, seed = 0): number {
  let c = ~seed;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
