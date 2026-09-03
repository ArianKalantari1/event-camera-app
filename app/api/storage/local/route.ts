import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { storage } from '@/lib/storage';
import { LocalStorage, verifyLocal } from '@/lib/storage/local';
import { isValidKey, MAX_UPLOAD_BYTES } from '@/lib/storage/keys';

export const runtime = 'nodejs';

/**
 * Serves the development storage driver's signed URLs.
 *
 * This route exists so the browser talks to a signed URL in every environment.
 * Against R2 the same client code PUTs straight to the bucket; nothing about the
 * upload or gallery path changes between the two, which is what stops a bug
 * hiding until the first deploy.
 *
 * It refuses to run when the app is configured for S3 — a stray request here in
 * production must not find a working file endpoint.
 */

function localDriver(): LocalStorage | null {
  const driver = storage();
  return driver instanceof LocalStorage ? driver : null;
}

function authorize(req: Request, method: 'GET' | 'PUT') {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') ?? '';
  const expires = Number(url.searchParams.get('expires'));
  const sig = url.searchParams.get('sig') ?? '';

  if (!isValidKey(key)) return { ok: false as const, status: 400, error: 'invalid key' };
  if (!verifyLocal(env().SESSION_SECRET, method, key, expires, sig)) {
    return { ok: false as const, status: 403, error: 'link expired or invalid' };
  }
  return { ok: true as const, key };
}

export async function PUT(req: Request) {
  const driver = localDriver();
  if (!driver) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const auth = authorize(req, 'PUT');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = Buffer.from(await req.arrayBuffer());
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'too large' }, { status: 413 });
  }

  await driver.put(auth.key, body, req.headers.get('content-type') ?? 'application/octet-stream');
  return NextResponse.json({ ok: true, bytes: body.byteLength });
}

export async function GET(req: Request) {
  const driver = localDriver();
  if (!driver) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const auth = authorize(req, 'GET');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await driver.get(auth.key);
  if (!body) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'content-type': 'image/jpeg',
      // Private: the URL is short-lived and scoped to one viewer's authorization.
      'cache-control': 'private, max-age=300',
    },
  });
}
