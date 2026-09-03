import { describe, it, expect } from 'vitest';
import { eventState, type EventTiming } from './event-state';

const T = (iso: string) => new Date(iso);

/** A published, currently-running event with generous windows. */
const base: EventTiming = {
  lifecycle: 'published',
  startsAt: T('2026-10-10T09:00:00Z'),
  endsAt: T('2026-10-11T18:00:00Z'),
  uploadsOpenAt: T('2026-10-10T09:00:00Z'),
  uploadsCloseAt: T('2026-10-12T18:00:00Z'), // +24h after the end
  galleryOpenAt: T('2026-10-10T09:00:00Z'),
  galleryCloseAt: T('2026-10-25T18:00:00Z'), // +14 days after the end
  retentionUntil: T('2026-12-01T00:00:00Z'),
};

const at = (iso: string, over: Partial<EventTiming> = {}) => eventState({ ...base, ...over }, T(iso));

describe('lifecycle', () => {
  it('hides everything for a draft, including the public page', () => {
    const s = at('2026-10-10T12:00:00Z', { lifecycle: 'draft' });
    expect(s.phase).toBe('draft');
    expect(s.publicPageVisible).toBe(false);
    expect(s.uploadsOpen).toBe(false);
    expect(s.galleryOpen).toBe(false);
  });

  it('closes everything for an archived event even inside its windows', () => {
    const s = at('2026-10-10T12:00:00Z', { lifecycle: 'archived' });
    expect(s.phase).toBe('archived');
    expect(s.uploadsOpen).toBe(false);
    expect(s.galleryOpen).toBe(false);
    expect(s.galleryClosedBecause).toBe('archived');
  });
});

describe('phases', () => {
  it('is upcoming before the start', () => {
    expect(at('2026-10-09T12:00:00Z').phase).toBe('upcoming');
  });
  it('is live between start and end, inclusive of both edges', () => {
    expect(at('2026-10-10T09:00:00Z').phase).toBe('live');
    expect(at('2026-10-11T18:00:00Z').phase).toBe('live');
  });
  it('is recap after the end while a window is still open', () => {
    expect(at('2026-10-13T12:00:00Z').phase).toBe('recap');
  });
  it('is closed once every window has passed', () => {
    expect(at('2026-10-26T12:00:00Z').phase).toBe('closed');
  });
});

describe('windows are independent', () => {
  it('keeps the gallery open after uploads have closed', () => {
    const s = at('2026-10-20T12:00:00Z');
    expect(s.uploadsOpen).toBe(false);
    expect(s.uploadsClosedBecause).toBe('closed');
    expect(s.galleryOpen).toBe(true);
  });

  it('allows uploads before the gallery opens', () => {
    const s = at('2026-10-10T12:00:00Z', { galleryOpenAt: T('2026-10-11T18:00:00Z') });
    expect(s.uploadsOpen).toBe(true);
    expect(s.galleryOpen).toBe(false);
    expect(s.galleryClosedBecause).toBe('not_yet_open');
  });

  it('treats a null close as never closing', () => {
    const s = at('2030-01-01T00:00:00Z', { uploadsCloseAt: null, retentionUntil: null });
    expect(s.uploadsOpen).toBe(true);
  });

  it('falls back to the event start when an open bound is null', () => {
    expect(at('2026-10-09T12:00:00Z', { uploadsOpenAt: null }).uploadsOpen).toBe(false);
    expect(at('2026-10-10T12:00:00Z', { uploadsOpenAt: null }).uploadsOpen).toBe(true);
  });
});

describe('boundaries', () => {
  it('opens exactly at the open instant', () => {
    expect(at('2026-10-10T08:59:59Z', { uploadsOpenAt: T('2026-10-10T09:00:00Z') }).uploadsOpen).toBe(false);
    expect(at('2026-10-10T09:00:00Z', { uploadsOpenAt: T('2026-10-10T09:00:00Z') }).uploadsOpen).toBe(true);
  });

  it('is closed at the close instant, not one tick later', () => {
    expect(at('2026-10-12T17:59:59Z').uploadsOpen).toBe(true);
    expect(at('2026-10-12T18:00:00Z').uploadsOpen).toBe(false);
  });
});

describe('retention overrides every other window', () => {
  it('closes uploads and gallery once retention lapses', () => {
    const s = at('2026-12-02T00:00:00Z', {
      uploadsCloseAt: null,
      galleryCloseAt: null,
    });
    expect(s.retentionExpired).toBe(true);
    expect(s.uploadsOpen).toBe(false);
    expect(s.galleryOpen).toBe(false);
    expect(s.galleryClosedBecause).toBe('retention_expired');
  });
});

describe('fails closed, never open', () => {
  it('denies access when a bound is an invalid date', () => {
    const s = at('2026-10-10T12:00:00Z', { galleryCloseAt: new Date('not a date') });
    expect(s.galleryOpen).toBe(false);
    expect(s.galleryClosedBecause).toBe('misconfigured');
  });

  it('denies access when the window ends at or before it starts', () => {
    const s = at('2026-10-10T12:00:00Z', {
      galleryOpenAt: T('2026-10-11T00:00:00Z'),
      galleryCloseAt: T('2026-10-10T00:00:00Z'),
    });
    expect(s.galleryOpen).toBe(false);
    expect(s.galleryClosedBecause).toBe('misconfigured');
  });

  it('does not crash or open up on invalid event bounds', () => {
    const s = at('2026-10-10T12:00:00Z', { startsAt: new Date('nope'), endsAt: new Date('nope') });
    expect(s.phase).toBe('closed');
  });
});

describe('purity', () => {
  it('returns the same answer for the same inputs', () => {
    const now = T('2026-10-13T12:00:00Z');
    expect(eventState(base, now)).toEqual(eventState(base, now));
  });

  it('does not mutate the event it is given', () => {
    const snapshot = JSON.stringify(base);
    eventState(base, T('2026-10-13T12:00:00Z'));
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
