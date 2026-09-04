import { notFound } from 'next/navigation';
import { isConsoleKey } from '@/lib/console';
import { findEventBySlug } from '@/lib/events';
import { qrSvg } from '@/lib/qr';
import { absolute, paths } from '@/lib/routes';
import './screen.css';

interface Props {
  params: Promise<{ key: string; slug: string }>;
  searchParams: Promise<{ code?: string }>;
}

/**
 * The venue screen: one slide for a projector or a TV by the check-in desk.
 *
 * Unlike the poster this deep-links straight to the code gate. A screen is read
 * from a queue by someone who already has the code and wants in — the extra tap
 * through the public page is pure friction there.
 *
 * The code may be passed as ?code= so it can be shown beside the QR on a screen
 * an organizer controls. It is never stored: only the hash of the code exists in
 * the database, so this renders whatever the organizer typed into the URL and
 * keeps no record of it.
 */
export default async function ScreenPage({ params, searchParams }: Props) {
  const { key, slug } = await params;
  if (!isConsoleKey(key)) notFound();

  const loaded = await findEventBySlug(slug);
  if (!loaded) notFound();

  const { code } = await searchParams;
  const { event } = loaded;
  const url = absolute(paths.eventGate(event.slug));
  const qr = qrSvg(url);

  return (
    <main className="screen">
      <div className="left">
        <p className="kicker">Event photos</p>
        <h1>{event.title}</h1>
        <p className="lede">
          Scan the code, then enter the event code to see the gallery and add your own photos.
        </p>
        {code ? (
          <div className="code-block">
            <p className="code-label">Event code</p>
            <p className="code">{code.slice(0, 16).toUpperCase()}</p>
          </div>
        ) : (
          <p className="lede muted">Ask at the desk for the event code.</p>
        )}
      </div>

      <div className="right">
        <div className="qr-frame">
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={`QR code for ${url}`}>
            <rect width={qr.size} height={qr.size} fill="#fff" />
            <path d={qr.path} fill="#000" shapeRendering="crispEdges" />
          </svg>
        </div>
        <p className="url">{url.replace(/^https?:\/\//, '')}</p>
      </div>
    </main>
  );
}
