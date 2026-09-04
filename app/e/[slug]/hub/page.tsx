import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { sessionForEvent } from '@/lib/auth';
import { findEventBySlug, listResources, scopesFor } from '@/lib/events';
import { listApprovedMedia } from '@/lib/media';
import { formatDateRange, formatDay, formatRemaining, formatTime } from '@/lib/format';
import { paths } from '@/lib/routes';
import { explainClosed } from '@/lib/domain/event-state';
import { track } from '@/lib/analytics';
import { GalleryGrid } from './gallery/grid';

interface Props {
  params: Promise<{ slug: string }>;
}

type ScheduleItem = { id: string; label: string; detail: string | null; startsAt: Date | null };

/** Groups schedule rows under their local day, preserving the given order. */
function groupByDay(items: ScheduleItem[], timeZone: string) {
  const groups: { day: string; items: ScheduleItem[] }[] = [];
  for (const item of items) {
    const day = item.startsAt ? formatDay(item.startsAt, timeZone) : '';
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

export default async function HubPage({ params }: Props) {
  const { slug } = await params;
  const loaded = await findEventBySlug(slug);
  if (!loaded || !loaded.state.publicPageVisible) notFound();

  const session = await sessionForEvent(loaded.event.id);
  if (!session) redirect(paths.eventGate(slug));

  const { event, state } = loaded;
  const resources = await listResources(event.id, scopesFor('attendee'));
  const schedule = resources.filter((r) => r.kind === 'schedule');
  const links = resources.filter((r) => r.kind === 'action' || r.kind === 'resource');
  const notes = resources.filter((r) => r.kind === 'note');

  await track('hub.view', { eventId: event.id, sessionId: session.session.id });

  const media = state.galleryOpen ? await listApprovedMedia(event.id, 12) : [];
  const uploadsLeft = state.uploadsCloseAt ? formatRemaining(state.uploadsCloseAt) : null;

  return (
    <main className="page stack">
      <header className="stack" style={{ gap: 6 }}>
        <p className="label">{state.phase === 'live' ? 'Happening now' : 'Event hub'}</p>
        <h1 style={{ margin: 0 }}>{event.title}</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
          {event.location ? ` · ${event.location}` : ''}
        </p>
      </header>

      <section className="card stack" style={{ gap: 12 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h2 style={{ margin: 0 }}>Add your photos</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {state.uploadsOpen
              ? 'Everything you add stays private until an organizer approves it.'
              : explainClosed(state.uploadsClosedBecause)}
          </p>
        </div>
        {state.uploadsOpen ? (
          <>
            <Link className="btn" href={paths.eventUpload(slug)}>
              Add photos
            </Link>
            {uploadsLeft ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{uploadsLeft} to contribute</p>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <p className="label" style={{ margin: 0 }}>Community gallery</p>
          {state.galleryOpen && media.length > 0 ? (
            <Link href={paths.eventGallery(slug)} style={{ fontSize: 14 }}>See all</Link>
          ) : null}
        </div>

        {!state.galleryOpen ? (
          <p className="muted" style={{ margin: 0 }}>{explainClosed(state.galleryClosedBecause)}</p>
        ) : media.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing approved yet. Photos appear here once an organizer has reviewed them.
          </p>
        ) : (
          <GalleryGrid slug={slug} items={media.map((m) => ({ id: m.id, width: m.width, height: m.height }))} />
        )}
      </section>

      {schedule.length > 0 ? (
        <section className="stack" style={{ gap: 8 }}>
          <p className="label" style={{ margin: 0 }}>Schedule</p>
          {/*
            Grouped by local day. A hackathon runs past midnight, and a flat
            list of 12-hour times reads as though it goes backwards there.
          */}
          {groupByDay(schedule, event.timezone).map((group) => (
            <div key={group.day} className="card stack" style={{ gap: 10 }}>
              {group.day ? (
                <p className="label" style={{ margin: 0 }}>{group.day}</p>
              ) : null}
              {group.items.map((s) => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 12 }}>
                  <span className="muted" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>
                    {s.startsAt ? formatTime(s.startsAt, event.timezone) : '—'}
                  </span>
                  <span>
                    <strong style={{ fontWeight: 600 }}>{s.label}</strong>
                    {s.detail ? <span className="muted"> — {s.detail}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      {links.length > 0 ? (
        <section className="stack" style={{ gap: 8 }}>
          <p className="label" style={{ margin: 0 }}>Links</p>
          {links.map((r) => (
            <a key={r.id} className="card" href={r.url ?? '#'} rel="noopener noreferrer" target="_blank">
              <strong>{r.label}</strong>
              {r.detail ? <span className="muted"> — {r.detail}</span> : null}
            </a>
          ))}
        </section>
      ) : null}

      {notes.map((n) => (
        <section key={n.id} className="card">
          <p className="label" style={{ margin: '0 0 4px' }}>{n.label}</p>
          <p style={{ margin: 0 }}>{n.detail}</p>
        </section>
      ))}
    </main>
  );
}
