'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, mediaAssets, mediaReports } from '@/lib/db/schema';
import { clientKey, sessionForEvent } from '@/lib/auth';
import { checkRateLimit, type RateLimitRule } from '@/lib/domain/rate-limit';
import { eventState } from '@/lib/domain/event-state';
import { recordAudit } from '@/lib/events';

export interface ReportResult {
  ok?: boolean;
  error?: string;
}

const REPORT_RULE: RateLimitRule = { limit: 12, windowMs: 60 * 60 * 1000 };

const REASONS = ['in_photo', 'inappropriate', 'wrong_event', 'other'] as const;

/**
 * Asks an organizer to take a photo down.
 *
 * The photo is NOT hidden automatically. Auto-hiding on report hands anyone who
 * can see the gallery a button that empties it, and this gallery is reachable by
 * a shared code that spreads. A human decides, and the queue makes that quick.
 *
 * Reporting requires a session for the event but nothing else — no name, no
 * account, no justification. The people most likely to need this are the ones
 * who were photographed rather than the ones who uploaded, and every extra step
 * is a reason to give up instead.
 */
export async function reportMedia(
  slug: string,
  mediaId: string,
  _prev: ReportResult | null,
  formData: FormData,
): Promise<ReportResult> {
  const reason = String(formData.get('reason') ?? '');
  const detail = String(formData.get('detail') ?? '').trim().slice(0, 1000) || null;

  if (!REASONS.includes(reason as (typeof REASONS)[number])) {
    return { error: 'Choose a reason.' };
  }

  const [row] = await db()
    .select({ asset: mediaAssets, event: events })
    .from(mediaAssets)
    .innerJoin(events, eq(events.id, mediaAssets.eventId))
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);

  // Same 404-shaped answer as everywhere else: a reporter must not be able to
  // probe which ids exist by watching this response change.
  if (!row || row.event.slug !== slug) return { error: 'That photo could not be found.' };

  const session = await sessionForEvent(row.event.id);
  if (!session) return { error: 'That photo could not be found.' };
  if (!eventState(row.event).galleryOpen) return { error: 'That photo could not be found.' };

  if (!checkRateLimit(await clientKey(`report:${slug}`), REPORT_RULE).allowed) {
    return { error: 'Too many reports from here. Contact the organizers directly.' };
  }

  await db().insert(mediaReports).values({
    eventId: row.event.id,
    mediaId: row.asset.id,
    sessionId: session.session.id,
    reason: reason as (typeof REASONS)[number],
    detail,
  });

  await recordAudit({
    eventId: row.event.id,
    actorType: 'attendee',
    actorId: session.session.id,
    action: 'media.reported',
    target: row.asset.id,
    meta: { reason },
  });

  return { ok: true };
}
