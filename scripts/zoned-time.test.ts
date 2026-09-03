import { describe, it, expect } from 'vitest';
import { zonedTime, zoneOffsetMs, mostRecentLocalHour } from './zoned-time';

const SYD = 'Australia/Sydney';

const hourIn = (tz: string, at: Date) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', hour12: false }).format(at);

describe('zonedTime', () => {
  it('builds an instant that reads as the requested local hour', () => {
    expect(hourIn(SYD, zonedTime(SYD, 2026, 10, 10, 9))).toBe('09');
    expect(hourIn(SYD, zonedTime(SYD, 2026, 7, 10, 9))).toBe('09'); // other side of DST
  });

  it('lands on a different UTC instant for the same local hour across DST', () => {
    const summer = zonedTime(SYD, 2026, 1, 15, 9).getTime() % 86_400_000;
    const winter = zonedTime(SYD, 2026, 7, 15, 9).getTime() % 86_400_000;
    expect(summer).not.toBe(winter);
  });

  it('agrees with UTC when the zone is UTC', () => {
    expect(zonedTime('UTC', 2026, 3, 4, 13, 30).toISOString()).toBe('2026-03-04T13:30:00.000Z');
  });
});

describe('zoneOffsetMs', () => {
  it('is zero for UTC and positive for Sydney', () => {
    const at = new Date('2026-10-10T00:00:00Z');
    expect(zoneOffsetMs('UTC', at)).toBe(0);
    expect(zoneOffsetMs(SYD, at)).toBeGreaterThan(0);
  });
});

describe('mostRecentLocalHour', () => {
  it('returns today when that hour has already passed locally', () => {
    const now = zonedTime(SYD, 2026, 10, 10, 15);
    const got = mostRecentLocalHour(SYD, 9, now);
    expect(got.getTime()).toBe(zonedTime(SYD, 2026, 10, 10, 9).getTime());
  });

  it('falls back to yesterday when that hour has not arrived yet', () => {
    const now = zonedTime(SYD, 2026, 10, 10, 7);
    const got = mostRecentLocalHour(SYD, 9, now);
    expect(got.getTime()).toBe(zonedTime(SYD, 2026, 10, 9, 9).getTime());
  });

  it('is always in the past', () => {
    for (const h of [0, 6, 9, 13, 23]) {
      expect(mostRecentLocalHour(SYD, h).getTime()).toBeLessThanOrEqual(Date.now());
    }
  });
});
