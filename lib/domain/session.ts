import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Attendee device sessions.
 *
 * The cookie carries an opaque random value; the database stores only its HMAC.
 * A leaked database therefore yields no working sessions, and because the token
 * itself is 256 bits of randomness there is nothing to guess.
 *
 * Nothing about the attendee is encoded in the token: no id, no name, no event.
 * The row is the only place that association exists, so revoking a session is a
 * single update rather than a token blocklist.
 */

export const SESSION_COOKIE = 'eh_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function mintSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('base64url');
}

/** Constant-time comparison for any two same-purpose digests. */
export function digestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
