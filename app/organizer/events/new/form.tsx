'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { createEvent, type CreateResult } from './actions';

export interface Defaults {
  timezone: string;
  timezones: string[];
  startsAt: string;
  endsAt: string;
}

const field: React.CSSProperties = {
  font: 'inherit',
  fontSize: 16,
  padding: '12px',
  minHeight: 48,
  width: '100%',
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink)',
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Creating…' : 'Create event'}
    </button>
  );
}

export function NewEventForm({ defaults }: { defaults: Defaults }) {
  const [result, action] = useActionState<CreateResult | null, FormData>(createEvent, null);

  if (result?.code && result.slug) {
    return (
      <div className="card stack" role="status">
        <h2 style={{ margin: 0 }}>Event created</h2>
        <p className="muted" style={{ margin: 0 }}>
          This is the only time the event code is shown. Only its hash is stored, so nobody —
          including us — can look it up later. Write it down now.
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 40,
            letterSpacing: '0.16em',
            textAlign: 'center',
            padding: '16px 8px',
            border: '1px solid var(--line)',
            borderRadius: 10,
            background: 'var(--surface-2)',
          }}
        >
          {result.code}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          The event is a draft. Nothing is reachable until you publish it.
        </p>
        <Link className="btn" href={`/organizer/events/${result.slug}/settings`}>
          Continue to settings
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      {result?.errors?.length ? (
        <div
          role="alert"
          className="card"
          style={{ borderLeft: '3px solid var(--bad)', borderRadius: '0 10px 10px 0' }}
        >
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Event name</span>
        <input name="title" required maxLength={160} autoFocus style={field} />
      </label>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">What is it</span>
        <textarea name="description" rows={3} maxLength={2000} style={{ ...field, minHeight: 90 }} />
      </label>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Where</span>
        <input name="location" maxLength={200} style={field} />
      </label>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Contact email</span>
        <input name="contactEmail" type="email" maxLength={200} style={field} />
      </label>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Timezone</span>
        <select name="timezone" defaultValue={defaults.timezone} style={field}>
          {defaults.timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 13 }}>
          Every time below is read in this zone, not in whatever your laptop is set to.
        </span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Starts</span>
          <input type="datetime-local" name="startsAt" required defaultValue={defaults.startsAt} style={field} />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Ends</span>
          <input type="datetime-local" name="endsAt" required defaultValue={defaults.endsAt} style={field} />
        </label>
      </div>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Photo windows</summary>
        <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>
          Leave these blank and they follow the event dates: uploads for a day afterwards, the
          gallery for two weeks, originals deleted after two months. They are separate settings
          because contributing, browsing and deleting rarely want the same deadline.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">Uploads open</span>
            <input type="datetime-local" name="uploadsOpenAt" style={field} />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">Uploads close</span>
            <input type="datetime-local" name="uploadsCloseAt" style={field} />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">Gallery opens</span>
            <input type="datetime-local" name="galleryOpenAt" style={field} />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">Gallery closes</span>
            <input type="datetime-local" name="galleryCloseAt" style={field} />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">Delete originals</span>
            <input type="datetime-local" name="retentionUntil" style={field} />
          </label>
        </div>
      </details>

      <Submit />
    </form>
  );
}
