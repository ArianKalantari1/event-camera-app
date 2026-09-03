/**
 * Derived event state.
 *
 * This module is the single answer to "may this request do that, right now".
 * It is a pure function of the event row and the clock: no database, no jobs,
 * no cached booleans. Scheduled work may write durable markers and send
 * notifications, but it must never be what opens or closes access — a flag
 * flipped by cron is wrong for as long as cron is late.
 *
 * Null window bounds mean unbounded on that side: a null open is "open from the
 * beginning", a null close is "never closes".
 */

export type EventPhase = 'draft' | 'upcoming' | 'live' | 'recap' | 'closed' | 'archived';

/** The fields state depends on. Deliberately narrow so tests need no fixtures. */
export interface EventTiming {
  lifecycle: 'draft' | 'published' | 'archived';
  startsAt: Date;
  endsAt: Date;
  uploadsOpenAt: Date | null;
  uploadsCloseAt: Date | null;
  galleryOpenAt: Date | null;
  galleryCloseAt: Date | null;
  retentionUntil: Date | null;
}

export type ClosedReason =
  | 'draft'
  | 'archived'
  | 'not_yet_open'
  | 'closed'
  | 'retention_expired'
  | 'misconfigured';

export interface EventState {
  phase: EventPhase;
  /** The public promotional page may render. */
  publicPageVisible: boolean;
  /** Attendees may contribute media. */
  uploadsOpen: boolean;
  /** Attendees may browse approved media. */
  galleryOpen: boolean;
  /** Retention has lapsed; originals are due for deletion. */
  retentionExpired: boolean;
  uploadsClosedBecause: ClosedReason | null;
  galleryClosedBecause: ClosedReason | null;
  /** For countdown messaging. Null when the window has no end. */
  uploadsCloseAt: Date | null;
  galleryCloseAt: Date | null;
}

function valid(d: Date | null | undefined): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Window evaluation that fails closed.
 *
 * An unparseable bound makes every comparison false, and "false" in an access
 * check silently resolves to whichever side the code happens to be written on.
 * Here that side is explicit: a bound we cannot read denies access rather than
 * granting it.
 */
function windowOpen(
  open: Date | null,
  close: Date | null,
  now: Date,
): { open: boolean; reason: ClosedReason | null } {
  if (open !== null && !valid(open)) return { open: false, reason: 'misconfigured' };
  if (close !== null && !valid(close)) return { open: false, reason: 'misconfigured' };

  // An end at or before the start is an empty window, not an open one.
  if (valid(open) && valid(close) && close.getTime() <= open.getTime()) {
    return { open: false, reason: 'misconfigured' };
  }
  if (valid(open) && now.getTime() < open.getTime()) return { open: false, reason: 'not_yet_open' };
  if (valid(close) && now.getTime() >= close.getTime()) return { open: false, reason: 'closed' };
  return { open: true, reason: null };
}

export function eventState(event: EventTiming, now: Date = new Date()): EventState {
  const base: EventState = {
    phase: 'closed',
    publicPageVisible: false,
    uploadsOpen: false,
    galleryOpen: false,
    retentionExpired: false,
    uploadsClosedBecause: null,
    galleryClosedBecause: null,
    uploadsCloseAt: event.uploadsCloseAt,
    galleryCloseAt: event.galleryCloseAt,
  };

  if (event.lifecycle === 'archived') {
    return { ...base, phase: 'archived', uploadsClosedBecause: 'archived', galleryClosedBecause: 'archived' };
  }
  if (event.lifecycle === 'draft') {
    return { ...base, phase: 'draft', uploadsClosedBecause: 'draft', galleryClosedBecause: 'draft' };
  }

  const retentionExpired = valid(event.retentionUntil) && now.getTime() >= event.retentionUntil.getTime();

  const uploads = windowOpen(event.uploadsOpenAt ?? event.startsAt, event.uploadsCloseAt, now);
  const gallery = windowOpen(event.galleryOpenAt ?? event.startsAt, event.galleryCloseAt, now);

  // Retention lapsing means the originals are gone or going. Nothing may be
  // served or added past that point, whatever the other windows say.
  const uploadsOpen = uploads.open && !retentionExpired;
  const galleryOpen = gallery.open && !retentionExpired;

  let phase: EventPhase;
  if (!valid(event.startsAt) || !valid(event.endsAt)) {
    phase = 'closed';
  } else if (now < event.startsAt) {
    phase = 'upcoming';
  } else if (now <= event.endsAt) {
    phase = 'live';
  } else {
    phase = galleryOpen || uploadsOpen ? 'recap' : 'closed';
  }

  return {
    phase,
    publicPageVisible: true,
    uploadsOpen,
    galleryOpen,
    retentionExpired,
    uploadsClosedBecause: uploadsOpen ? null : retentionExpired ? 'retention_expired' : uploads.reason,
    galleryClosedBecause: galleryOpen ? null : retentionExpired ? 'retention_expired' : gallery.reason,
    uploadsCloseAt: event.uploadsCloseAt,
    galleryCloseAt: event.galleryCloseAt,
  };
}

/** Human-facing explanation. Never says "error" for an ordinary closed window. */
export function explainClosed(reason: ClosedReason | null): string {
  switch (reason) {
    case 'draft':
      return 'This event has not been published yet.';
    case 'archived':
      return 'This event has been archived.';
    case 'not_yet_open':
      return 'This is not open yet. Check back when the event starts.';
    case 'closed':
      return 'This has closed for the event.';
    case 'retention_expired':
      return 'The organizer’s retention period has ended and the photos have been deleted.';
    case 'misconfigured':
      return 'The organizer needs to set the dates for this event.';
    default:
      return 'This is not available.';
  }
}
