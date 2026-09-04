import { notFound } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mediaAssets, eventSessions } from '@/lib/db/schema';
import { isConsoleKey } from '@/lib/console';
import { findEventBySlug } from '@/lib/events';
import { formatDateRange } from '@/lib/format';
import { absolute, paths } from '@/lib/routes';
import { Queue, type QueueItem } from './queue';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ key: string; slug: string }>;
}

export default async function ConsolePage({ params }: Props) {
  const { key, slug } = await params;

  // A wrong key is a 404, not a 403: a 403 confirms the console exists here.
  if (!isConsoleKey(key)) notFound();

  const loaded = await findEventBySlug(slug);
  if (!loaded) notFound();

  const { event, state } = loaded;

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
        <p className="label">Organizer console</p>
        <h1 style={{ margin: 0 }}>{event.title}</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {formatDateRange(event.startsAt, event.endsAt, event.timezone)} ·{' '}
          {state.uploadsOpen ? 'uploads open' : 'uploads closed'} ·{' '}
          {state.galleryOpen ? 'gallery open' : 'gallery closed'}
        </p>
      </header>

      <section className="card stack" style={{ gap: 8 }}>
        <p className="label" style={{ margin: 0 }}>Attendee link</p>
        <code style={{ fontSize: 14, wordBreak: 'break-all' }}>{absolute(paths.event(event.slug))}</code>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn secondary" href={`/console/${key}/${event.slug}/poster`}>
            Printable poster
          </a>
          <a className="btn secondary" href={`/console/${key}/${event.slug}/screen`} target="_blank" rel="noopener noreferrer">
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
        <Queue items={pending} consoleKey={key} />
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>Approved ({approved.length})</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Live in the attendee gallery now.
        </p>
        <Queue items={approved} consoleKey={key} />
      </section>

      {rejected.length > 0 ? (
        <section className="stack" style={{ gap: 10 }}>
          <h2 style={{ margin: 0 }}>Rejected ({rejected.length})</h2>
          <Queue items={rejected} consoleKey={key} />
        </section>
      ) : null}
    </main>
  );
}
