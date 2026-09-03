import { describe, it, expect } from 'vitest';
import { formatDateRange, formatTime, formatDay, formatRemaining } from './format';

const start = new Date('2026-10-10T23:00:00Z'); // 10:00 on the 11th in Sydney
const end = new Date('2026-10-11T07:00:00Z');

describe('event-timezone formatting', () => {
  it('formats in the event zone, not the runtime zone', () => {
    expect(formatTime(start, 'Australia/Sydney')).toBe('10:00 am');
    expect(formatTime(start, 'UTC')).toBe('11:00 pm');
  });

  it('collapses a range that falls on one local day', () => {
    const out = formatDateRange(start, end, 'Australia/Sydney');
    expect(out).toContain('–');
    expect(out.match(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/g)?.length).toBe(1);
  });

  it('names both days when the range spans them', () => {
    const out = formatDateRange(start, new Date('2026-10-12T07:00:00Z'), 'Australia/Sydney');
    expect(out.match(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/g)?.length).toBe(2);
  });

  it('survives a bad timezone rather than throwing', () => {
    expect(() => formatDay(start, 'Not/AZone')).not.toThrow();
    expect(formatTime(start, 'Not/AZone')).toBe('11:00 pm');
  });
});

describe('formatRemaining', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const inMs = (ms: number) => new Date(now.getTime() + ms);

  it('returns null once the moment has passed', () => {
    expect(formatRemaining(inMs(-1), now)).toBeNull();
    expect(formatRemaining(now, now)).toBeNull();
  });

  it('never says zero minutes while time remains', () => {
    expect(formatRemaining(inMs(30_000), now)).toBe('1 minute left');
  });

  it('scales from minutes to hours to days', () => {
    expect(formatRemaining(inMs(45 * 60_000), now)).toBe('45 minutes left');
    expect(formatRemaining(inMs(5 * 3_600_000), now)).toBe('5 hours left');
    expect(formatRemaining(inMs(10 * 86_400_000), now)).toBe('10 days left');
  });
});
