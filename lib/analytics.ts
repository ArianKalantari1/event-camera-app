import 'server-only';
import { and, countDistinct, eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analyticsEvents } from '@/lib/db/schema';
import { contributionsPerHundred, type FunnelCounts } from '@/lib/domain/funnel';

/**
 * First-party funnel counting.
 *
 * The metrics the plan asks for are counts of things that happen in this
 * application. No vendor is required to add them up, and not sending attendee
 * behaviour to a third party is the cheapest privacy promise available.
 *
 * What is recorded is a name, an event, and optionally the pseudonymous session
 * id. Never an address, a user agent, or anything that survives the session.
 */

export type AnalyticsName =
  | 'public_page.view'
  | 'gate.attempt'
  | 'gate.success'
  | 'hub.view'
  | 'gallery.view'
  | 'upload.started'
  | 'upload.completed'
  | 'media.viewed'
  | 'media.reported'
  | 'moderation.approved'
  | 'moderation.rejected'
  | 'export.downloaded';

/**
 * Never throws into a request.
 *
 * A page must not fail to render because a counter could not be written.
 * Losing a analytics row is a rounding error; losing the page is the product.
 */
export async function track(
  name: AnalyticsName,
  options: { eventId?: string | null; sessionId?: string | null; meta?: unknown } = {},
): Promise<void> {
  try {
    await db().insert(analyticsEvents).values({
      name,
      eventId: options.eventId ?? null,
      sessionId: options.sessionId ?? null,
      meta: (options.meta ?? null) as never,
    });
  } catch {
    // Intentionally swallowed. See above.
  }
}

/** One pass over the event's rows rather than a query per metric. */
export async function funnelFor(eventId: string): Promise<FunnelCounts> {
  const rows = await db()
    .select({ name: analyticsEvents.name, n: raw<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.eventId, eventId))
    .groupBy(analyticsEvents.name);

  const [sessions] = await db()
    .select({ n: countDistinct(analyticsEvents.sessionId) })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.eventId, eventId), eq(analyticsEvents.name, 'gate.success')));

  const at = (name: AnalyticsName) => rows.find((r) => r.name === name)?.n ?? 0;

  return {
    publicViews: at('public_page.view'),
    gateAttempts: at('gate.attempt'),
    gateSuccesses: at('gate.success'),
    uniqueSessions: Number(sessions?.n ?? 0),
    hubViews: at('hub.view'),
    galleryViews: at('gallery.view'),
    uploadsStarted: at('upload.started'),
    uploadsCompleted: at('upload.completed'),
    approved: at('moderation.approved'),
    rejected: at('moderation.rejected'),
    reports: at('media.reported'),
  };
}

export { contributionsPerHundred };
export type { FunnelCounts };
