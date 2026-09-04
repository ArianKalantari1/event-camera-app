import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, mediaAssets, type Event, type MediaAsset } from '@/lib/db/schema';
import { eventState } from '@/lib/domain/event-state';
import { sessionForEvent } from '@/lib/auth';
import { organizerForEventId } from '@/lib/organizer';
import { derivedKey } from '@/lib/storage/keys';

export type Viewer = 'organizer' | 'attendee' | 'public';

/**
 * Who is asking, for THIS event.
 *
 * Organizer standing is a membership of the organization that owns this
 * specific event, resolved from the database on the request — not a blanket
 * credential that would make every event's media readable. Attendee standing is
 * a device session for this same event.
 */
export async function resolveViewer(eventId: string): Promise<Viewer> {
  if (await organizerForEventId(eventId)) return 'organizer';
  if (await sessionForEvent(eventId)) return 'attendee';
  return 'public';
}

export type MediaDenial =
  | 'not_found'
  | 'not_approved'
  | 'gallery_closed'
  | 'no_session';

/**
 * Authorization for one media object.
 *
 * This runs on the image request itself, not only on the listing that links to
 * it. Gating an index while leaving its images reachable is not a gate: ids are
 * enumerable, and that is precisely the bug MOONSHOT-DISPOSABLE shipped, where
 * "reveal later" photos stayed fetchable throughout the event.
 */
export async function authorizeMediaRead(
  assetId: string,
  variant: 'original' | 'thumb',
  now = new Date(),
): Promise<{ ok: true; key: string; asset: MediaAsset } | { ok: false; reason: MediaDenial }> {
  const [row] = await db()
    .select({ asset: mediaAssets, event: events })
    .from(mediaAssets)
    .innerJoin(events, eq(events.id, mediaAssets.eventId))
    .where(eq(mediaAssets.id, assetId))
    .limit(1);

  if (!row) return { ok: false, reason: 'not_found' };

  const level = await resolveViewer(row.event.id);

  // An organizer moderates before approval, so they see pending items — but
  // still nothing that has been removed.
  if (level === 'organizer') {
    if (row.asset.state === 'removed' || row.asset.state === 'awaiting_upload') {
      return { ok: false, reason: 'not_found' };
    }
    return { ok: true, key: keyFor(row.asset, variant), asset: row.asset };
  }

  if (level !== 'attendee') return { ok: false, reason: 'no_session' };
  if (row.asset.state !== 'approved') {
    // Deliberately indistinguishable from a missing asset for an attendee:
    // "pending" would confirm that someone uploaded something.
    return { ok: false, reason: 'not_approved' };
  }
  if (!eventState(row.event, now).galleryOpen) return { ok: false, reason: 'gallery_closed' };

  return { ok: true, key: keyFor(row.asset, variant), asset: row.asset };
}

function keyFor(asset: MediaAsset, variant: 'original' | 'thumb'): string {
  return variant === 'thumb' ? derivedKey(asset.eventId, asset.id, 'thumb') : asset.storageKey;
}

export async function listApprovedMedia(eventId: string, limit = 200): Promise<MediaAsset[]> {
  return db()
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.eventId, eventId), eq(mediaAssets.state, 'approved')))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(limit);
}

export async function countMediaByState(eventId: string) {
  const rows = await db()
    .select({ state: mediaAssets.state, id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.eventId, eventId));

  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.state] = (acc[r.state] ?? 0) + 1;
    return acc;
  }, {});
}

export type { Event };
