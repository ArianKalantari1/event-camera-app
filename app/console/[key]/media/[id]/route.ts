import { NextResponse } from 'next/server';
import { isConsoleKey } from '@/lib/console';
import { authorizeMediaRead } from '@/lib/media';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * Media for the organizer console.
 *
 * Separate from /api/media so that organizer standing is proved by the key in
 * this URL rather than inferred from a cookie. The key is already in the
 * console URL the organizer is on, so nothing new is exposed, and the attendee
 * media route has no code path that could ever grant organizer access.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { key, id } = await params;
  if (!isConsoleKey(key)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const variant = new URL(req.url).searchParams.get('v') === 'thumb' ? 'thumb' : 'original';
  const auth = await authorizeMediaRead(id, variant, 'organizer');
  if (!auth.ok) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const driver = storage();
  let objectKey = auth.key;
  if (variant === 'thumb' && !(await driver.head(objectKey))) objectKey = auth.asset.storageKey;

  // Thumbnails stream rather than redirect, for the round-trip reason
  // documented in app/api/media/[id]/route.ts.
  if (variant === 'thumb') {
    const body = await driver.get(objectKey);
    if (!body) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return new NextResponse(new Uint8Array(body), {
      headers: { 'content-type': auth.asset.mime, 'cache-control': 'private, max-age=300' },
    });
  }

  const url = await driver.signedReadUrl(objectKey, 300);
  return NextResponse.redirect(new URL(url, req.url), {
    status: 302,
    headers: { 'cache-control': 'private, max-age=60' },
  });
}
