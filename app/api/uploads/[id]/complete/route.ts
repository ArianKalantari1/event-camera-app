import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, mediaAssets } from '@/lib/db/schema';
import { sessionForEvent } from '@/lib/auth';
import { recordAudit } from '@/lib/events';
import { eventState } from '@/lib/domain/event-state';
import { track } from '@/lib/analytics';
import { deriveThumbnail, explainImageProblem, inspectImage } from '@/lib/images';
import { storage, MAX_UPLOAD_BYTES, derivedKey, originalKey } from '@/lib/storage';

export const runtime = 'nodejs';
/** Decoding and resizing a large photo takes longer than a default edge budget. */
export const maxDuration = 60;

/**
 * Validates the uploaded bytes and promotes them to the keys that are served.
 *
 * Three things happen here that cannot happen anywhere else.
 *
 * The size is read back from storage rather than believed from the client. A
 * presigned PUT cannot bound what a caller uploads, so the check has to happen
 * afterwards — that is the difference between a limit and a suggestion.
 *
 * The bytes are decoded. What the file actually is decides its recorded type
 * and dimensions; the client's declared content type is a routing hint and
 * nothing more. Anything that is not a real image in a format a gallery can
 * show is rejected and deleted.
 *
 * The image is then copied to `original` and the thumbnail derived from those
 * same bytes, both under keys that were never presigned, and the incoming
 * object is deleted. That is what makes the reviewed artifact and the served
 * artifact the same picture, and what stops a still-valid signed url being
 * replayed over an approved photo.
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

  // Already promoted: a replay, or a second tab. Nothing to redo.
  if (row.asset.state !== 'awaiting_upload') {
    return NextResponse.json({ ok: true, state: row.asset.state, alreadyCompleted: true });
  }

  const driver = storage();
  const incoming = row.asset.storageKey;
  const head = await driver.head(incoming);

  if (!head) return NextResponse.json({ error: 'no bytes were received' }, { status: 409 });

  const discard = async () => {
    await driver.delete(incoming);
    await db().delete(mediaAssets).where(eq(mediaAssets.id, row.asset.id));
  };

  if (head.bytes > MAX_UPLOAD_BYTES) {
    await discard();
    await recordAudit({
      eventId: row.event.id,
      actorType: 'system',
      action: 'upload.rejected_oversize',
      target: row.asset.id,
      meta: { bytes: head.bytes },
    });
    return NextResponse.json({ error: 'that file is too large' }, { status: 413 });
  }

  const bytes = await driver.get(incoming);
  if (!bytes) return NextResponse.json({ error: 'no bytes were received' }, { status: 409 });

  const inspected = await inspectImage(bytes);
  if (!inspected.ok) {
    await discard();
    await recordAudit({
      eventId: row.event.id,
      actorType: 'system',
      action: 'upload.rejected_content',
      target: row.asset.id,
      meta: { problem: inspected.problem },
    });
    return NextResponse.json({ error: explainImageProblem(inspected.problem) }, { status: 415 });
  }

  const { mime, width, height } = inspected.image;
  const servedKey = originalKey(row.event.id, row.asset.id, mime);
  const thumbKey = derivedKey(row.event.id, row.asset.id, 'thumb');

  await driver.put(servedKey, bytes, mime);
  await driver.put(thumbKey, await deriveThumbnail(bytes), 'image/jpeg');

  // Conditional on the row still awaiting its bytes, so two concurrent
  // completions cannot both promote, and neither can resurrect something an
  // organizer has already rejected or removed.
  const updated = await db()
    .update(mediaAssets)
    .set({
      state: 'pending',
      storageKey: servedKey,
      mime,
      width,
      height,
      bytes: bytes.length,
      uploadedAt: new Date(),
    })
    .where(and(eq(mediaAssets.id, row.asset.id), eq(mediaAssets.state, 'awaiting_upload')))
    .returning({ id: mediaAssets.id });

  if (updated.length !== 1) {
    return NextResponse.json({ ok: true, state: 'pending', alreadyCompleted: true });
  }

  // Last: the signed url for this key is now worthless, because nothing reads it.
  await driver.delete(incoming);

  await track('upload.completed', {
    eventId: row.event.id,
    sessionId: session.session.id,
    meta: { bytes: bytes.length },
  });
  await recordAudit({
    eventId: row.event.id,
    actorType: 'attendee',
    actorId: session.session.id,
    action: 'upload.completed',
    target: row.asset.id,
    meta: { bytes: bytes.length, mime, width, height },
  });

  return NextResponse.json({ ok: true, state: 'pending' });
}
