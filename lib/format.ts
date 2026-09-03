/**
 * Dates are formatted in the EVENT's timezone, never the viewer's.
 *
 * An attendee opening the hub from a hotel on the other side of the country
 * still needs to read the schedule the room is running on. Every event carries
 * its own IANA zone for exactly this reason.
 */

function zone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    // A bad zone must not take a page down; UTC is wrong but readable.
    return 'UTC';
  }
}

export function formatDateRange(start: Date, end: Date, timeZone: string): string {
  const tz = zone(timeZone);
  const sameDay =
    new Intl.DateTimeFormat('en-AU', { timeZone: tz, dateStyle: 'short' }).format(start) ===
    new Intl.DateTimeFormat('en-AU', { timeZone: tz, dateStyle: 'short' }).format(end);

  const day = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' });

  return sameDay
    ? `${day.format(start)}, ${time.format(start)} – ${time.format(end)}`
    : `${day.format(start)}, ${time.format(start)} – ${day.format(end)}, ${time.format(end)}`;
}

export function formatTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: zone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}

export function formatDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: zone(timeZone),
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(at);
}

/**
 * Countdown copy for a closing window. Deliberately plain: the plan warns that
 * expiry can read as coercive, so this states a fact and adds no urgency.
 */
export function formatRemaining(until: Date, now: Date = new Date()): string | null {
  const ms = until.getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;

  // Clamp first, then pluralise off the clamped value — pluralising off the
  // raw count renders "1 minutes left" for anything under a minute.
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} left`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} left`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} left`;
}
