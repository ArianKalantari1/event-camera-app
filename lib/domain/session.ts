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

/**
 * Organizer sessions use the same primitive but a separate cookie and a much
 * shorter life. An organizer session can moderate and reconfigure an event;
 * an attendee session can look at approved photos. Thirty days is right for
 * one of those and not the other.
 */
export const ORGANIZER_COOKIE = 'eh_organizer';
export const ORGANIZER_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Sign-in links are single-use and short-lived; long enough to switch to a mail app. */
export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;

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

export function sessionCookieOptions(secure: boolean, maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge,
  };
}
