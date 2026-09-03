import { describe, it, expect } from 'vitest';
import { originalKey, derivedKey, isValidKey, extensionFor, eventPrefix } from './keys';

const EVENT = '11111111-2222-3333-4444-555555555555';
const ASSET = '66666666-7777-8888-9999-000000000000';

describe('key layout', () => {
  it('separates originals from derivatives', () => {
    expect(originalKey(EVENT, ASSET, 'image/jpeg')).toBe(`events/${EVENT}/original/${ASSET}.jpg`);
    expect(derivedKey(EVENT, ASSET, 'thumb')).toBe(`events/${EVENT}/derived/${ASSET}/thumb.jpg`);
  });

  it('puts both under one deletable event prefix', () => {
    const prefix = eventPrefix(EVENT);
    expect(originalKey(EVENT, ASSET, 'image/jpeg').startsWith(prefix)).toBe(true);
    expect(derivedKey(EVENT, ASSET, 'thumb').startsWith(prefix)).toBe(true);
  });

  it('refuses a media type it has no extension for', () => {
    expect(extensionFor('image/gif')).toBeNull();
    expect(() => originalKey(EVENT, ASSET, 'image/gif')).toThrow(/Unsupported/);
  });
});

describe('isValidKey', () => {
  it('accepts the keys this module generates', () => {
    expect(isValidKey(originalKey(EVENT, ASSET, 'image/jpeg'))).toBe(true);
    expect(isValidKey(derivedKey(EVENT, ASSET, 'thumb'))).toBe(true);
  });

  it('rejects traversal, absolute paths and null bytes', () => {
    expect(isValidKey(`events/${EVENT}/original/../../../etc/passwd`)).toBe(false);
    expect(isValidKey(`/events/${EVENT}/original/a.jpg`)).toBe(false);
    expect(isValidKey(`events/${EVENT}/original//a.jpg`)).toBe(false);
    expect(isValidKey(`events/${EVENT}/original/a\0.jpg`)).toBe(false);
  });

  it('rejects anything outside the expected shape', () => {
    expect(isValidKey('')).toBe(false);
    expect(isValidKey('random/path.jpg')).toBe(false);
    expect(isValidKey(`events/${EVENT}/secret/a.jpg`)).toBe(false);
    expect(isValidKey(`events/not-a-uuid/original/a.jpg`)).toBe(false);
    expect(isValidKey(`events/${EVENT}/original/${'a'.repeat(600)}.jpg`)).toBe(false);
  });
});
