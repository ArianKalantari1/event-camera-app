/**
 * Builds a UTC instant from a wall-clock time in a named zone.
 *
 * The seed anchors the demo event to plausible local hours. Without this it
 * anchors to whatever the server's clock happens to say, and an organizer is
 * shown a hackathon that starts at 1:46 in the morning.
 */

export function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - at.getTime();
}

/** The instant at which the given wall-clock time occurs in that zone. */
export function zonedTime(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hour: number,
  minute = 0,
): Date {
  const guess = Date.UTC(y, m - 1, d, hour, minute, 0);
  // Correct by the offset in effect at the guessed instant, then once more, so
  // a guess that lands on the wrong side of a DST transition still resolves.
  const first = new Date(guess - zoneOffsetMs(timeZone, new Date(guess)));
  return new Date(guess - zoneOffsetMs(timeZone, first));
}

/** Wall-clock calendar date in the given zone. */
export function zonedDateParts(timeZone: string, at: Date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const [year, month, day] = p.split('-').map(Number);
  return { year, month, day };
}

/**
 * The most recent occurrence of `hour` local time that is already in the past.
 * Keeps a seeded event reliably "live" while still starting at a sane hour.
 */
export function mostRecentLocalHour(timeZone: string, hour: number, now = new Date()): Date {
  const { year, month, day } = zonedDateParts(timeZone, now);
  const today = zonedTime(timeZone, year, month, day, hour);
  if (today.getTime() <= now.getTime()) return today;
  return new Date(today.getTime() - 86_400_000);
}
