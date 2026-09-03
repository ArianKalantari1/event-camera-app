import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Organizer access for Demo Zero: a shared key carried in the URL.
 *
 * This is scaffolding and is labelled as such. It is not authentication: there
 * is no organizer identity behind it, so every moderation decision is recorded
 * as an anonymous organizer action. Milestone 1 replaces it with magic-link
 * sign-in, at which point only this file and the audit actor need to change —
 * every call site is already asking "is this an organizer?" rather than
 * checking a key inline.
 */

export function isConsoleKey(candidate: string): boolean {
  const expected = Buffer.from(env().ORGANIZER_CONSOLE_KEY);
  const given = Buffer.from(candidate);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** Throws rather than returning false, so a forgotten check cannot fail open. */
export function requireConsoleKey(candidate: string): void {
  if (!isConsoleKey(candidate)) throw new Error('organizer console access required');
}
