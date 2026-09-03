import { EVENT_PATH_PREFIX } from '@/lib/routes';

export default function Home() {
  return (
    <main className="page stack">
      <h1>Event hub</h1>
      <p className="muted">
        Attendees reach an event by scanning its QR code, which opens{' '}
        <code>{EVENT_PATH_PREFIX}/&#123;slug&#125;</code> directly in the browser. No install, no
        account.
      </p>
      <p className="muted">
        There is no public event directory: an event is reachable only by its own link.
      </p>
    </main>
  );
}
