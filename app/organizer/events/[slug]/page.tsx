import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mediaAssets, eventSessions } from '@/lib/db/schema';
import { currentOrganizer, organizerFor } from '@/lib/organizer';
import { eventState } from '@/lib/domain/event-state';
import { formatDateRange } from '@/lib/format';
import { absolute, paths } from '@/lib/routes';
import { Queue, type QueueItem } from './queue';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EventConsole({ params }: Props) {
  const { slug } = await params;

  if (!(await currentOrganizer())) redirect('/organizer/login');

  // Null covers both "no such event" and "not your event", and both answer 404.
  // Whether an event exists is not something to confirm to someone without
  // access to it.
  const context = await organizerFor(slug);
  if (!context) notFound();

  const { event, role } = context;
  const state = eventState(event);

  const rows = await db()
    .select({ asset: mediaAssets, session: eventSessions })
    .from(mediaAssets)
    .leftJoin(eventSessions, eq(eventSessions.id, mediaAssets.sessionId))
    .where(
      and(
        eq(mediaAssets.eventId, event.id),
        inArray(mediaAssets.state, ['pending', 'approved', 'rejected']),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt));

  const toItem = (r: (typeof rows)[number]): QueueItem => ({
    id: r.asset.id,
    state: r.asset.state as QueueItem['state'],
    createdAt: r.asset.createdAt.toISOString(),
    contributor: r.session?.displayName ?? null,
    bytes: r.asset.bytes,
  });

  const pending = rows.filter((r) => r.asset.state === 'pending').map(toItem);
  const approved = rows.filter((r) => r.asset.state === 'approved').map(toItem);
  const rejected = rows.filter((r) => r.asset.state === 'rejected').map(toItem);

  return (
    <main className="page stack" style={{ maxWidth: 900 }}>
      <header className="stack" style={{ gap: 6 }}>
        <p className="label">Event console · you are {role}</p>
        <h1 style={{ margin: 0 }}>{event.title}</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {formatDateRange(event.startsAt, event.endsAt, event.timezone)} ·{' '}
          {state.uploadsOpen ? 'uploads open' : 'uploads closed'} ·{' '}
          {state.galleryOpen ? 'gallery open' : 'gallery closed'}
        </p>
      </header>

      <section className="card stack" style={{ gap: 8 }}>
        <p className="label" style={{ margin: 0 }}>Attendee link</p>
        <code style={{ fontSize: 14, wordBreak: 'break-all' }}>
          {absolute(paths.event(event.slug))}
        </code>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn secondary" href={`/organizer/events/${event.slug}/poster`}>
            Printable poster
          </Link>
          <a
            className="btn secondary"
            href={`/organizer/events/${event.slug}/screen`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Venue screen
          </a>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          The event code is stored hashed and cannot be shown here. Rotate it if it leaks.
        </p>
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>
          Waiting for review{pending.length > 0 ? ` (${pending.length})` : ''}
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Nothing here is visible to attendees yet.
        </p>
        <Queue items={pending} slug={slug} />
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>Approved ({approved.length})</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Live in the attendee gallery now.</p>
        <Queue items={approved} slug={slug} />
      </section>

      {rejected.length > 0 ? (
        <section className="stack" style={{ gap: 10 }}>
          <h2 style={{ margin: 0 }}>Rejected ({rejected.length})</h2>
          <Queue items={rejected} slug={slug} />
        </section>
      ) : null}
    </main>
  );
}
