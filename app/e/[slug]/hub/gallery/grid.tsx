'use client';

import { useState } from 'react';

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
      <div style={{ display: 'flex', gap: 10 }} onClick={(e) => e.stopPropagation()}>
        {/*
          A plain link, not a scripted download. It opens the image where the
          browser's own "save image" gesture works, which is the one path that
          behaves the same on iOS Safari and Android Chrome.
        */}
        <a
          className="btn"
          href={`/api/media/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          data-slug={slug}
        >
          Open full size
        </a>
        <button className="btn secondary" type="button" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}
