import { notFound, redirect } from 'next/navigation';
import { currentOrganizer, organizerFor } from '@/lib/organizer';
import { qrSvg } from '@/lib/qr';
import { absolute, paths } from '@/lib/routes';
import { formatDateRange } from '@/lib/format';
import './poster.css';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * The printable venue poster.
 *
 * Encodes the durable public event URL rather than a deep link into the hub:
 * a poster outlives the event it was printed for, gets photographed and
 * reshared, and the public page is the one destination that stays meaningful
 * to someone who arrives at it out of context.
 *
 * The code is deliberately absent. Printing it turns "shared at check-in" into
 * "readable from the footpath", and the whole access model rests on that
 * distinction.
 */
export default async function PosterPage({ params }: Props) {
  const { slug } = await params;
  if (!(await currentOrganizer())) redirect('/organizer/login');

  const context = await organizerFor(slug);
  if (!context) notFound();

  const { event } = context;
  const url = absolute(paths.event(event.slug));
  const qr = qrSvg(url);
  const display = url.replace(/^https?:\/\//, '');

  return (
    <>
      <div className="no-print controls">
        <p>
          <strong>{qr.moduleCount}×{qr.moduleCount} modules.</strong> Print at A4 or larger, then
          scan it from where an attendee will actually stand before you put it up.
        </p>
        <button type="button" className="btn print-btn">Print</button>
        <PrintScript />
      </div>

      <main className="poster">
        <p className="kicker">Photos from</p>
        <h1>{event.title}</h1>
        <p className="when">{formatDateRange(event.startsAt, event.endsAt, event.timezone)}</p>

        <div className="qr-frame">
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={`QR code for ${url}`}>
            <rect width={qr.size} height={qr.size} fill="#fff" />
            <path d={qr.path} fill="#000" shapeRendering="crispEdges" />
          </svg>
        </div>

        <p className="url">{display}</p>

        <ol className="steps">
          <li>Point your camera at the code.</li>
          <li>Ask an organizer for the event code.</li>
          <li>See the photos. Add your own.</li>
        </ol>

        <p className="foot">
          Photos stay private to this event and are reviewed before anyone sees them.
        </p>
      </main>
    </>
  );
}

/** Inline, so printing works without shipping a component bundle for one button. */
function PrintScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.currentScript.parentElement.querySelector('.print-btn')
          .addEventListener('click', function () { window.print(); });`,
      }}
    />
  );
}
