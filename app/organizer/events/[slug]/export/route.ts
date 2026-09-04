import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { organizerFor } from '@/lib/organizer';
import { recordAudit } from '@/lib/events';
import { storage } from '@/lib/storage';
import { zipStream } from '@/lib/zip';

export const runtime = 'nodejs';
/** Never cached: an export reflects what is approved at the moment it is asked for. */
export const dynamic = 'force-dynamic';

/**
 * Bulk export of approved originals.
 *
 * Streams a store-method archive, reading each object only when its entry is
 * reached, so an event's whole media library never sits in memory at once. That
 * is what lets this work without a job queue: there is no artifact to build,
 * store and hand back later — the response is the artifact.
 *
 * Only approved media is included. Pending, rejected and removed photos are
 * excluded on purpose: an export is the file an organizer hands to a designer
 * or drops in a shared folder, and it must not carry pictures nobody approved.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const context = await organizerFor(slug);
  if (!context) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const rows = await db()
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      originalFilename: mediaAssets.originalFilename,
      createdAt: mediaAssets.createdAt,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.eventId, context.event.id), eq(mediaAssets.state, 'approved')))
    .orderBy(asc(mediaAssets.createdAt));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'nothing approved to export yet' }, { status: 409 });
  }

  const driver = storage();

  const sources = rows.map((row, index) => {
    // The contributor's filename is a hint, not the name: two people photograph
    // the same moment and both phones call it IMG_0001. The index keeps entries
    // unique and in the order they were contributed.
    const suffix = (row.storageKey.split('.').pop() ?? 'jpg').slice(0, 5);
    const stem = (row.originalFilename ?? 'photo').replace(/\.[^.]*$/, '');
    return {
      name: `${String(index + 1).padStart(4, '0')}-${stem}.${suffix}`,
      read: async () => {
        const body = await driver.get(row.storageKey);
        return body ? new Uint8Array(body) : null;
      },
    };
  });

  await recordAudit({
    eventId: context.event.id,
    actorType: 'organizer',
    actorId: context.user.id,
    action: 'media.exported',
    meta: { count: rows.length, by: context.user.email },
  });

  const filename = `${slug}-approved-photos.zip`;
  return new NextResponse(zipStream(sources), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
