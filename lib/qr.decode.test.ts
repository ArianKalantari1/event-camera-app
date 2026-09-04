import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { qrSvg } from './qr';

/**
 * Round-trip proof.
 *
 * The structural tests check that the symbol looks right; these check that an
 * INDEPENDENT decoder reads back exactly what was encoded. The QR code is the
 * product's entry point — "it renders" is not the same claim as "it scans", and
 * only one of those matters at a venue.
 */

const SCALE = 8;

/** Rasterises a symbol to RGBA pixels, the way a camera sensor would see it. */
function raster(path: string, size: number) {
  const px = size * SCALE;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);

  for (const [, xs, ys] of path.matchAll(/M(\d+) (\d+)h/g)) {
    const x0 = Number(xs) * SCALE;
    const y0 = Number(ys) * SCALE;
    for (let y = y0; y < y0 + SCALE; y++) {
      for (let x = x0; x < x0 + SCALE; x++) {
        const i = (y * px + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { data, px };
}

function decode(text: string, ec?: 'L' | 'M' | 'Q' | 'H') {
  const qr = qrSvg(text, ec);
  const { data, px } = raster(qr.path, qr.size);
  return jsQR(data, px, px)?.data ?? null;
}

describe('an independent decoder reads back what we encoded', () => {
  it('round-trips a production-shaped event URL', () => {
    const url = 'https://eventhub.example/e/hj4k9m';
    expect(decode(url)).toBe(url);
  });

  it('round-trips a localhost URL, which is what the seed prints', () => {
    const url = 'http://localhost:3000/e/demo42';
    expect(decode(url)).toBe(url);
  });

  it('round-trips a long URL that forces a bigger symbol', () => {
    const url =
      'https://events.some-long-domain-name.example.com/e/hj4k9m/hub/gallery?utm_source=poster';
    expect(decode(url)).toBe(url);
  });

  it('round-trips at every error-correction level', () => {
    const url = 'https://eventhub.example/e/hj4k9m';
    for (const ec of ['L', 'M', 'Q', 'H'] as const) expect(decode(url, ec)).toBe(url);
  });

  it('round-trips a URL containing characters that need escaping', () => {
    const url = 'https://eventhub.example/e/hj4k9m?ref=poster&n=1';
    expect(decode(url)).toBe(url);
  });
});
