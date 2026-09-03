import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { events, mediaAssets, type Event, type MediaAsset } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { eventState } from '@/lib/domain/event-state';
import { sessionForEvent } from '@/lib/auth';
import { derivedKey } from '@/lib/storage/keys';

export const CONSOLE_COOKIE = 'eh_console';

export type Viewer = 'organizer' | 'attendee' | 'public';

/**
 * Who is asking.
 *
 * The organizer path is a shared console key in a cookie, which is Demo Zero
 * scaffolding and nothing more — it is replaced by magic-link auth in
 * Milestone 1. It is written as a real check now so that every call site is
 * already asking the right question when the mechanism behind it changes.
 */
export async function resolveViewer(eventId: string): Promise<Viewer> {
  const jar = await cookies();
  if (jar.get(CONSOLE_COOKIE)?.value === env().ORGANIZER_CONSOLE_KEY) return 'organizer';
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

  const viewer = await resolveViewer(row.event.id);

  // An organizer moderates before approval, so they see pending items — but
  // still nothing that has been removed.
  if (viewer === 'organizer') {
    if (row.asset.state === 'removed' || row.asset.state === 'awaiting_upload') {
      return { ok: false, reason: 'not_found' };
    }
    return { ok: true, key: keyFor(row.asset, variant), asset: row.asset };
  }

  if (viewer !== 'attendee') return { ok: false, reason: 'no_session' };
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
