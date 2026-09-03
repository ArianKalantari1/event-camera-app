import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, mediaAssets } from '@/lib/db/schema';
import { sessionForEvent } from '@/lib/auth';
import { recordAudit } from '@/lib/events';
import { eventState } from '@/lib/domain/event-state';
import { storage, MAX_UPLOAD_BYTES, derivedKey } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * Confirms that bytes actually landed, and only then makes the row a
 * contribution awaiting moderation.
 *
 * The size is read back from storage rather than believed from the client. A
 * presigned PUT cannot bound what a caller uploads, so the check has to happen
 * after the fact: anything over the limit is deleted and the row is dropped,
 * which is the difference between a limit and a suggestion.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await db()
    .select({ asset: mediaAssets, event: events })
    .from(mediaAssets)
    .innerJoin(events, eq(events.id, mediaAssets.eventId))
    .where(eq(mediaAssets.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const session = await sessionForEvent(row.event.id);
  // Only the session that reserved the row may complete it.
  if (!session || session.session.id !== row.asset.sessionId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (!eventState(row.event).uploadsOpen) {
    return NextResponse.json({ error: 'uploads are closed' }, { status: 409 });
  }

  const driver = storage();
  const head = await driver.head(row.asset.storageKey);

  if (!head) {
    return NextResponse.json({ error: 'no bytes were received' }, { status: 409 });
  }

  if (head.bytes > MAX_UPLOAD_BYTES) {
    await driver.delete(row.asset.storageKey);
    await driver.delete(derivedKey(row.event.id, row.asset.id, 'thumb'));
    await db().delete(mediaAssets).where(eq(mediaAssets.id, row.asset.id));
    await recordAudit({
      eventId: row.event.id,
      actorType: 'system',
      action: 'upload.rejected_oversize',
      target: row.asset.id,
      meta: { bytes: head.bytes },
    });
    return NextResponse.json({ error: 'that file is too large' }, { status: 413 });
  }

  // Conditional update: only a row still awaiting its bytes may become pending.
  // A replayed request, or a second tab, must not resurrect something an
  // organizer has already rejected or removed.
  const updated = await db()
    .update(mediaAssets)
    .set({ state: 'pending', bytes: head.bytes, uploadedAt: new Date() })
    .where(and(eq(mediaAssets.id, row.asset.id), eq(mediaAssets.state, 'awaiting_upload')))
    .returning({ id: mediaAssets.id });

  if (updated.length !== 1) {
    return NextResponse.json({ ok: true, state: row.asset.state, alreadyCompleted: true });
  }

  await recordAudit({
    eventId: row.event.id,
    actorType: 'attendee',
    actorId: session.session.id,
    action: 'upload.completed',
    target: row.asset.id,
    meta: { bytes: head.bytes },
  });

  return NextResponse.json({ ok: true, state: 'pending' });
}
