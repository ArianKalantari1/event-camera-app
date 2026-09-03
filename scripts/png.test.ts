import { describe, it, expect } from 'vitest';
import { encodePng, seededRandom, placeholderImage } from './png';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('encodePng', () => {
  it('writes a well-formed PNG a decoder would accept', () => {
    const png = encodePng(4, 3, () => [10, 20, 30]);
    expect(png.subarray(0, 8)).toEqual(SIGNATURE);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(4);
    expect(png.readUInt32BE(20)).toBe(3);
    expect(png.subarray(-8, -4).toString('ascii')).toBe('IEND');
  });

  it('contains an IDAT chunk', () => {
    expect(encodePng(8, 8, () => [1, 2, 3]).includes(Buffer.from('IDAT'))).toBe(true);
  });
});

describe('seededRandom', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const c = seededRandom(8);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
  });

  it('stays within [0, 1)', () => {
    const r = seededRandom(3);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('placeholderImage', () => {
  it('reseeds to byte-identical output, so the demo gallery is stable', () => {
    expect(placeholderImage(32, 24, 5)).toEqual(placeholderImage(32, 24, 5));
  });

  it('produces visibly different images for different seeds', () => {
    expect(placeholderImage(32, 24, 5)).not.toEqual(placeholderImage(32, 24, 6));
  });
});
