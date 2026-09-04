'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { eventResources, events } from '@/lib/db/schema';
import { canConfigure, organizerFor } from '@/lib/organizer';
import { generateEventCode, hashCode } from '@/lib/domain/codes';
import {
  eventFormSchema,
  isSupportedTimezone,
  localToInstant,
  toEventTimes,
  validateTimes,
} from '@/lib/domain/event-form';
import { eventState } from '@/lib/domain/event-state';
import { recordAudit } from '@/lib/events';

export interface SettingsResult {
  errors?: string[];
  saved?: boolean;
  /** A freshly rotated code, shown once. */
  code?: string;
}

/**
 * Every action here re-resolves the caller and re-checks the owner role.
 *
 * Server actions are public endpoints. The page decided what buttons to render;
 * it did not decide who may call this.
 */
async function requireOwner(slug: string) {
  const context = await organizerFor(slug);
  if (!context) return null;
  if (!canConfigure(context.role)) return null;
  return context;
}

export async function saveEvent(
  slug: string,
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  const context = await requireOwner(slug);
  if (!context) return { errors: ['Only an owner can change this event.'] };

  const parsed = eventFormSchema.safeParse(Object.fromEntries(formData) as Record<string, string>);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  if (!isSupportedTimezone(parsed.data.timezone)) {
    return { errors: ['That timezone is not one this system knows.'] };
  }

  const times = toEventTimes(parsed.data);
  const problems = validateTimes(times);
  if (problems.length) return { errors: problems };

  await db()
    .update(events)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      contactEmail: parsed.data.contactEmail,
      timezone: parsed.data.timezone,
      updatedAt: new Date(),
      ...times,
    })
    .where(eq(events.id, context.event.id));

  await recordAudit({
    eventId: context.event.id,
    actorType: 'organizer',
    actorId: context.user.id,
    action: 'event.updated',
    meta: { by: context.user.email },
  });

  revalidatePath(`/organizer/events/${slug}`, 'layout');
  return { saved: true };
}

export async function setLifecycle(
  slug: string,
  lifecycle: 'draft' | 'published' | 'archived',
): Promise<SettingsResult> {
  const context = await requireOwner(slug);
  if (!context) return { errors: ['Only an owner can change this event.'] };

  const now = new Date();
  await db()
    .update(events)
    .set({
      lifecycle,
      updatedAt: now,
      publishedAt: lifecycle === 'published' ? (context.event.publishedAt ?? now) : context.event.publishedAt,
      archivedAt: lifecycle === 'archived' ? now : null,
    })
    .where(eq(events.id, context.event.id));

  await recordAudit({
    eventId: context.event.id,
    actorType: 'organizer',
    actorId: context.user.id,
    action: `event.${lifecycle}`,
    meta: { from: context.event.lifecycle, by: context.user.email },
  });

  revalidatePath(`/organizer/events/${slug}`, 'layout');
  return { saved: true };
}

/**
 * Issues a new event code.
 *
 * The old code stops working immediately, but existing device sessions keep
 * theirs — attendees already inside are not thrown out because the code leaked
 * onto a group chat. Rotation closes the door; it does not empty the room.
 */
export async function rotateCode(slug: string): Promise<SettingsResult> {
  const context = await requireOwner(slug);
  if (!context) return { errors: ['Only an owner can change this event.'] };

  const code = generateEventCode();
  await db()
    .update(events)
    .set({ codeHash: await hashCode(code), codeRotatedAt: new Date(), updatedAt: new Date() })
    .where(eq(events.id, context.event.id));

  await recordAudit({
    eventId: context.event.id,
    actorType: 'organizer',
    actorId: context.user.id,
    action: 'event.code_rotated',
    meta: { by: context.user.email },
  });

  revalidatePath(`/organizer/events/${slug}`, 'layout');
  return { code };
}

export async function addResource(slug: string, formData: FormData): Promise<SettingsResult> {
  const context = await requireOwner(slug);
  if (!context) return { errors: ['Only an owner can change this event.'] };

  const kind = String(formData.get('kind') ?? 'resource');
  const label = String(formData.get('label') ?? '').trim();
  const detail = String(formData.get('detail') ?? '').trim() || null;
  const url = String(formData.get('url') ?? '').trim() || null;
  const visibility = String(formData.get('visibility') ?? 'attendee');
  const startsAtLocal = String(formData.get('startsAt') ?? '').trim();

  if (!label) return { errors: ['Give it a label.'] };
  if (!['action', 'resource', 'schedule', 'note'].includes(kind)) return { errors: ['Unknown kind.'] };
  if (!['public', 'attendee', 'organizer'].includes(visibility)) {
    return { errors: ['Unknown visibility.'] };
  }
  // http(s) only: a javascript: or data: URL here would be rendered as a link
  // to every attendee.
  if (url && !/^https?:\/\//i.test(url)) {
    return { errors: ['Links must start with http:// or https://'] };
  }

  // Schedule times, like every other time here, are read in the event's zone.
  const startsAt =
    kind === 'schedule' && startsAtLocal
      ? localToInstant(startsAtLocal, context.event.timezone)
      : null;

  await db().insert(eventResources).values({
    eventId: context.event.id,
    kind: kind as 'action' | 'resource' | 'schedule' | 'note',
    label: label.slice(0, 160),
    detail: detail?.slice(0, 500) ?? null,
    url,
    startsAt,
    visibility: visibility as 'public' | 'attendee' | 'organizer',
    sort: Math.floor(Date.now() / 1000) % 100000,
  });

  await recordAudit({
    eventId: context.event.id,
    actorType: 'organizer',
    actorId: context.user.id,
    action: 'resource.added',
    meta: { kind, visibility, by: context.user.email },
  });

  revalidatePath(`/organizer/events/${slug}`, 'layout');
  return { saved: true };
}

export async function removeResource(slug: string, resourceId: string): Promise<SettingsResult> {
  const context = await requireOwner(slug);
  if (!context) return { errors: ['Only an owner can change this event.'] };

  // Scoped to this event, so a resource id from another event cannot be deleted
  // by an owner who happens to be signed in somewhere.
  await db()
    .delete(eventResources)
    .where(and(eq(eventResources.id, resourceId), eq(eventResources.eventId, context.event.id)));

  await recordAudit({
    eventId: context.event.id,
    actorType: 'organizer',
    actorId: context.user.id,
    action: 'resource.removed',
    target: resourceId,
    meta: { by: context.user.email },
  });

  revalidatePath(`/organizer/events/${slug}`, 'layout');
  return { saved: true };
}

/** Read-only helper used by the settings page to describe the current state. */
export async function describeState(slug: string) {
  const context = await organizerFor(slug);
  return context ? eventState(context.event) : null;
}
