/**
 * Funnel shape and the plan's primary outcome metric.
 *
 * Pure, and in the domain layer for the same reason the access scopes are: the
 * number an organizer judges the event by is worth testing on its own, and a
 * module that opens a database connection cannot be.
 */

export interface FunnelCounts {
  publicViews: number;
  gateAttempts: number;
  gateSuccesses: number;
  uniqueSessions: number;
  hubViews: number;
  galleryViews: number;
  uploadsStarted: number;
  uploadsCompleted: number;
  approved: number;
  rejected: number;
  reports: number;
}

/**
 * Approved contributions per 100 attendees, where an attendee is a device that
 * got through the code gate.
 *
 * Null rather than zero when nobody has entered. A denominator of zero is not a
 * score of zero, and showing 0 would read as "they are here and not
 * contributing" when in fact nobody has arrived.
 */
export function contributionsPerHundred(counts: FunnelCounts): number | null {
  if (counts.uniqueSessions === 0) return null;
  return Math.round((counts.approved / counts.uniqueSessions) * 1000) / 10;
}
