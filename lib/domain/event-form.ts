import { z } from 'zod';
import { zonedTime } from './zoned-time';

/**
 * Turning an organizer's form into event rows.
 *
 * The hard part is time. A `datetime-local` input gives a wall-clock string with
 * no zone attached, and the browser's zone is the wrong one — an organizer in a
 * different city, or on a laptop still set to their last trip, means the event's
 * own timezone is the only correct interpretation. Every time on this form is
 * read as local to the event, never to the person filling it in.
 */

/** Wall clock as `datetime-local` produces it: YYYY-MM-DDTHH:mm. */
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const localDateTime = z
  .string()
  .regex(LOCAL_DATETIME, 'Use the date and time picker.');

const optionalLocalDateTime = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v === '' || LOCAL_DATETIME.test(v), 'Use the date and time picker.')
  .transform((v) => (v === '' ? null : v));

export const eventFormSchema = z.object({
  title: z.string().trim().min(2, 'Give the event a name.').max(160),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  location: z.string().trim().max(200).optional().transform((v) => v || null),
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'That is not an email address.'),
  timezone: z.string().min(1),
  startsAt: localDateTime,
  endsAt: localDateTime,
  uploadsOpenAt: optionalLocalDateTime,
  uploadsCloseAt: optionalLocalDateTime,
  galleryOpenAt: optionalLocalDateTime,
  galleryCloseAt: optionalLocalDateTime,
  retentionUntil: optionalLocalDateTime,
});

export type EventFormInput = z.input<typeof eventFormSchema>;
export type EventFormValues = z.output<typeof eventFormSchema>;

export interface EventTimes {
  startsAt: Date;
  endsAt: Date;
  uploadsOpenAt: Date | null;
  uploadsCloseAt: Date | null;
  galleryOpenAt: Date | null;
  galleryCloseAt: Date | null;
  retentionUntil: Date | null;
}

export function isSupportedTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** One wall-clock string resolved against a zone. Exported for single fields. */
export function localToInstant(local: string, timeZone: string): Date | null {
  if (!LOCAL_DATETIME.test(local)) return null;
  return toInstant(local, timeZone);
}

function toInstant(local: string, timeZone: string): Date {
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return zonedTime(timeZone, y, m, d, hh, mm);
}

/** Resolves every wall-clock field against the event's own zone. */
export function toEventTimes(values: EventFormValues): EventTimes {
  const tz = values.timezone;
  const at = (v: string | null) => (v === null ? null : toInstant(v, tz));
  return {
    startsAt: toInstant(values.startsAt, tz),
    endsAt: toInstant(values.endsAt, tz),
    uploadsOpenAt: at(values.uploadsOpenAt),
    uploadsCloseAt: at(values.uploadsCloseAt),
    galleryOpenAt: at(values.galleryOpenAt),
    galleryCloseAt: at(values.galleryCloseAt),
    retentionUntil: at(values.retentionUntil),
  };
}

/**
 * Ordering rules, checked after conversion.
 *
 * These are the mistakes that produce an event nobody can enter, and eventState
 * treats a window ending before it starts as closed — which is safe, but shows
 * the organizer a hub that silently does nothing. Better to refuse the form.
 */
export function validateTimes(times: EventTimes): string[] {
  const problems: string[] = [];
  const after = (a: Date | null, b: Date | null) =>
    a !== null && b !== null && a.getTime() >= b.getTime();

  if (after(times.startsAt, times.endsAt)) problems.push('The event ends before it starts.');
  if (after(times.uploadsOpenAt, times.uploadsCloseAt)) {
    problems.push('Uploads close before they open.');
  }
  if (after(times.galleryOpenAt, times.galleryCloseAt)) {
    problems.push('The gallery closes before it opens.');
  }
  // Deletion must not land before the gallery shuts: after(galleryCloseAt,
  // retentionUntil) reads "the gallery is still open at deletion time".
  if (after(times.galleryCloseAt, times.retentionUntil)) {
    problems.push(
      'Photos are deleted before the gallery closes, so attendees would see an empty gallery.',
    );
  }
  return problems;
}

/**
 * Defaults for a new event: the Community Hackathon shape from the plan.
 *
 * A fourteen-day gallery rather than seventy-two hours, because attendees look
 * for event photos the following week and a short window mostly manufactures
 * urgency. An organizer can shorten it; few will lengthen a default.
 */
export function hackathonDefaults(startsAt: Date, timeZone: string) {
  const hour = 3_600_000;
  const day = 86_400_000;
  const endsAt = new Date(startsAt.getTime() + 33 * hour);
  return {
    endsAt,
    uploadsOpenAt: startsAt,
    uploadsCloseAt: new Date(endsAt.getTime() + day),
    galleryOpenAt: startsAt,
    galleryCloseAt: new Date(endsAt.getTime() + 14 * day),
    retentionUntil: new Date(endsAt.getTime() + 60 * day),
    timeZone,
  };
}

/** Formats an instant back into the `datetime-local` value for a given zone. */
export function toLocalInput(at: Date | null, timeZone: string): string {
  if (!at) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
  // en-CA renders midnight as 24, which no input accepts.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}
