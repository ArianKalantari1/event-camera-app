'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  addResource,
  removeResource,
  rotateCode,
  saveEvent,
  setLifecycle,
  type SettingsResult,
} from './actions';

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

export interface EventValues {
  title: string;
  description: string;
  location: string;
  contactEmail: string;
  timezone: string;
  timezones: string[];
  startsAt: string;
  endsAt: string;
  uploadsOpenAt: string;
  uploadsCloseAt: string;
  galleryOpenAt: string;
  galleryCloseAt: string;
  retentionUntil: string;
  lifecycle: 'draft' | 'published' | 'archived';
}

export interface ResourceRow {
  id: string;
  kind: string;
  label: string;
  detail: string | null;
  url: string | null;
  visibility: string;
  startsAt: string | null;
}

function Errors({ result }: { result: SettingsResult | null }) {
  if (!result?.errors?.length) return null;
  return (
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
  );
}

function SaveButton({ label = 'Save' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

export function EventSettingsForm({ slug, values }: { slug: string; values: EventValues }) {
  const [result, action] = useActionState<SettingsResult | null, FormData>(
    saveEvent.bind(null, slug),
    null,
  );

  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <Errors result={result} />
      {result?.saved ? (
        <p role="status" style={{ margin: 0, color: 'var(--good)', fontSize: 14 }}>
          Saved. The attendee hub reflects this now.
        </p>
      ) : null}

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Event name</span>
        <input name="title" defaultValue={values.title} required maxLength={160} style={field} />
      </label>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">What is it</span>
        <textarea
          name="description"
          defaultValue={values.description}
          rows={3}
          maxLength={2000}
          style={{ ...field, minHeight: 90 }}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Where</span>
          <input name="location" defaultValue={values.location} maxLength={200} style={field} />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Contact email</span>
          <input name="contactEmail" type="email" defaultValue={values.contactEmail} style={field} />
        </label>
      </div>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Timezone</span>
        <select name="timezone" defaultValue={values.timezone} style={field}>
          {values.timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {(
          [
            ['startsAt', 'Starts'],
            ['endsAt', 'Ends'],
            ['uploadsOpenAt', 'Uploads open'],
            ['uploadsCloseAt', 'Uploads close'],
            ['galleryOpenAt', 'Gallery opens'],
            ['galleryCloseAt', 'Gallery closes'],
            ['retentionUntil', 'Delete originals'],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="stack" style={{ gap: 6 }}>
            <span className="label">{label}</span>
            <input
              type="datetime-local"
              name={name}
              defaultValue={values[name]}
              required={name === 'startsAt' || name === 'endsAt'}
              style={field}
            />
          </label>
        ))}
      </div>

      <SaveButton />
    </form>
  );
}

export function LifecyclePanel({ slug, lifecycle }: { slug: string; lifecycle: EventValues['lifecycle'] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SettingsResult | null>(null);

  const go = (next: EventValues['lifecycle']) =>
    start(async () => setResult(await setLifecycle(slug, next)));

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <p className="label" style={{ margin: 0 }}>Status: {lifecycle}</p>
      <Errors result={result} />
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {lifecycle === 'draft'
          ? 'Nobody can reach this event yet, and its QR code is not worth printing.'
          : lifecycle === 'published'
            ? 'The public page is live. Attendees with the code can enter.'
            : 'Archived. Everything is closed, whatever the windows say.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {lifecycle !== 'published' ? (
          <button className="btn" type="button" disabled={pending} onClick={() => go('published')}>
            Publish
          </button>
        ) : null}
        {lifecycle === 'published' ? (
          <button className="btn secondary" type="button" disabled={pending} onClick={() => go('draft')}>
            Unpublish
          </button>
        ) : null}
        {lifecycle !== 'archived' ? (
          <button className="btn secondary" type="button" disabled={pending} onClick={() => go('archived')}>
            Archive
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CodePanel({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <p className="label" style={{ margin: 0 }}>Event code</p>
      <Errors result={result} />

      {result?.code ? (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Shown once. Only its hash is stored, so it cannot be looked up later.
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 34,
              letterSpacing: '0.16em',
              textAlign: 'center',
              padding: '14px 8px',
              border: '1px solid var(--line)',
              borderRadius: 10,
              background: 'var(--surface-2)',
            }}
          >
            {result.code}
          </p>
        </>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Stored hashed and never shown again. Rotating issues a new one; the old one stops working
          immediately, and attendees already inside keep their access.
        </p>
      )}

      {confirming ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setResult(await rotateCode(slug));
                setConfirming(false);
              })
            }
          >
            Yes, issue a new code
          </button>
          <button className="btn secondary" type="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn secondary" type="button" onClick={() => setConfirming(true)}>
          Rotate code
        </button>
      )}
    </div>
  );
}

export function ResourcesPanel({ slug, resources }: { slug: string; resources: ResourceRow[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [kind, setKind] = useState('action');

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Errors result={result} />

      {resources.length > 0 ? (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
          {resources.map((r) => (
            <li
              key={r.id}
              className="card"
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{r.label}</p>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: 13, wordBreak: 'break-all' }}>
                  {r.kind} · visible to {r.visibility}
                  {r.startsAt ? ` · ${r.startsAt}` : ''}
                  {r.url ? ` · ${r.url}` : ''}
                  {r.detail ? ` · ${r.detail}` : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => setResult(await removeResource(slug, r.id)))}
                style={{
                  background: 'none',
                  border: 0,
                  font: 'inherit',
                  fontSize: 13,
                  color: 'var(--bad)',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0 }}>No links, schedule or notes yet.</p>
      )}

      <form
        className="card stack"
        style={{ gap: 10 }}
        action={(formData) => start(async () => setResult(await addResource(slug, formData)))}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">Kind</span>
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} style={field}>
              <option value="action">Link to do something</option>
              <option value="resource">Resource</option>
              <option value="schedule">Schedule item</option>
              <option value="note">Note</option>
            </select>
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">Visible to</span>
            <select name="visibility" defaultValue="attendee" style={field}>
              <option value="public">Everyone, including the public page</option>
              <option value="attendee">Attendees who entered the code</option>
              <option value="organizer">Organizers only</option>
            </select>
          </label>
        </div>

        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Label</span>
          <input name="label" required maxLength={160} style={field} />
        </label>

        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Detail</span>
          <input name="detail" maxLength={500} style={field} />
        </label>

        {kind === 'schedule' ? (
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">When</span>
            <input type="datetime-local" name="startsAt" style={field} />
          </label>
        ) : (
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">Link</span>
            <input name="url" type="url" placeholder="https://" maxLength={500} style={field} />
          </label>
        )}

        <button className="btn" type="submit" disabled={pending}>
          Add
        </button>
      </form>
    </div>
  );
}
