import { describe, it, expect } from 'vitest';
import { contributionsPerHundred, type FunnelCounts } from './funnel';

const counts = (over: Partial<FunnelCounts> = {}): FunnelCounts => ({
  publicViews: 0,
  gateAttempts: 0,
  gateSuccesses: 0,
  uniqueSessions: 0,
  hubViews: 0,
  galleryViews: 0,
  uploadsStarted: 0,
  uploadsCompleted: 0,
  approved: 0,
  rejected: 0,
  reports: 0,
  ...over,
});

describe('contributionsPerHundred', () => {
  it('is null when nobody has entered, rather than zero', () => {
    // A denominator of zero is not a score of zero, and showing 0 would read as
    // "attendees are here and not contributing" when nobody has arrived.
    expect(contributionsPerHundred(counts({ approved: 0 }))).toBeNull();
    expect(contributionsPerHundred(counts({ approved: 5 }))).toBeNull();
  });

  it('counts approved photos against devices that got through the gate', () => {
    expect(contributionsPerHundred(counts({ approved: 40, uniqueSessions: 80 }))).toBe(50);
    expect(contributionsPerHundred(counts({ approved: 12, uniqueSessions: 100 }))).toBe(12);
  });

  it('can exceed 100, because one attendee may contribute several photos', () => {
    expect(contributionsPerHundred(counts({ approved: 300, uniqueSessions: 100 }))).toBe(300);
  });

  it('keeps one decimal rather than rounding a small pilot to nothing', () => {
    expect(contributionsPerHundred(counts({ approved: 1, uniqueSessions: 3 }))).toBe(33.3);
    expect(contributionsPerHundred(counts({ approved: 1, uniqueSessions: 700 }))).toBe(0.1);
  });

  it('is zero only when attendees arrived and nothing was approved', () => {
    expect(contributionsPerHundred(counts({ approved: 0, uniqueSessions: 50 }))).toBe(0);
  });
});
