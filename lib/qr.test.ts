import { describe, it, expect } from 'vitest';
import { qrSvg } from './qr';

describe('qrSvg', () => {
  it('encodes a URL into a path with a four-module quiet zone', () => {
    const qr = qrSvg('https://example.com/e/demo42');
    expect(qr.moduleCount).toBeGreaterThan(20);
    expect(qr.size).toBe(qr.moduleCount + 8);
    expect(qr.path.startsWith('M')).toBe(true);
  });

  it('keeps every module inside the viewBox', () => {
    const qr = qrSvg('https://example.com/e/demo42');
    const coords = [...qr.path.matchAll(/M(\d+) (\d+)h/g)].map(([, x, y]) => [Number(x), Number(y)]);
    expect(coords.length).toBeGreaterThan(50);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThan(qr.size - 4);
      expect(y).toBeLessThan(qr.size - 4);
    }
  });

  it('always sets the three finder patterns, which is what a scanner looks for', () => {
    const qr = qrSvg('https://example.com/e/demo42');
    const far = qr.moduleCount - 1 + 4;
    for (const [x, y] of [[4, 4], [far, 4], [4, far]]) {
      expect(qr.path).toContain(`M${x} ${y}h1v1h-1z`);
    }
  });

  it('is deterministic for the same input', () => {
    expect(qrSvg('https://example.com/e/demo42')).toEqual(qrSvg('https://example.com/e/demo42'));
  });

  it('stays sparser for a short URL than a long one', () => {
    const short = qrSvg('https://ev.nt/e/hj4k9m');
    const long = qrSvg('https://events.some-long-domain-name.example.com/events/2026/sydney-builders-hackathon/attendee-hub');
    expect(short.moduleCount).toBeLessThan(long.moduleCount);
  });

  it('grows with stronger error correction, which is why M is the default', () => {
    expect(qrSvg('https://example.com/e/demo42', 'H').moduleCount).toBeGreaterThanOrEqual(
      qrSvg('https://example.com/e/demo42', 'M').moduleCount,
    );
  });

  it('refuses empty input rather than emitting an unscannable symbol', () => {
    expect(() => qrSvg('')).toThrow();
  });
});
