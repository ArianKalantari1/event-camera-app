import { redirect } from 'next/navigation';
import { currentOrganizer } from '@/lib/organizer';
import { hackathonDefaults, toLocalInput } from '@/lib/domain/event-form';
import { mostRecentLocalHour } from '@/lib/domain/zoned-time';
import { NewEventForm, type Defaults } from './form';

export const dynamic = 'force-dynamic';

/**
 * A shortlist rather than the full IANA database. Intl exposes several hundred
 * zones, and a select of that size is worse than a short list plus whatever the
 * server is set to.
 */
const COMMON_ZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Pacific/Auckland',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

export default async function NewEventPage() {
  if (!(await currentOrganizer())) redirect('/organizer/login');

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const zones = COMMON_ZONES.includes(timezone) ? COMMON_ZONES : [timezone, ...COMMON_ZONES];

  // Next Saturday morning is the shape of most of these events; an organizer
  // adjusts one field rather than filling in five.
  const start = new Date(mostRecentLocalHour(timezone, 9).getTime() + 7 * 86_400_000);
  const d = hackathonDefaults(start, timezone);

  // Only the event's own dates are prefilled. The photo windows are left blank
  // and derived server-side from whatever dates are submitted, so they can never
  // go stale against a date the organizer changed.
  const defaults: Defaults = {
    timezone,
    timezones: zones,
    startsAt: toLocalInput(start, timezone),
    endsAt: toLocalInput(d.endsAt, timezone),
  };

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>New event</h1>
      <p className="muted">
        It starts as a draft. Nothing is reachable, and no QR code is worth printing, until you
        publish it.
      </p>
      <NewEventForm defaults={defaults} />
    </main>
  );
}
