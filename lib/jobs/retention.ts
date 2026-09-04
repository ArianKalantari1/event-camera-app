import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  auditEvents,
  events,
  mediaAssets,
  organizationMembers,
  organizerUsers,
} from '@/lib/db/schema';
import { mailer } from '@/lib/mail';
import { storage, eventPrefix } from '@/lib/storage';
import { formatDay } from '@/lib/format';

/**
 * Retention: warn, then delete.
 *
 * Two properties matter more than anything else here, because this job destroys
 * data that cannot be recovered.
 *
 * Idempotent. Both phases claim their work with a conditional update on a null
 * marker and act only if exactly one row was claimed. A crash halfway through,
 * a double invocation from two schedulers, or an operator running it twice
 * cannot warn an organizer twice or start a second purge of the same event.
 *
 * Auditable. Every purge writes an audit row with counts before the rows it
 * counted are gone, so the record of a deletion survives the deletion.
 *
 * Storage is emptied before the database rows are removed. The other order
 * would leave objects nothing points at — unreferenced, unbilled to any event,
 * and impossible to find again.
 *
 * Runs from `npm run job:retention`, so this module is not marked `server-only`:
 * that marker throws in a plain Node process, not merely in a client bundle.
 */

export const WARNING_DAYS = 7;

/**
 * How long a reservation may sit unfinished before it is swept.
 *
 * Comfortably longer than the signed-upload window, so a slow upload on venue
 * wifi is never cut off, and short enough that abandoned reservations and the
 * objects behind them do not accumulate.
 */
export const ABANDONED_UPLOAD_HOURS = 6;

export interface RetentionOptions {
  now?: Date;
  /** Report what would happen and change nothing, including sending no mail. */
  dryRun?: boolean;
}

export interface RetentionReport {
  warned: { slug: string; title: string; recipients: number }[];
  purged: { slug: string; title: string; mediaRows: number; objects: number }[];
  abandoned: number;
  dryRun: boolean;
}

/** Owners get the warning. Moderators cannot change retention, so telling them is noise. */
async function ownersOf(orgId: string): Promise<string[]> {
  const rows = await db()
    .select({ email: organizerUsers.email })
    .from(organizationMembers)
    .innerJoin(organizerUsers, eq(organizerUsers.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.role, 'owner')));
  return rows.map((r) => r.email);
}

export async function runRetention(options: RetentionOptions = {}): Promise<RetentionReport> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const report: RetentionReport = { warned: [], purged: [], abandoned: 0, dryRun };

  const warningHorizon = new Date(now.getTime() + WARNING_DAYS * 86_400_000);

  // ---- phase one: warn ----------------------------------------------------
  const dueWarning = await db()
    .select()
    .from(events)
    .where(
      and(
        isNotNull(events.retentionUntil),
        lte(events.retentionUntil, warningHorizon),
        isNull(events.retentionWarnedAt),
        isNull(events.purgedAt),
      ),
    );

  for (const event of dueWarning) {
    const recipients = await ownersOf(event.orgId);

    if (dryRun) {
      report.warned.push({ slug: event.slug, title: event.title, recipients: recipients.length });
      continue;
    }

    // Claim first. Mail that fails is recoverable; a warning sent twice is not
    // recoverable, and an organizer who is told twice stops reading them.
    const claimed = await db()
      .update(events)
      .set({ retentionWarnedAt: now })
      .where(and(eq(events.id, event.id), isNull(events.retentionWarnedAt)))
      .returning({ id: events.id });
    if (claimed.length !== 1) continue;

    const when = event.retentionUntil ? formatDay(event.retentionUntil, event.timezone) : 'soon';
    for (const to of recipients) {
      await mailer().send({
        to,
        subject: `Photos for ${event.title} are deleted on ${when}`,
        text: [
          `The originals for "${event.title}" are scheduled for deletion on ${when}.`,
          '',
          'Download anything you want to keep before then. After that date the files are gone;',
          'there is no copy to restore from.',
          '',
          'If you need longer, change the retention date in the event settings.',
        ].join('\n'),
      });
    }

    await db().insert(auditEvents).values({
      eventId: event.id,
      actorType: 'system',
      action: 'retention.warned',
      meta: { recipients: recipients.length, deleteOn: event.retentionUntil?.toISOString() ?? null },
    });

    report.warned.push({ slug: event.slug, title: event.title, recipients: recipients.length });
  }

  // ---- phase two: purge ---------------------------------------------------
  const duePurge = await db()
    .select()
    .from(events)
    .where(
      and(isNotNull(events.retentionUntil), lte(events.retentionUntil, now), isNull(events.purgedAt)),
    );

  for (const event of duePurge) {
    const rows = await db()
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(eq(mediaAssets.eventId, event.id));

    if (dryRun) {
      report.purged.push({
        slug: event.slug,
        title: event.title,
        mediaRows: rows.length,
        objects: 0,
      });
      continue;
    }

    const claimed = await db()
      .update(events)
      .set({ purgedAt: now })
      .where(and(eq(events.id, event.id), isNull(events.purgedAt)))
      .returning({ id: events.id });
    if (claimed.length !== 1) continue;

    // Written before the rows are deleted, so the record of what was destroyed
    // outlives the thing destroyed.
    await db().insert(auditEvents).values({
      eventId: event.id,
      actorType: 'system',
      action: 'retention.purged',
      meta: {
        mediaRows: rows.length,
        retentionUntil: event.retentionUntil?.toISOString() ?? null,
      },
    });

    // One prefix covers originals and every derivative, so nothing is orphaned
    // by a variant this code has not heard of.
    const objects = await storage().deletePrefix(eventPrefix(event.id));
    await db().delete(mediaAssets).where(eq(mediaAssets.eventId, event.id));

    report.purged.push({
      slug: event.slug,
      title: event.title,
      mediaRows: rows.length,
      objects,
    });
  }

  // ---- phase three: abandoned reservations --------------------------------
  // A row that never received its bytes is not a contribution. It is invisible
  // everywhere, but it and the object behind it both persist, so they are swept.
  const abandonedBefore = new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 3_600_000);
  const abandoned = await db()
    .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
    .from(mediaAssets)
    .where(
      and(eq(mediaAssets.state, 'awaiting_upload'), lte(mediaAssets.createdAt, abandonedBefore)),
    );

  if (dryRun) {
    report.abandoned = abandoned.length;
    return report;
  }

  for (const row of abandoned) {
    await storage().delete(row.storageKey);
    const removed = await db()
      .delete(mediaAssets)
      .where(and(eq(mediaAssets.id, row.id), eq(mediaAssets.state, 'awaiting_upload')))
      .returning({ id: mediaAssets.id });
    report.abandoned += removed.length;
  }

  return report;
}
