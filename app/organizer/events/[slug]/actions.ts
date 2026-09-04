'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { mediaAssets, mediaReports } from '@/lib/db/schema';
import { organizerFor } from '@/lib/organizer';
import { recordAudit } from '@/lib/events';
import { track } from '@/lib/analytics';

export type Decision = 'approve' | 'reject' | 'remove';

const TARGET_STATE = {
  approve: 'approved',
  reject: 'rejected',
  remove: 'removed',
} as const;

/** Anything not removed and not still awaiting its bytes can be acted on. */
const ACTIONABLE = ['pending', 'approved', 'rejected'] as const;

/**
 * Records a moderation decision.
 *
 * The action re-resolves the caller's membership itself. A server action is a
 * public endpoint; that the page which rendered the button checked access
 * proves nothing about who is calling this.
 *
 * The update is conditional on the states a decision may legally act on, and
 * the affected row count is what proves it happened. Two organizers working the
 * same queue on their phones is the normal case at an event — without the
 * condition, a stale page would silently re-approve something the other person
 * just removed.
 *
 * Removal is terminal: a removed photo cannot be brought back here, because
 * somebody asked for it to be gone.
 */
export async function moderate(
  slug: string,
  assetId: string,
  decision: Decision,
): Promise<{ ok: boolean; message?: string }> {
  const context = await organizerFor(slug);
  if (!context) return { ok: false, message: 'You no longer have access to this event.' };

  const [asset] = await db()
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.eventId, context.event.id)))
    .limit(1);

  if (!asset) return { ok: false, message: 'That photo no longer exists.' };
  if (asset.state === 'removed') {
    return { ok: false, message: 'That photo was removed and cannot be restored here.' };
  }

  const updated = await db()
    .update(mediaAssets)
    .set({
      state: TARGET_STATE[decision],
      moderatedAt: new Date(),
      moderatedBy: context.user.id,
    })
    .where(and(eq(mediaAssets.id, assetId), inArray(mediaAssets.state, ACTIONABLE)))
    .returning({ id: mediaAssets.id });

  if (updated.length !== 1) return { ok: false, message: 'Someone else already handled that one.' };

  if (decision === 'approve') await track('moderation.approved', { eventId: context.event.id });
  if (decision === 'reject') await track('moderation.rejected', { eventId: context.event.id });

  await recordAudit({
    eventId: context.event.id,
    actorType: 'organizer',
    actorId: context.user.id,
    action: `moderation.${decision}`,
    target: assetId,
    meta: { from: asset.state, to: TARGET_STATE[decision], by: context.user.email },
  });

  // A moderation decision answers every open report on that photo. Leaving them
  // open would make the queue grow with work that is already done.
  if (decision === 'remove' || decision === 'reject') {
    await db()
      .update(mediaReports)
      .set({ state: 'actioned', resolvedAt: new Date(), resolvedBy: context.user.id })
      .where(and(eq(mediaReports.mediaId, assetId), eq(mediaReports.state, 'open')));
  }

  revalidatePath(`/organizer/events/${slug}`);
  return { ok: true };
}

/** Marks a report handled without acting on the photo. */
export async function dismissReport(slug: string, reportId: string): Promise<{ ok: boolean; message?: string }> {
  const context = await organizerFor(slug);
  if (!context) return { ok: false, message: 'You no longer have access to this event.' };

  const updated = await db()
    .update(mediaReports)
    .set({ state: 'dismissed', resolvedAt: new Date(), resolvedBy: context.user.id })
    .where(
      and(
        eq(mediaReports.id, reportId),
        eq(mediaReports.eventId, context.event.id),
        eq(mediaReports.state, 'open'),
      ),
    )
    .returning({ id: mediaReports.id });

  if (updated.length !== 1) return { ok: false, message: 'Someone else already handled that one.' };

  await recordAudit({
    eventId: context.event.id,
    actorType: 'organizer',
    actorId: context.user.id,
    action: 'report.dismissed',
    target: reportId,
    meta: { by: context.user.email },
  });

  revalidatePath(`/organizer/events/${slug}`);
  return { ok: true };
}
