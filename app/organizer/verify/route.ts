import { NextResponse } from 'next/server';
import { consumeLoginToken, startOrganizerSession } from '@/lib/organizer';
import { recordAudit } from '@/lib/events';

export const runtime = 'nodejs';

/**
 * Redeems a sign-in link and redirects.
 *
 * A route handler rather than a page because it sets a cookie, and because the
 * redirect drops the token out of the address bar — leaving it there puts a
 * single-use credential into browser history and into the Referer of whatever
 * the organizer clicks next.
 *
 * The redirect target is built from the REQUEST's own origin, not from APP_URL.
 * APP_URL is the canonical public origin and belongs in emails and QR codes,
 * where a link has to survive being copied elsewhere. Using it for a same-origin
 * redirect sends the browser to a different host whenever the two differ — a
 * preview deployment, a custom domain, or a local server on another port.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const user = token ? await consumeLoginToken(token) : null;

  if (!user) {
    return NextResponse.redirect(new URL('/organizer/login?expired=1', req.url), { status: 303 });
  }

  await startOrganizerSession(user.id);
  await recordAudit({ actorType: 'organizer', actorId: user.id, action: 'auth.signed_in' });

  return NextResponse.redirect(new URL('/organizer', req.url), { status: 303 });
}
