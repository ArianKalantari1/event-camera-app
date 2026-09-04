import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { findEventBySlug, listResources, scopesFor } from '@/lib/events';
import { formatDateRange } from '@/lib/format';
import { paths } from '@/lib/routes';
import { track } from '@/lib/analytics';

/**
 * The public promotional page.
 *
 * Only public-scoped resources are queried. A draft event is a 404 rather than
 * a "not published" page: the existence of an unpublished event is itself
 * information the organizer has not chosen to share.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await findEventBySlug(slug);
  if (!loaded || !loaded.state.publicPageVisible) return { title: 'Event not found' };

  return {
    title: loaded.event.title,
    description: loaded.event.description ?? undefined,
    openGraph: {
      title: loaded.event.title,
      description: loaded.event.description ?? undefined,
      type: 'website',
    },
  };
}

export default async function PublicEventPage({ params }: Props) {
  const { slug } = await params;
  const loaded = await findEventBySlug(slug);
  if (!loaded || !loaded.state.publicPageVisible) notFound();

  const { event, state } = loaded;
  const resources = await listResources(event.id, scopesFor('public'));
  await track('public_page.view', { eventId: event.id });

  return (
    <main className="page stack">
      <header className="stack" style={{ gap: 8 }}>
        <p className="label">
          {state.phase === 'upcoming' ? 'Upcoming' : state.phase === 'live' ? 'Happening now' : 'Event'}
        </p>
        <h1>{event.title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
          {event.location ? ` · ${event.location}` : ''}
        </p>
      </header>

      {event.description ? <p>{event.description}</p> : null}

      {resources.length > 0 ? (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="label">Links</h2>
          {resources.map((r) =>
            r.url ? (
              <a key={r.id} className="card" href={r.url} rel="noopener noreferrer" target="_blank">
                <strong>{r.label}</strong>
                {r.detail ? <span className="muted"> — {r.detail}</span> : null}
              </a>
            ) : (
              <div key={r.id} className="card">
                <strong>{r.label}</strong>
                {r.detail ? <p className="muted" style={{ margin: '4px 0 0' }}>{r.detail}</p> : null}
              </div>
            ),
          )}
        </section>
      ) : null}

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Attending?</h2>
        <p className="muted" style={{ margin: 0 }}>
          The event hub has the schedule, the resources and the community photo gallery. You will
          need the event code, which the organizers share at check-in.
        </p>
        <Link className="btn" href={paths.eventGate(event.slug)}>
          Enter the hub
        </Link>
      </section>

      {event.contactEmail ? (
        <p className="muted" style={{ fontSize: 14 }}>
          Questions: <a href={`mailto:${event.contactEmail}`}>{event.contactEmail}</a>
        </p>
      ) : null}
    </main>
  );
}
