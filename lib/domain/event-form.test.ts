import { describe, it, expect } from 'vitest';
import {
  eventFormSchema,
  toEventTimes,
  validateTimes,
  toLocalInput,
  hackathonDefaults,
  isSupportedTimezone,
  localToInstant,
} from './event-form';

const SYD = 'Australia/Sydney';

const base = {
  title: 'Sydney Builders Hackathon',
  description: '',
  location: '',
  contactEmail: '',
  timezone: SYD,
  startsAt: '2026-10-10T09:00',
  endsAt: '2026-10-11T18:00',
  uploadsOpenAt: '',
  uploadsCloseAt: '',
  galleryOpenAt: '',
  galleryCloseAt: '',
  retentionUntil: '',
};

const parse = (over: Partial<typeof base> = {}) => eventFormSchema.parse({ ...base, ...over });

const hourIn = (tz: string, at: Date) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', hour12: false }).format(at);

describe('validation', () => {
  it('requires a usable title', () => {
    expect(() => eventFormSchema.parse({ ...base, title: 'x' })).toThrow();
  });

  it('turns blank optional fields into null rather than empty strings', () => {
    const v = parse();
    expect(v.description).toBeNull();
    expect(v.location).toBeNull();
    expect(v.contactEmail).toBeNull();
    expect(v.uploadsCloseAt).toBeNull();
  });

  it('rejects a malformed email but accepts a blank one', () => {
    expect(() => eventFormSchema.parse({ ...base, contactEmail: 'not-an-email' })).toThrow();
    expect(parse({ contactEmail: 'a@b.co' }).contactEmail).toBe('a@b.co');
  });

  it('rejects a half-typed datetime', () => {
    expect(() => eventFormSchema.parse({ ...base, startsAt: '2026-10-10' })).toThrow();
    expect(() => eventFormSchema.parse({ ...base, uploadsCloseAt: 'soon' })).toThrow();
  });
});

describe('times are read in the EVENT zone, not the browser zone', () => {
  it('interprets 9am as 9am in the event timezone', () => {
    const times = toEventTimes(parse());
    expect(hourIn(SYD, times.startsAt)).toBe('09');
  });

  it('produces a different instant for the same wall clock in another zone', () => {
    const syd = toEventTimes(parse()).startsAt.getTime();
    const utc = toEventTimes(parse({ timezone: 'UTC' })).startsAt.getTime();
    expect(syd).not.toBe(utc);
  });

  it('round-trips through toLocalInput', () => {
    const times = toEventTimes(parse());
    expect(toLocalInput(times.startsAt, SYD)).toBe('2026-10-10T09:00');
  });

  it('renders midnight as 00, not 24', () => {
    const times = toEventTimes(parse({ startsAt: '2026-10-10T00:00' }));
    expect(toLocalInput(times.startsAt, SYD)).toBe('2026-10-10T00:00');
  });

  it('returns an empty string for an absent bound', () => {
    expect(toLocalInput(null, SYD)).toBe('');
  });
});

describe('validateTimes', () => {
  const times = (over: Partial<typeof base>) => toEventTimes(parse(over));

  it('accepts a sane configuration', () => {
    expect(validateTimes(times({}))).toEqual([]);
  });

  it('catches an event that ends before it starts', () => {
    expect(validateTimes(times({ endsAt: '2026-10-09T18:00' }))).toContain(
      'The event ends before it starts.',
    );
  });

  it('catches uploads closing before they open', () => {
    const problems = validateTimes(
      times({ uploadsOpenAt: '2026-10-11T10:00', uploadsCloseAt: '2026-10-10T10:00' }),
    );
    expect(problems).toContain('Uploads close before they open.');
  });

  it('catches a gallery that closes before it opens', () => {
    const problems = validateTimes(
      times({ galleryOpenAt: '2026-10-11T10:00', galleryCloseAt: '2026-10-10T10:00' }),
    );
    expect(problems).toContain('The gallery closes before it opens.');
  });

  it('catches deletion scheduled before the gallery closes', () => {
    const problems = validateTimes(
      times({ galleryCloseAt: '2026-10-25T18:00', retentionUntil: '2026-10-20T18:00' }),
    );
    expect(problems.join(' ')).toMatch(/deleted before the gallery closes/);
  });

  it('says nothing about windows the organizer left unbounded', () => {
    expect(validateTimes(times({ uploadsCloseAt: '', galleryCloseAt: '' }))).toEqual([]);
  });
});

describe('hackathonDefaults', () => {
  it('gives a fourteen-day gallery, not seventy-two hours', () => {
    const start = new Date('2026-10-10T00:00:00Z');
    const d = hackathonDefaults(start, SYD);
    const days = (d.galleryCloseAt.getTime() - d.endsAt.getTime()) / 86_400_000;
    expect(days).toBe(14);
  });

  it('keeps deletion well after the gallery closes', () => {
    const d = hackathonDefaults(new Date('2026-10-10T00:00:00Z'), SYD);
    expect(d.retentionUntil.getTime()).toBeGreaterThan(d.galleryCloseAt.getTime());
  });

  it('opens uploads with the event and closes them a day after it ends', () => {
    const start = new Date('2026-10-10T00:00:00Z');
    const d = hackathonDefaults(start, SYD);
    expect(d.uploadsOpenAt).toEqual(start);
    expect(d.uploadsCloseAt.getTime() - d.endsAt.getTime()).toBe(86_400_000);
  });
});

describe('isSupportedTimezone', () => {
  it('accepts real zones and rejects invented ones', () => {
    expect(isSupportedTimezone(SYD)).toBe(true);
    expect(isSupportedTimezone('UTC')).toBe(true);
    expect(isSupportedTimezone('Middle/Earth')).toBe(false);
  });
});

describe('localToInstant', () => {
  it('resolves one field against the event zone', () => {
    const at = localToInstant('2026-10-10T14:30', SYD)!;
    expect(hourIn(SYD, at)).toBe('14');
  });

  it('returns null for anything that is not a wall-clock value', () => {
    expect(localToInstant('', SYD)).toBeNull();
    expect(localToInstant('2026-10-10', SYD)).toBeNull();
    expect(localToInstant('tomorrow', SYD)).toBeNull();
  });
});
