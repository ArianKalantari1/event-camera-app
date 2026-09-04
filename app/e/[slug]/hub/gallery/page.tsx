import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { sessionForEvent } from '@/lib/auth';
import { findEventBySlug } from '@/lib/events';
import { listApprovedMedia } from '@/lib/media';
import { formatRemaining, formatTime } from '@/lib/format';
import { paths } from '@/lib/routes';
import { explainClosed } from '@/lib/domain/event-state';
import { track } from '@/lib/analytics';
import { GalleryGrid } from './grid';

interface Props {
  params: Promise<{ slug: string }>;
}

/*
 * Every route used to inherit "Event hub" from the root layout, so a screen
 * reader announced the same title on arrival at the gate, the hub, the gallery
 * and the upload screen — no confirmation that the navigation worked.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await findEventBySlug(slug);
  return { title: loaded ? `Community gallery — ${loaded.event.title}` : 'Event not found' };
}

export default async function GalleryPage({ params }: Props) {
  const { slug } = await params;
  const loaded = await findEventBySlug(slug);
  if (!loaded || !loaded.state.publicPageVisible) notFound();

  const session = await sessionForEvent(loaded.event.id);
  if (!session) redirect(paths.eventGate(slug));

  const { event, state } = loaded;
  await track('gallery.view', { eventId: event.id, sessionId: session.session.id });

  const media = state.galleryOpen ? await listApprovedMedia(event.id) : [];
  const left = state.galleryCloseAt ? formatRemaining(state.galleryCloseAt) : null;

  return (
    <main className="page stack">
      <p style={{ margin: 0 }}>
        <Link href={paths.eventHub(slug)} style={{ fontSize: 14 }}>← {event.title}</Link>
      </p>
      <h1 style={{ margin: 0 }}>Community gallery</h1>

      {!state.galleryOpen ? (
        <p className="muted">{explainClosed(state.galleryClosedBecause)}</p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {media.length} approved photo{media.length === 1 ? '' : 's'}
            {left ? ` · gallery ${left}` : ''}
          </p>
          {media.length === 0 ? (
            <p className="muted">
              Nothing approved yet. Photos appear here once an organizer has reviewed them.
            </p>
          ) : (
            <GalleryGrid
              slug={slug}
              items={media.map((m) => ({
                id: m.id,
                width: m.width,
                height: m.height,
                addedAt: formatTime(m.createdAt, event.timezone),
              }))}
            />
          )}
        </>
      )}
    </main>
  );
}
