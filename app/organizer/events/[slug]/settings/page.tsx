import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventResources } from '@/lib/db/schema';
import { canConfigure, currentOrganizer, organizerFor } from '@/lib/organizer';
import { toLocalInput } from '@/lib/domain/event-form';
import { formatTime } from '@/lib/format';
import {
  CodePanel,
  EventSettingsForm,
  LifecyclePanel,
  ResourcesPanel,
  type EventValues,
  type ResourceRow,
} from './panels';

export const dynamic = 'force-dynamic';

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

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SettingsPage({ params }: Props) {
  const { slug } = await params;
  if (!(await currentOrganizer())) redirect('/organizer/login');

  const context = await organizerFor(slug);
  if (!context) notFound();

  const { event, role } = context;

  // Moderators can work the queue but not reconfigure the event. Volunteers on
  // the day should not be one mis-tap from rotating the code or archiving it.
  if (!canConfigure(role)) {
    return (
      <main className="page stack">
        <p style={{ margin: 0 }}>
          <Link href={`/organizer/events/${slug}`} style={{ fontSize: 14 }}>← {event.title}</Link>
        </p>
        <h1 style={{ margin: 0 }}>Settings</h1>
        <p className="muted">
          You are a moderator on this event, so you can review photos but not change its settings.
          An owner can do that.
        </p>
      </main>
    );
  }

  const tz = event.timezone;
  const zones = COMMON_ZONES.includes(tz) ? COMMON_ZONES : [tz, ...COMMON_ZONES];

  const values: EventValues = {
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    contactEmail: event.contactEmail ?? '',
    timezone: tz,
    timezones: zones,
    startsAt: toLocalInput(event.startsAt, tz),
    endsAt: toLocalInput(event.endsAt, tz),
    uploadsOpenAt: toLocalInput(event.uploadsOpenAt, tz),
    uploadsCloseAt: toLocalInput(event.uploadsCloseAt, tz),
    galleryOpenAt: toLocalInput(event.galleryOpenAt, tz),
    galleryCloseAt: toLocalInput(event.galleryCloseAt, tz),
    retentionUntil: toLocalInput(event.retentionUntil, tz),
    lifecycle: event.lifecycle,
  };

  const rows = await db()
    .select()
    .from(eventResources)
    .where(eq(eventResources.eventId, event.id))
    .orderBy(asc(eventResources.sort), asc(eventResources.createdAt));

  const resources: ResourceRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    detail: r.detail,
    url: r.url,
    visibility: r.visibility,
    startsAt: r.startsAt ? formatTime(r.startsAt, tz) : null,
  }));

  return (
    <main className="page stack" style={{ maxWidth: 760, gap: 24 }}>
      <div className="stack" style={{ gap: 4 }}>
        <p style={{ margin: 0 }}>
          <Link href={`/organizer/events/${slug}`} style={{ fontSize: 14 }}>← {event.title}</Link>
        </p>
        <h1 style={{ margin: 0 }}>Settings</h1>
      </div>

      <LifecyclePanel slug={slug} lifecycle={event.lifecycle} />
      <CodePanel slug={slug} />

      <section className="stack" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>Details and windows</h2>
        <EventSettingsForm slug={slug} values={values} />
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>Links, schedule and notes</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Anything marked public appears on the promotional page, before anyone enters a code.
        </p>
        <ResourcesPanel slug={slug} resources={resources} />
      </section>
    </main>
  );
}
