import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { sessionForEvent } from '@/lib/auth';
import { findEventBySlug } from '@/lib/events';
import { listApprovedMedia } from '@/lib/media';
import { formatRemaining } from '@/lib/format';
import { paths } from '@/lib/routes';
import { explainClosed } from '@/lib/domain/event-state';
import { GalleryGrid } from './grid';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GalleryPage({ params }: Props) {
  const { slug } = await params;
  const loaded = await findEventBySlug(slug);
  if (!loaded || !loaded.state.publicPageVisible) notFound();

  const session = await sessionForEvent(loaded.event.id);
  if (!session) redirect(paths.eventGate(slug));

  const { event, state } = loaded;
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
              items={media.map((m) => ({ id: m.id, width: m.width, height: m.height }))}
            />
          )}
        </>
      )}
    </main>
  );
}
