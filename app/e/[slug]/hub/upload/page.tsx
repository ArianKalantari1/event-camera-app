import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { sessionForEvent } from '@/lib/auth';
import { findEventBySlug } from '@/lib/events';
import { formatRemaining } from '@/lib/format';
import { paths } from '@/lib/routes';
import { explainClosed } from '@/lib/domain/event-state';
import { Uploader } from './uploader';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function UploadPage({ params }: Props) {
  const { slug } = await params;
  const loaded = await findEventBySlug(slug);
  if (!loaded || !loaded.state.publicPageVisible) notFound();

  const session = await sessionForEvent(loaded.event.id);
  if (!session) redirect(paths.eventGate(slug));

  const { event, state } = loaded;
  const left = state.uploadsCloseAt ? formatRemaining(state.uploadsCloseAt) : null;

  return (
    <main className="page stack">
      <p style={{ margin: 0 }}>
        <Link href={paths.eventHub(slug)} style={{ fontSize: 14 }}>← {event.title}</Link>
      </p>
      <h1 style={{ margin: 0 }}>Add your photos</h1>

      {!state.uploadsOpen ? (
        <p className="muted">{explainClosed(state.uploadsClosedBecause)}</p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Photos are private until an organizer approves them. Nobody else sees them before that.
            {left ? ` ${left}.` : ''}
          </p>
          <Uploader slug={slug} />
        </>
      )}
    </main>
  );
}
