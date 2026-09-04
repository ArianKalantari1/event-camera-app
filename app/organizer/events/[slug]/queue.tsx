'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { moderate, type Decision } from './actions';

export interface QueueItem {
  id: string;
  state: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  contributor: string | null;
  bytes: number | null;
}

export function Queue({ items, slug, label }: { items: QueueItem[]; slug: string; label: string }) {
  // Announcements live outside the tiles, because a tile unmounts itself the
  // moment it is decided and a live region must outlive the change it reports.
  const [announcement, setAnnouncement] = useState('');

  if (items.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>Nothing here.</p>;
  }

  return (
    <>
      <div role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </div>
      <ul
        role="list"
        aria-label={label}
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        {items.map((item) => (
          <Tile key={item.id} item={item} slug={slug} announce={setAnnouncement} />
        ))}
      </ul>
    </>
  );
}

/** Distinguishes one tile from the next for a screen reader and for voice control. */
function describe(item: QueueItem): string {
  const at = new Date(item.createdAt);
  const time = Number.isNaN(at.getTime())
    ? ''
    : ` at ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return `${item.contributor ?? 'an anonymous contributor'}${time}`;
}

function Tile({
  item,
  slug,
  announce,
}: {
  item: QueueItem;
  slug: string;
  announce: (message: string) => void;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const li = useRef<HTMLLIElement | null>(null);

  // The tile deletes itself out from under the focused button. Without moving
  // focus first it falls to <body>, so moderating a thirty-photo queue by
  // keyboard means Tabbing from the top of the document thirty times.
  useEffect(() => {
    if (!gone) return;
    const next = li.current?.nextElementSibling?.querySelector<HTMLElement>('button');
    next?.focus();
  }, [gone]);

  if (gone) return null;

  const who = describe(item);

  const act = (decision: Decision) =>
    start(async () => {
      const res = await moderate(slug, item.id, decision);
      if (res.ok) {
        announce(
          decision === 'approve'
            ? `Approved the photo from ${who}.`
            : decision === 'reject'
              ? `Rejected the photo from ${who}.`
              : `Removed the photo from ${who}.`,
        );
        setGone(true);
      } else {
        setNote(res.message ?? 'That did not work.');
      }
    });

  return (
    <li ref={li} className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <a
        href={`/api/media/${item.id}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open the full-size photo from ${who}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${item.id}?v=thumb`}
          alt=""
          loading="lazy"
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            objectFit: 'cover',
            borderRadius: 6,
            background: 'var(--line-2)',
          }}
        />
      </a>

      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {item.contributor ?? 'Anonymous'}
        {item.bytes ? ` · ${Math.round(item.bytes / 1024)}KB` : ''}
      </p>

      <div style={{ display: 'flex', gap: 6 }}>
        {item.state !== 'approved' ? (
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => act('approve')}
            aria-label={`Approve the photo from ${who}`}
            style={{ flex: 1, minHeight: 44, padding: '0 10px', fontSize: 14 }}
          >
            Approve
          </button>
        ) : null}
        {item.state !== 'rejected' ? (
          <button
            type="button"
            className="btn secondary"
            disabled={pending}
            onClick={() => act('reject')}
            aria-label={`Reject the photo from ${who}`}
            style={{ flex: 1, minHeight: 44, padding: '0 10px', fontSize: 14 }}
          >
            Reject
          </button>
        ) : null}
      </div>

      {/*
        Irreversible, and it used to be a 14px-tall unconfirmed target eight
        pixels below Reject. Now it asks first, and both steps are 44px.
      */}
      {confirmingRemove ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => act('remove')}
            aria-label={`Confirm permanent removal of the photo from ${who}`}
            style={{ flex: 1, minHeight: 44, padding: '0 8px', fontSize: 13, background: 'var(--bad)', borderColor: 'var(--bad)' }}
          >
            Remove for good
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setConfirmingRemove(false)}
            style={{ minHeight: 44, padding: '0 10px', fontSize: 13 }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmingRemove(true)}
          aria-label={`Remove the photo from ${who} permanently`}
          style={{
            background: 'none',
            border: 0,
            minHeight: 44,
            padding: '0 4px',
            font: 'inherit',
            fontSize: 13,
            color: 'var(--bad)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Remove permanently
        </button>
      )}

      {note ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warn)' }}>{note}</p>
      ) : null}
    </li>
  );
}
