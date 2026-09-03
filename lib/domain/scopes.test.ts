import { describe, it, expect } from 'vitest';
import { scopesFor, type ViewerLevel } from './scopes';

describe('scopesFor', () => {
  it('gives the public only public resources', () => {
    expect(scopesFor('public')).toEqual(['public']);
  });

  it('never lets an attendee read organizer-scoped resources', () => {
    expect(scopesFor('attendee')).toEqual(['public', 'attendee']);
    expect(scopesFor('attendee')).not.toContain('organizer');
  });

  it('gives an organizer everything', () => {
    expect(scopesFor('organizer')).toEqual(['public', 'attendee', 'organizer']);
  });

  it('is strictly widening, so no level sees less than the level below it', () => {
    const levels: ViewerLevel[] = ['public', 'attendee', 'organizer'];
    for (let i = 1; i < levels.length; i++) {
      const lower = scopesFor(levels[i - 1]);
      const higher = scopesFor(levels[i]);
      expect(lower.every((s) => higher.includes(s))).toBe(true);
      expect(higher.length).toBeGreaterThan(lower.length);
    }
  });
});
