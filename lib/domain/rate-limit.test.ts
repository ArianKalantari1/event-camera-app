import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, resetRateLimit, clearAllRateLimits, type RateLimitRule } from './rate-limit';

const RULE: RateLimitRule = { limit: 3, windowMs: 1000 };

beforeEach(clearAllRateLimits);

describe('checkRateLimit', () => {
  it('allows up to the limit and then denies', () => {
    const t = 1_000_000;
    expect(checkRateLimit('a', RULE, t).allowed).toBe(true);
    expect(checkRateLimit('a', RULE, t).allowed).toBe(true);
    expect(checkRateLimit('a', RULE, t).allowed).toBe(true);
    expect(checkRateLimit('a', RULE, t).allowed).toBe(false);
  });

  it('counts down the remaining attempts', () => {
    const t = 1_000_000;
    expect(checkRateLimit('a', RULE, t).remaining).toBe(2);
    expect(checkRateLimit('a', RULE, t).remaining).toBe(1);
    expect(checkRateLimit('a', RULE, t).remaining).toBe(0);
  });

  it('keeps separate keys independent', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('a', RULE, t);
    expect(checkRateLimit('a', RULE, t).allowed).toBe(false);
    expect(checkRateLimit('b', RULE, t).allowed).toBe(true);
  });

  it('reports how long the caller must wait', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('a', RULE, t);
    expect(checkRateLimit('a', RULE, t + 400).retryAfterMs).toBe(600);
  });

  it('opens a fresh window once the old one lapses', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('a', RULE, t);
    expect(checkRateLimit('a', RULE, t + 999).allowed).toBe(false);
    expect(checkRateLimit('a', RULE, t + 1000).allowed).toBe(true);
  });
});

describe('resetRateLimit', () => {
  it('clears the count so a correct entry does not penalise the next person', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('a', RULE, t);
    expect(checkRateLimit('a', RULE, t).allowed).toBe(false);
    resetRateLimit('a');
    expect(checkRateLimit('a', RULE, t).allowed).toBe(true);
  });
});
