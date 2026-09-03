import { notFound, redirect } from 'next/navigation';
import { sessionForEvent } from '@/lib/auth';
import { findEventBySlug } from '@/lib/events';
import { paths } from '@/lib/routes';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function HubPage({ params }: Props) {
  const { slug } = await params;
  const loaded = await findEventBySlug(slug);
  if (!loaded || !loaded.state.publicPageVisible) notFound();

  const session = await sessionForEvent(loaded.event.id);
  if (!session) redirect(paths.eventGate(slug));

  return (
    <main className="page stack">
      <p className="label">You’re in</p>
      <h1>{loaded.event.title}</h1>
      <p className="muted">The hub is being built. Gallery and uploads land next.</p>
    </main>
  );
}
