import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { sessionForEvent } from '@/lib/auth';
import { findEventBySlug } from '@/lib/events';
import { paths } from '@/lib/routes';
import { CodeForm } from './code-form';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EnterPage({ params }: Props) {
  const { slug } = await params;
  const loaded = await findEventBySlug(slug);
  if (!loaded || !loaded.state.publicPageVisible) notFound();

  if (await sessionForEvent(loaded.event.id)) redirect(paths.eventHub(slug));

  return (
    <main className="page stack">
      <p className="label">{loaded.event.title}</p>
      <h1>Enter the event code</h1>
      <p className="muted">
        The organizers share this at check-in. No account, no app — the code is all you need.
      </p>

      <CodeForm slug={slug} />

      <p className="muted" style={{ fontSize: 14 }}>
        Don’t have it? Ask an organizer, or{' '}
        <Link href={paths.event(slug)}>go back to the event page</Link>.
      </p>
    </main>
  );
}
