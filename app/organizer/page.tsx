import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentOrganizer, eventsForOrganizer } from '@/lib/organizer';
import { formatDateRange } from '@/lib/format';
import { eventState } from '@/lib/domain/event-state';

export const dynamic = 'force-dynamic';

export default async function OrganizerHome() {
  const user = await currentOrganizer();
  if (!user) redirect('/organizer/login');

  const rows = await eventsForOrganizer(user.id);

  return (
    <main className="page stack" style={{ maxWidth: 900 }}>
      <h1 style={{ margin: 0 }}>Your events</h1>

      {rows.length === 0 ? (
        <p className="muted">
          No events yet. Ask whoever set up your organization to add you to one.
        </p>
      ) : (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 10 }}>
          {rows.map(({ event, role }) => {
            const state = eventState(event);
            return (
              <li key={event.id}>
                <Link
                  href={`/organizer/events/${event.slug}`}
                  className="card stack"
                  style={{ gap: 4, textDecoration: 'none', color: 'inherit' }}
                >
                  <strong>{event.title}</strong>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
                  </span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {event.lifecycle} · {state.uploadsOpen ? 'uploads open' : 'uploads closed'} ·{' '}
                    {state.galleryOpen ? 'gallery open' : 'gallery closed'} · you are {role}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
