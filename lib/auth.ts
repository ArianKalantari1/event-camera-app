import 'server-only';
import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventSessions, events, type Event, type EventSession } from '@/lib/db/schema';
import { env } from '@/lib/env';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  hashSessionToken,
  mintSessionToken,
  sessionCookieOptions,
} from '@/lib/domain/session';

/**
 * Attendee device sessions.
 *
 * One cookie can hold a session for only one event at a time, which is correct
 * for the QR-to-hub flow: an attendee arrives at one event. Entering a second
 * event's code replaces the session rather than accumulating them.
 */

export interface AttendeeSession {
  session: EventSession;
  event: Event;
}

export async function currentSession(): Promise<AttendeeSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashSessionToken(token, env().SESSION_SECRET);

  const [row] = await db()
    .select({ session: eventSessions, event: events })
    .from(eventSessions)
    .innerJoin(events, eq(events.id, eventSessions.eventId))
    .where(
      and(
        eq(eventSessions.tokenHash, tokenHash),
        isNull(eventSessions.revokedAt),
        // Rows predating this column have a null expiry and stay valid; every
        // session minted since carries one and is checked against the clock.
        or(isNull(eventSessions.expiresAt), gt(eventSessions.expiresAt, new Date())),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** The session for THIS event, or null. A session for another event is not one for this. */
export async function sessionForEvent(eventId: string): Promise<AttendeeSession | null> {
  const current = await currentSession();
  return current && current.event.id === eventId ? current : null;
}

export async function startSession(eventId: string): Promise<EventSession> {
  const token = mintSessionToken();
  const tokenHash = hashSessionToken(token, env().SESSION_SECRET);

  const [session] = await db()
    .insert(eventSessions)
    .values({
      eventId,
      tokenHash,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    })
    .returning();

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(env().APP_URL.startsWith('https://')));

  return session;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db()
      .update(eventSessions)
      .set({ revokedAt: new Date() })
      .where(eq(eventSessions.tokenHash, hashSessionToken(token, env().SESSION_SECRET)));
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Best-effort client identity for rate limiting only.
 *
 * Forwarded headers are attacker-controlled, so this is never used for
 * authorization — only to make brute-forcing a shared code slower.
 */
export async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || h.get('x-real-ip') || 'unknown';
  return `${prefix}:${ip}`;
}
