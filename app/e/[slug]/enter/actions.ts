'use server';

import { redirect } from 'next/navigation';
import { clientKey, sessionForEvent, startSession } from '@/lib/auth';
import { verifyCode } from '@/lib/domain/codes';
import { CODE_ATTEMPTS, checkRateLimit, resetRateLimit } from '@/lib/domain/rate-limit';
import { findEventBySlug, recordAudit } from '@/lib/events';
import { paths } from '@/lib/routes';
import { track } from '@/lib/analytics';

export interface GateResult {
  error: string;
}

/**
 * Exchanges an event code for a device session.
 *
 * Ordering matters here. The rate limit is consumed before the code is checked,
 * so a wrong guess always costs an attempt. Checking first and only counting
 * failures leaves the limiter trivially bypassable by an attacker who does not
 * care about the response.
 */
export async function enterEvent(_prev: GateResult | null, formData: FormData): Promise<GateResult> {
  const slug = String(formData.get('slug') ?? '');
  const code = String(formData.get('code') ?? '');

  const loaded = await findEventBySlug(slug);
  if (!loaded || !loaded.state.publicPageVisible) {
    return { error: 'That event could not be found.' };
  }

  // Already in? Don't spend an attempt, don't mint a second session.
  if (await sessionForEvent(loaded.event.id)) redirect(paths.eventHub(slug));

  const limit = checkRateLimit(await clientKey(`gate:${slug}`), CODE_ATTEMPTS);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterMs / 60_000));
    return { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` };
  }

  if (!code.trim()) return { error: 'Enter the event code.' };

  await track('gate.attempt', { eventId: loaded.event.id });

  if (!(await verifyCode(code, loaded.event.codeHash))) {
    await recordAudit({
      eventId: loaded.event.id,
      actorType: 'attendee',
      action: 'gate.failed',
      meta: { remaining: limit.remaining },
    });
    return {
      error:
        limit.remaining > 0
          ? `That code is not right. ${limit.remaining} attempt${limit.remaining === 1 ? '' : 's'} left.`
          : 'That code is not right.',
    };
  }

  // Correct code: clear the counter so one person's typos do not lock out the
  // next attendee sharing the venue's network address.
  resetRateLimit(await clientKey(`gate:${slug}`));

  const session = await startSession(loaded.event.id);
  await track('gate.success', { eventId: loaded.event.id, sessionId: session.id });
  await recordAudit({
    eventId: loaded.event.id,
    actorType: 'attendee',
    actorId: session.id,
    action: 'gate.entered',
  });

  redirect(paths.eventHub(slug));
}
