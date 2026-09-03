import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { sessionForEvent } from '@/lib/auth';
import { findEventBySlug, recordAudit } from '@/lib/events';
import { checkRateLimit, type RateLimitRule } from '@/lib/domain/rate-limit';
import { storage, ACCEPTED_MIME, MAX_UPLOAD_BYTES, originalKey, derivedKey } from '@/lib/storage';

export const runtime = 'nodejs';

/** Generous for a real contributor, ruinous for a script. */
const UPLOAD_RULE: RateLimitRule = { limit: 60, windowMs: 60 * 60 * 1000 };

const Body = z.object({
  slug: z.string().min(1),
  contentType: z.enum(ACCEPTED_MIME as [string, ...string[]]),
  declaredBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  originalFilename: z.string().max(255).optional(),
  consent: z.literal(true),
});

/**
 * Signs an upload and reserves the row.
 *
 * The row is written first, in `awaiting_upload`, so a signed URL always
 * corresponds to something the server intended. Bytes that never arrive leave
 * an abandoned row rather than an orphaned object nothing can account for.
 *
 * Two URLs come back: the display image and its thumbnail, both produced by the
 * uploading browser. That is what keeps a gallery grid off the originals
 * without any server-side image processing or job queue.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  const body = parsed.data;

  const loaded = await findEventBySlug(body.slug);
  if (!loaded || !loaded.state.publicPageVisible) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const session = await sessionForEvent(loaded.event.id);
  if (!session) return NextResponse.json({ error: 'not in this event' }, { status: 403 });

  if (!loaded.state.uploadsOpen) {
    return NextResponse.json(
      { error: 'uploads are closed', reason: loaded.state.uploadsClosedBecause },
      { status: 409 },
    );
  }

  const limit = checkRateLimit(`upload:${session.session.id}`, UPLOAD_RULE);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'too many uploads' }, { status: 429 });
  }

  const [asset] = await db()
    .insert(mediaAssets)
    .values({
      eventId: loaded.event.id,
      sessionId: session.session.id,
      // Placeholder: replaced below now that the generated id is known.
      storageKey: `events/${loaded.event.id}/original/pending`,
      originalFilename: body.originalFilename ?? null,
      mime: body.contentType,
      width: body.width ?? null,
      height: body.height ?? null,
      state: 'awaiting_upload',
    })
    .returning();

  const key = originalKey(loaded.event.id, asset.id, body.contentType);
  const thumbKey = derivedKey(loaded.event.id, asset.id, 'thumb');

  await db().update(mediaAssets).set({ storageKey: key }).where(eq(mediaAssets.id, asset.id));

  const driver = storage();
  const [upload, thumb] = await Promise.all([
    driver.presignUpload(key, body.contentType),
    driver.presignUpload(thumbKey, 'image/jpeg'),
  ]);

  await recordAudit({
    eventId: loaded.event.id,
    actorType: 'attendee',
    actorId: session.session.id,
    action: 'upload.signed',
    target: asset.id,
  });

  return NextResponse.json({ assetId: asset.id, upload, thumb });
}
