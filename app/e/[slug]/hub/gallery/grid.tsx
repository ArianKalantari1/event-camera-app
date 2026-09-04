'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { reportMedia, type ReportResult } from './report-actions';

export interface GalleryItem {
  id: string;
  width: number | null;
  height: number | null;
  /** Local time the photo was contributed, already formatted by the server. */
  addedAt: string;
}

/**
 * The grid requests thumbnails, never originals.
 *
 * Forty full-size photos is roughly ten megabytes on a venue's wifi. The
 * thumbnail is derived server-side from the same bytes as the image itself, so
 * a small tile costs no extra trust.
 *
 * The first row is fetched eagerly at high priority and everything after it
 * lazily at low priority. Browsers open about six connections per origin, so
 * without this the tiles someone is actually looking at queue behind tiles two
 * screens down — on a slow link that is most of the wait, more than the bytes.
 */
const EAGER_TILES = 6;

export function GalleryGrid({ slug, items }: { slug: string; items: GalleryItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  /** Where focus goes back to when the dialog closes. */
  const lastTrigger = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpenIndex(null);
    // Returning focus to the tile that opened it is what keeps a keyboard user's
    // place in a forty-tile grid instead of dropping them at the top of the page.
    lastTrigger.current?.focus();
  }, []);

  return (
    <>
      <ul
        role="list"
        aria-label={`${items.length} approved photo${items.length === 1 ? '' : 's'}`}
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
              onClick={(e) => {
                lastTrigger.current = e.currentTarget;
                setOpenIndex(index);
              }}
              /*
               * Named from data. Forty buttons all called "Open photo" give a
               * screen-reader user nothing to choose between, and hand a
               * voice-control user a forty-item ambiguity picker.
               */
              aria-label={`Photo ${index + 1} of ${items.length}, added ${item.addedAt}`}
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

      {openIndex !== null ? (
        <Lightbox
          slug={slug}
          item={items[openIndex]}
          position={openIndex + 1}
          total={items.length}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function Lightbox({
  slug,
  item,
  position,
  total,
  onClose,
}: {
  slug: string;
  item: GalleryItem;
  position: number;
  total: number;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButton.current?.focus();

    /*
     * Escape is bound to the document, not to the overlay.
     *
     * A handler on the overlay only fires for keydowns that bubble from a
     * focused descendant. The report control below replaces its own focused
     * element on every step, and when a focused element is removed the browser
     * moves focus to <body> — an ancestor of the overlay — from where nothing
     * bubbles through it. Escape would silently stop working at exactly the
     * moment someone is trying to leave.
     */
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !root.current) return;

      // Keep Tab inside the dialog; without this it walks the forty tiles
      // underneath the overlay, where the focus ring is invisible.
      const focusable = root.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!root.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const label = `Photo ${position} of ${total}, added ${item.addedAt}`;

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      // Only a click on the backdrop itself closes. Previously this fired for
      // the photo too — the largest target in the dialog — so tapping the image
      // to look closer threw you back to the grid.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(4, 8, 12, 0.94)',
        // Scrollable and top-aligned: the removal form makes this taller than a
        // phone screen, and a centred non-scrolling box clips its Send button.
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          maxWidth: '100%',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${item.id}`}
          alt={label}
          style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8 }}
        />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {/*
            A plain link, not a scripted download. It opens the image where the
            browser's own "save image" gesture works, which is the one path that
            behaves the same on iOS Safari and Android Chrome.
          */}
          <a className="btn" href={`/api/media/${item.id}`} target="_blank" rel="noopener noreferrer">
            Open full size
          </a>
          <button className="btn secondary" type="button" onClick={onClose} ref={closeButton}>
            Close
          </button>
        </div>

        <ReportControl slug={slug} id={item.id} />
      </div>
    </div>
  );
}

/**
 * The way out for someone who is in a photo they did not agree to.
 *
 * Deliberately quiet rather than hidden: a prominent report button on every tile
 * invites misuse, and one nobody can find is the same as not having one. It is
 * still a full-height target, because it is the only route available to the
 * person with the strongest claim to want it.
 */
function ReportControl({ slug, id }: { slug: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [result, action] = useActionState<ReportResult | null, FormData>(
    reportMedia.bind(null, slug, id),
    null,
  );
  const firstField = useRef<HTMLSelectElement | null>(null);
  const confirmation = useRef<HTMLParagraphElement | null>(null);

  // Each of these transitions removes the element that had focus, so focus is
  // placed deliberately rather than left to fall to <body>.
  useEffect(() => {
    if (open) firstField.current?.focus();
  }, [open]);
  useEffect(() => {
    if (result?.ok) confirmation.current?.focus();
  }, [result?.ok]);

  if (result?.ok) {
    return (
      <p
        ref={confirmation}
        tabIndex={-1}
        role="status"
        style={{ margin: 0, fontSize: 14, color: '#9fe0bd', textAlign: 'center' }}
      >
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
          // A 44px target: this is the smallest control on the screen and the
          // most consequential, sitting directly under a full-size Close button.
          minHeight: 44,
          padding: '0 12px',
          font: 'inherit',
          fontSize: 14,
          lineHeight: '44px',
          color: '#c9d6e2',
          textDecoration: 'underline',
          cursor: 'pointer',
        }}
      >
        Ask for this photo to be removed
      </button>
    );
  }

  const field: React.CSSProperties = {
    font: 'inherit',
    fontSize: 16,
    padding: 10,
    minHeight: 44,
    width: '100%',
    borderRadius: 8,
    border: '1px solid var(--line-strong)',
    background: 'var(--surface)',
    color: 'var(--ink)',
  };

  return (
    <form
      action={action}
      className="stack"
      style={{
        gap: 10,
        background: 'var(--surface)',
        padding: 14,
        borderRadius: 10,
        maxWidth: 380,
        width: '100%',
      }}
    >
      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Why</span>
        <select name="reason" defaultValue="in_photo" ref={firstField} style={field}>
          <option value="in_photo">I am in this photo and I did not agree to it</option>
          <option value="inappropriate">It should not be in this gallery</option>
          <option value="wrong_event">It is not from this event</option>
          <option value="other">Something else</option>
        </select>
      </label>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Anything to add (optional)</span>
        <textarea name="detail" rows={2} maxLength={1000} style={{ ...field, minHeight: 72 }} />
      </label>

      {result?.error ? (
        <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--bad)' }}>
          {result.error}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
