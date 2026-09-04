import { deflateSync } from 'node:zlib';

/**
 * A minimal PNG encoder, so seeding needs no image library.
 *
 * The seed's job is to make the gallery look alive on first scan — an empty
 * grid shows an organizer nothing. Adding sharp or canvas for that would put a
 * native build step into a project whose whole image pipeline deliberately runs
 * in the browser.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** `rgb` receives pixel coordinates and returns three 0-255 channels. */
export function encodePng(
  width: number,
  height: number,
  rgb: (x: number, y: number) => [number, number, number],
): Buffer {
  // Each scanline is prefixed with a filter type. Row 0 uses None because there
  // is no row above it; every other row uses Up, storing the difference from the
  // row above. These images are smooth gradients, so those differences are
  // mostly zero and deflate collapses them. Measured on a 320x213 tile: 42.9KB
  // with filter 0 throughout, 22.6KB with Up. Those are bytes the gallery sends
  // over venue wifi, forty times over.
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(width * 3);
  const current = Buffer.alloc(width * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgb(x, y);
      current[x * 3] = r & 0xff;
      current[x * 3 + 1] = g & 0xff;
      current[x * 3 + 2] = b & 0xff;
    }

    const rowStart = y * stride;
    if (y === 0) {
      raw[rowStart] = 0; // None
      current.copy(raw, rowStart + 1);
    } else {
      raw[rowStart] = 2; // Up
      for (let i = 0; i < current.length; i++) {
        raw[rowStart + 1 + i] = (current[i] - previous[i]) & 0xff;
      }
    }
    previous = Buffer.from(current);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Deterministic PRNG, so reseeding produces the same gallery every time. */
export function seededRandom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

/**
 * An abstract stand-in for an event photo: a two-tone wash with soft blobs.
 * Deliberately not a picture of anyone — placeholder imagery of people is how
 * a demo ends up shipping a face nobody consented to.
 */
export function placeholderImage(width: number, height: number, seed: number): Buffer {
  const rnd = seededRandom(seed);
  const hueA = rnd() * 360;
  const hueB = (hueA + 40 + rnd() * 180) % 360;

  const blobs = Array.from({ length: 5 }, () => ({
    cx: rnd() * width,
    cy: rnd() * height,
    r: (0.14 + rnd() * 0.3) * Math.min(width, height),
    hue: (hueA + rnd() * 120) % 360,
    strength: 0.3 + rnd() * 0.5,
  }));

  return encodePng(width, height, (x, y) => {
    const t = (x / width) * 0.55 + (y / height) * 0.45;
    let [r, g, b] = hsl(hueA + (hueB - hueA) * t, 0.36, 0.34 + t * 0.2);

    for (const blob of blobs) {
      const dx = x - blob.cx;
      const dy = y - blob.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= blob.r) continue;
      const falloff = (1 - d / blob.r) ** 2 * blob.strength;
      const [br, bg, bb] = hsl(blob.hue, 0.45, 0.6);
      r += (br - r) * falloff;
      g += (bg - g) * falloff;
      b += (bb - b) * falloff;
    }

    return [Math.round(r), Math.round(g), Math.round(b)];
  });
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c]
    : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
