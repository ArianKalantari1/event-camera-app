'use client';

import { useActionState, useState } from 'react';
import { reportMedia, type ReportResult } from './report-actions';

export interface GalleryItem {
  id: string;
  width: number | null;
  height: number | null;
}

/**
 * The grid requests thumbnails, never originals.
 *
 * Forty full-size photos is roughly ten megabytes on a venue's wifi. The
 * uploading browser produces the thumbnail, so this costs no server-side image
 * processing and no job queue.
 *
 * The first row is fetched eagerly at high priority and everything after it
 * lazily at low priority. Browsers open about six connections per origin, so
 * without this the tiles someone is actually looking at queue behind tiles two
 * screens down — on a slow link that is most of the wait, more than the bytes.
 */
const EAGER_TILES = 6;
export function GalleryGrid({ slug, items }: { slug: string; items: GalleryItem[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
          gap: 6,
        }}
      >
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item.id)}
              aria-label="Open photo"
              style={{
                display: 'block',
                width: '100%',
                aspectRatio: '1 / 1',
                padding: 0,
                border: 0,
                borderRadius: 8,
                overflow: 'hidden',
                background: 'var(--line-2)',
                cursor: 'pointer',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/${item.id}?v=thumb`}
                alt=""
                loading={index < EAGER_TILES ? 'eager' : 'lazy'}
                fetchPriority={index < EAGER_TILES ? 'high' : 'low'}
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </button>
          </li>
        ))}
      </ul>

      {open ? <Lightbox id={open} slug={slug} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Lightbox({ id, slug, onClose }: { id: string; slug: string; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(4, 8, 12, 0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 16,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/media/${id}`}
        alt=""
        style={{ maxWidth: '100%', maxHeight: '76vh', objectFit: 'contain', borderRadius: 8 }}
      />
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          {/*
            A plain link, not a scripted download. It opens the image where the
            browser's own "save image" gesture works, which is the one path that
            behaves the same on iOS Safari and Android Chrome.
          */}
          <a className="btn" href={`/api/media/${id}`} target="_blank" rel="noopener noreferrer">
            Open full size
          </a>
          <button className="btn secondary" type="button" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        <ReportControl slug={slug} id={id} />
      </div>
    </div>
  );
}

/**
 * The way out for someone who is in a photo they did not agree to.
 *
 * Deliberately quiet rather than hidden: a prominent report button on every
 * tile invites misuse, and one nobody can find is the same as not having one.
 */
function ReportControl({ slug, id }: { slug: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [result, action] = useActionState<ReportResult | null, FormData>(
    reportMedia.bind(null, slug, id),
    null,
  );

  if (result?.ok) {
    return (
      <p role="status" style={{ margin: 0, fontSize: 13, color: '#9fe0bd', textAlign: 'center' }}>
        Sent to the organizers. They will look at it.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: 'none',
          border: 0,
          padding: 4,
          font: 'inherit',
          fontSize: 13,
          color: '#b8c6d2',
          textDecoration: 'underline',
          cursor: 'pointer',
        }}
      >
        Ask for this photo to be removed
      </button>
    );
  }

  return (
    <form
      action={action}
      className="stack"
      style={{
        gap: 8,
        background: 'var(--surface)',
        padding: 14,
        borderRadius: 10,
        maxWidth: 380,
        width: '100%',
      }}
    >
      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Why</span>
        <select
          name="reason"
          defaultValue="in_photo"
          style={{
            font: 'inherit',
            padding: 10,
            minHeight: 44,
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            color: 'var(--ink)',
          }}
        >
          <option value="in_photo">I am in this photo and I did not agree to it</option>
          <option value="inappropriate">It should not be in this gallery</option>
          <option value="wrong_event">It is not from this event</option>
          <option value="other">Something else</option>
        </select>
      </label>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Anything to add (optional)</span>
        <textarea
          name="detail"
          rows={2}
          maxLength={1000}
          style={{
            font: 'inherit',
            padding: 10,
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            color: 'var(--ink)',
          }}
        />
      </label>

      {result?.error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--bad)' }}>{result.error}</p>
      ) : null}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" style={{ flex: 1, minHeight: 44 }}>
          Send
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={() => setOpen(false)}
          style={{ minHeight: 44 }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
