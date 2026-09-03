import { describe, it, expect } from 'vitest';
import { generateEventCode, generateSlug, normalizeCode, hashCode, verifyCode } from './codes';

const CONFUSABLE = /[01OIL2Z5S8B]/;

describe('generated codes', () => {
  it('avoids every confusable character', () => {
    for (let i = 0; i < 200; i++) expect(generateEventCode()).not.toMatch(CONFUSABLE);
  });

  it('produces lowercase slugs of the requested length', () => {
    const slug = generateSlug(6);
    expect(slug).toHaveLength(6);
    expect(slug).toBe(slug.toLowerCase());
    expect(slug.toUpperCase()).not.toMatch(CONFUSABLE);
  });

  it('does not repeat itself across many draws', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateEventCode()));
    expect(seen.size).toBeGreaterThan(495);
  });
});

describe('normalizeCode', () => {
  it('folds case and drops the separators people add', () => {
    expect(normalizeCode(' hj4-k9 m ')).toBe('HJ4K9M');
    expect(normalizeCode('HJ4.K9_M')).toBe('HJ4K9M');
  });

  it('leaves unknown characters alone rather than guessing at them', () => {
    // A typed O is equally close to D and Q. Guessing would turn a correctly
    // typed code into a rejection, so an unmapped character simply fails.
    expect(normalizeCode('OQD')).toBe('OQD');
  });

  it('is idempotent', () => {
    const once = normalizeCode(' hj4-k9m ');
    expect(normalizeCode(once)).toBe(once);
  });
});

describe('hashCode / verifyCode', () => {
  it('accepts the correct code', async () => {
    const stored = await hashCode('HJ4K9M');
    expect(await verifyCode('HJ4K9M', stored)).toBe(true);
  });

  it('accepts the code as a person actually types it', async () => {
    const stored = await hashCode('HJ4K9M');
    expect(await verifyCode(' hj4-k9 m ', stored)).toBe(true);
  });

  it('rejects the wrong code', async () => {
    const stored = await hashCode('HJ4K9M');
    expect(await verifyCode('HJ4K9N', stored)).toBe(false);
  });

  it('salts, so the same code hashes differently every time', async () => {
    expect(await hashCode('HJ4K9M')).not.toBe(await hashCode('HJ4K9M'));
  });

  it('returns false rather than throwing for absent or malformed storage', async () => {
    expect(await verifyCode('HJ4K9M', null)).toBe(false);
    expect(await verifyCode('HJ4K9M', '')).toBe(false);
    expect(await verifyCode('HJ4K9M', 'not-a-hash')).toBe(false);
    expect(await verifyCode('HJ4K9M', 'scrypt$a$b$c$d$e')).toBe(false);
    expect(await verifyCode('HJ4K9M', 'bcrypt$16384$8$1$salt$aGk')).toBe(false);
    expect(await verifyCode('HJ4K9M', 'scrypt$16384$8$1$salt$')).toBe(false);
  });

  it('stores no trace of the code itself', async () => {
    const stored = await hashCode('HJ4K9M');
    expect(stored).not.toContain('HJ4K9M');
  });
});
