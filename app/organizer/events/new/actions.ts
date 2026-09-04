'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, organizationMembers, organizations } from '@/lib/db/schema';
import { currentOrganizer } from '@/lib/organizer';
import { generateEventCode, generateSlug, hashCode } from '@/lib/domain/codes';
import {
  eventFormSchema,
  isSupportedTimezone,
  toEventTimes,
  validateTimes,
} from '@/lib/domain/event-form';
import { recordAudit } from '@/lib/events';

export interface CreateResult {
  errors?: string[];
  /** Shown once, on the next screen. Only the hash is stored. */
  code?: string;
  slug?: string;
}

/** Slugs are random, but a collision would hand two events one URL. */
async function uniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = generateSlug();
    const [taken] = await db().select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1);
    if (!taken) return slug;
  }
  throw new Error('Could not allocate an event address. Try again.');
}

export async function createEvent(
  _prev: CreateResult | null,
  formData: FormData,
): Promise<CreateResult> {
  const user = await currentOrganizer();
  if (!user) redirect('/organizer/login');

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = eventFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => i.message) };
  }
  if (!isSupportedTimezone(parsed.data.timezone)) {
    return { errors: ['That timezone is not one this system knows.'] };
  }

  const entered = toEventTimes(parsed.data);

  /*
   * Blank windows are filled from the dates the organizer actually typed.
   *
   * Prefilling them in the form instead looks helpful and is not: the defaults
   * are computed from today, so the moment someone changes the event dates the
   * windows are stale, and they get told the gallery closes before it opens by
   * a form they never touched. Deriving them here means the defaults always
   * match the event.
   */
  const times = {
    startsAt: entered.startsAt,
    endsAt: entered.endsAt,
    uploadsOpenAt: entered.uploadsOpenAt ?? entered.startsAt,
    uploadsCloseAt:
      entered.uploadsCloseAt ?? new Date(entered.endsAt.getTime() + 86_400_000),
    galleryOpenAt: entered.galleryOpenAt ?? entered.startsAt,
    galleryCloseAt:
      entered.galleryCloseAt ?? new Date(entered.endsAt.getTime() + 14 * 86_400_000),
    retentionUntil:
      entered.retentionUntil ?? new Date(entered.endsAt.getTime() + 60 * 86_400_000),
  };
  const problems = validateTimes(times);
  if (problems.length) return { errors: problems };

  // A new event gets its own organization, with its creator as owner. Adding
  // people to an existing organization is a separate flow; guessing which
  // organization an event belongs to would eventually put an event in front of
  // people who were never meant to see it.
  const [org] = await db()
    .insert(organizations)
    .values({ name: parsed.data.title.slice(0, 120) })
    .returning();
  await db().insert(organizationMembers).values({ orgId: org.id, userId: user.id, role: 'owner' });

  const slug = await uniqueSlug();
  const code = generateEventCode();

  const [event] = await db()
    .insert(events)
    .values({
      orgId: org.id,
      slug,
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      contactEmail: parsed.data.contactEmail,
      timezone: parsed.data.timezone,
      lifecycle: 'draft',
      codeHash: await hashCode(code),
      codeRotatedAt: new Date(),
      ...times,
    })
    .returning();

  await recordAudit({
    eventId: event.id,
    actorType: 'organizer',
    actorId: user.id,
    action: 'event.created',
    meta: { slug, by: user.email },
  });

  // Returned rather than redirected to, because the code is displayed once and
  // a redirect would either lose it or put it in a URL.
  return { code, slug };
}
