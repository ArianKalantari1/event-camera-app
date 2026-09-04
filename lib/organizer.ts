import 'server-only';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import {
  events,
  loginTokens,
  organizationMembers,
  organizerSessions,
  organizerUsers,
  type Event,
  type OrganizerUser,
  type OrgRole,
} from '@/lib/db/schema';
import { env } from '@/lib/env';
import {
  ORGANIZER_COOKIE,
  ORGANIZER_MAX_AGE_SECONDS,
  hashSessionToken,
  mintSessionToken,
  sessionCookieOptions,
} from '@/lib/domain/session';

/**
 * Organizer identity.
 *
 * Same session primitive as attendees — an opaque random cookie whose HMAC is
 * the only thing stored — on a separate cookie with a much shorter life.
 *
 * Authorization is always "is this user a member of the organization that owns
 * this event", resolved from the database on the request. Nothing is carried in
 * the cookie beyond the token, so removing someone's access takes effect on
 * their next request rather than when their token happens to expire.
 */

export interface OrganizerContext {
  user: OrganizerUser;
  role: OrgRole;
  event: Event;
}

/** Addresses are compared and stored lower-cased, so one person is one account. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function currentOrganizer(): Promise<OrganizerUser | null> {
  const jar = await cookies();
  const token = jar.get(ORGANIZER_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db()
    .select({ user: organizerUsers })
    .from(organizerSessions)
    .innerJoin(organizerUsers, eq(organizerUsers.id, organizerSessions.userId))
    .where(
      and(
        eq(organizerSessions.tokenHash, hashSessionToken(token, env().SESSION_SECRET)),
        isNull(organizerSessions.revokedAt),
        // Enforced here rather than trusted to the cookie's Max-Age: this
        // session can moderate and reconfigure an event.
        or(isNull(organizerSessions.expiresAt), gt(organizerSessions.expiresAt, new Date())),
      ),
    )
    .limit(1);

  return row?.user ?? null;
}

/**
 * Resolves the signed-in organizer's standing on one event.
 *
 * Returns null both when nobody is signed in and when the signed-in user has no
 * membership of the owning organization. Callers answer 404 either way: whether
 * an event exists is not something to confirm to someone with no access to it.
 */
export async function organizerFor(slug: string): Promise<OrganizerContext | null> {
  const user = await currentOrganizer();
  if (!user) return null;

  const [row] = await db()
    .select({ event: events, role: organizationMembers.role })
    .from(events)
    .innerJoin(organizationMembers, eq(organizationMembers.orgId, events.orgId))
    .where(and(eq(events.slug, slug), eq(organizationMembers.userId, user.id)))
    .limit(1);

  return row ? { user, role: row.role, event: row.event } : null;
}

/**
 * The signed-in organizer's membership of the org owning a given event id.
 *
 * Separate from organizerFor() because media requests arrive with an asset id
 * and resolve the event from it, rather than carrying a slug.
 */
export async function organizerForEventId(eventId: string): Promise<OrgRole | null> {
  const user = await currentOrganizer();
  if (!user) return null;

  const [row] = await db()
    .select({ role: organizationMembers.role })
    .from(events)
    .innerJoin(organizationMembers, eq(organizationMembers.orgId, events.orgId))
    .where(and(eq(events.id, eventId), eq(organizationMembers.userId, user.id)))
    .limit(1);

  return row?.role ?? null;
}

/** Every event the signed-in organizer can see, newest first. */
export async function eventsForOrganizer(userId: string) {
  return db()
    .select({ event: events, role: organizationMembers.role })
    .from(events)
    .innerJoin(organizationMembers, eq(organizationMembers.orgId, events.orgId))
    .where(eq(organizationMembers.userId, userId));
}

/** Changing an event's configuration or access is an owner's job, not a moderator's. */
export function canConfigure(role: OrgRole): boolean {
  return role === 'owner';
}

export async function startOrganizerSession(userId: string): Promise<void> {
  const token = mintSessionToken();
  await db()
    .insert(organizerSessions)
    .values({
      userId,
      tokenHash: hashSessionToken(token, env().SESSION_SECRET),
      expiresAt: new Date(Date.now() + ORGANIZER_MAX_AGE_SECONDS * 1000),
    });

  const jar = await cookies();
  jar.set(
    ORGANIZER_COOKIE,
    token,
    sessionCookieOptions(env().APP_URL.startsWith('https://'), ORGANIZER_MAX_AGE_SECONDS),
  );

  await db()
    .update(organizerUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(organizerUsers.id, userId));
}

export async function endOrganizerSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ORGANIZER_COOKIE)?.value;
  if (token) {
    await db()
      .update(organizerSessions)
      .set({ revokedAt: new Date() })
      .where(eq(organizerSessions.tokenHash, hashSessionToken(token, env().SESSION_SECRET)));
  }
  jar.delete(ORGANIZER_COOKIE);
}

/**
 * Redeems a sign-in link.
 *
 * The consuming update is conditional on the token still being unconsumed and
 * unexpired, and the affected row count is what authorizes the session. Reading
 * the row and then updating it would leave a window in which a forwarded link
 * could be redeemed twice.
 */
export async function consumeLoginToken(token: string): Promise<OrganizerUser | null> {
  const tokenHash = hashSessionToken(token, env().SESSION_SECRET);
  const now = new Date();

  const consumed = await db()
    .update(loginTokens)
    .set({ consumedAt: now })
    .where(and(eq(loginTokens.tokenHash, tokenHash), isNull(loginTokens.consumedAt)))
    .returning({ email: loginTokens.email, expiresAt: loginTokens.expiresAt });

  const row = consumed[0];
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;

  const [user] = await db()
    .select()
    .from(organizerUsers)
    .where(eq(organizerUsers.email, row.email))
    .limit(1);

  return user ?? null;
}
