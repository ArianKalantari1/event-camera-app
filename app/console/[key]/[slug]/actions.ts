'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { requireConsoleKey } from '@/lib/console';
import { recordAudit } from '@/lib/events';

export type Decision = 'approve' | 'reject' | 'remove';

const TARGET_STATE = {
  approve: 'approved',
  reject: 'rejected',
  remove: 'removed',
} as const;

/**
 * Records a moderation decision.
 *
 * The update is conditional on the states a decision may legally act on, and
 * the affected row count is what proves it happened. Two organizers moderating
 * the same queue on their phones is the normal case at an event, not an edge
 * one — without the condition, a stale page would silently re-approve something
 * the other person just removed.
 *
 * Removal is terminal: a removed photo cannot be brought back from the console.
 * Someone asked for it to be gone.
 */
export async function moderate(
  consoleKey: string,
  assetId: string,
  decision: Decision,
): Promise<{ ok: boolean; message?: string }> {
  // The action re-checks the key itself. A server action is a public endpoint;
  // that the page which rendered the button checked it proves nothing about
  // who is calling this.
  requireConsoleKey(consoleKey);

  // Anything not yet removed, and not still awaiting its bytes, can be acted on.
  const ACTIONABLE = ['pending', 'approved', 'rejected'] as const;

  const [asset] = await db()
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
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
      moderatedBy: 'console',
    })
    .where(and(eq(mediaAssets.id, assetId), inArray(mediaAssets.state, ACTIONABLE)))
    .returning({ id: mediaAssets.id });

  if (updated.length !== 1) {
    return { ok: false, message: 'Someone else already handled that one.' };
  }

  await recordAudit({
    eventId: asset.eventId,
    actorType: 'organizer',
    actorId: 'console',
    action: `moderation.${decision}`,
    target: assetId,
    meta: { from: asset.state, to: TARGET_STATE[decision] },
  });

  revalidatePath('/console', 'layout');
  return { ok: true };
}
