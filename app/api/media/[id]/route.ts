import { NextResponse } from 'next/server';
import { authorizeMediaRead } from '@/lib/media';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * The only way to read a media object.
 *
 * Authorization happens here, on the image request. What happens next depends
 * on the size of what is being served, and the reason is measured rather than
 * assumed.
 *
 * Redirecting to a signed URL keeps large bytes off this server, but it costs a
 * second round trip. On a 400kbps link with 400ms of latency, a 40-tile gallery
 * took 12.7s to show its first screenful, because every thumbnail paid 800ms
 * before a byte moved and browsers only open about six connections per origin.
 *
 * So thumbnails are streamed straight through — they are tens of kilobytes, and
 * halving the round trips beats saving that bandwidth. Originals still redirect:
 * they are large, usually viewed one at a time, and worth offloading.
 *
 * Every denial answers 404. Distinguishing "pending moderation" from "does not
 * exist" would confirm to a stranger that a photo was uploaded.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const variant = new URL(req.url).searchParams.get('v') === 'thumb' ? 'thumb' : 'original';

  const auth = await authorizeMediaRead(id, variant);
  if (!auth.ok) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const driver = storage();

  // The thumbnail is derived server-side at completion, so it exists for
  // anything uploaded through the app. Seeded rows are the remaining case;
  // falling back to the original beats showing a hole.
  let key = auth.key;
  if (variant === 'thumb' && !(await driver.head(key))) key = auth.asset.storageKey;

  if (variant === 'thumb') {
    const body = await driver.get(key);
    if (!body) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'content-type': auth.asset.mime,
        // Private and short: the URL is scoped to this viewer's authorization,
        // which can be revoked by a moderation decision at any moment.
        'cache-control': 'private, max-age=300',
        // The bytes are attendee-supplied. Even validated as an image, they must
        // never be interpreted as anything a browser would execute.
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const url = await driver.signedReadUrl(key, 300);
  return NextResponse.redirect(new URL(url, req.url), {
    status: 302,
    headers: { 'cache-control': 'private, max-age=60' },
  });
}
