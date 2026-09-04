'use client';

import { useState, useTransition } from 'react';
import { moderate, type Decision } from './actions';

export interface QueueItem {
  id: string;
  state: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  contributor: string | null;
  bytes: number | null;
}

export function Queue({ items, slug }: { items: QueueItem[]; slug: string }) {
  if (items.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>Nothing here.</p>;
  }
  return (
    <ul
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
        <Tile key={item.id} item={item} slug={slug} />
      ))}
    </ul>
  );
}

function Tile({ item, slug }: { item: QueueItem; slug: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  if (gone) return null;

  const act = (decision: Decision) =>
    start(async () => {
      const res = await moderate(slug, item.id, decision);
      if (res.ok) setGone(true);
      else setNote(res.message ?? 'That did not work.');
    });

  return (
    <li className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <a href={`/api/media/${item.id}`} target="_blank" rel="noopener noreferrer">
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
            style={{ flex: 1, minHeight: 40, padding: '0 10px', fontSize: 14 }}
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
            style={{ flex: 1, minHeight: 40, padding: '0 10px', fontSize: 14 }}
          >
            Reject
          </button>
        ) : null}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => act('remove')}
        style={{
          background: 'none',
          border: 0,
          padding: 0,
          font: 'inherit',
          fontSize: 12,
          color: 'var(--bad)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        Remove permanently
      </button>

      {note ? <p style={{ margin: 0, fontSize: 12, color: 'var(--warn)' }}>{note}</p> : null}
    </li>
  );
}
