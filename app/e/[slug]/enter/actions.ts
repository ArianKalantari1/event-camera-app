'use server';

import { redirect } from 'next/navigation';
import { clientKey, deviceKey, sessionForEvent, startSession } from '@/lib/auth';
import { verifyCode } from '@/lib/domain/codes';
import {
  GATE_PER_ADDRESS,
  GATE_PER_DEVICE,
  checkRateLimit,
  resetRateLimit,
} from '@/lib/domain/rate-limit';
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

  /*
   * The device is limited tightly and the address loosely. Checking the address
   * first would spend its budget on a device that is about to be refused
   * anyway; checking the device first means a locked-out phone stops consuming
   * the room's shared allowance.
   */
  const device = checkRateLimit(await deviceKey(`gate:${slug}`), GATE_PER_DEVICE);
  if (!device.allowed) {
    const minutes = Math.max(1, Math.ceil(device.retryAfterMs / 60_000));
    return {
      error: `Too many attempts from this phone. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask an organizer.`,
    };
  }

  const address = checkRateLimit(await clientKey(`gate:${slug}`), GATE_PER_ADDRESS);
  if (!address.allowed) {
    return { error: 'Too many attempts from this network. Ask an organizer to let you in.' };
  }
  const limit = device;

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

  // Clear this device's counter. The address ceiling is deliberately NOT reset:
  // someone who knows one valid code should not be able to refill the room's
  // shared allowance on demand.
  resetRateLimit(await deviceKey(`gate:${slug}`));

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
