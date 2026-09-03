import { describe, it, expect } from 'vitest';
import {
  mintSessionToken,
  hashSessionToken,
  digestsEqual,
  sessionCookieOptions,
  SESSION_COOKIE,
} from './session';

const SECRET = 'a-test-secret-of-sufficient-length';

describe('session tokens', () => {
  it('mints URL-safe tokens with real entropy', () => {
    const token = mintSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 1000 }, mintSessionToken));
    expect(seen.size).toBe(1000);
  });

  it('hashes deterministically for the same secret', () => {
    const token = mintSessionToken();
    expect(hashSessionToken(token, SECRET)).toBe(hashSessionToken(token, SECRET));
  });

  it('produces a different hash under a different secret', () => {
    const token = mintSessionToken();
    expect(hashSessionToken(token, SECRET)).not.toBe(hashSessionToken(token, 'other-secret'));
  });

  it('does not leak the token into its own hash', () => {
    const token = mintSessionToken();
    expect(hashSessionToken(token, SECRET)).not.toContain(token);
  });
});

describe('digestsEqual', () => {
  it('matches identical digests and rejects everything else', () => {
    expect(digestsEqual('abc', 'abc')).toBe(true);
    expect(digestsEqual('abc', 'abd')).toBe(false);
    expect(digestsEqual('abc', 'abcd')).toBe(false);
    expect(digestsEqual('', '')).toBe(true);
  });
});

describe('cookie options', () => {
  it('is httpOnly and lax in every environment', () => {
    const opts = sessionCookieOptions(false);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(SESSION_COOKIE).toBe('eh_session');
  });

  it('sets Secure when the request is https', () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
  });
});
