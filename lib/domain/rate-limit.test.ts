import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  resetRateLimit,
  clearAllRateLimits,
  GATE_PER_DEVICE,
  GATE_PER_ADDRESS,
  type RateLimitRule,
} from './rate-limit';

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

describe('the gate is limited in two tiers', () => {
  it('allows a venue full of people far more attempts than one phone', () => {
    // Everyone at a venue shares one NAT address. Keyed on the address alone,
    // eight typos from eight different people locked out everybody else.
    expect(GATE_PER_ADDRESS.limit).toBeGreaterThan(GATE_PER_DEVICE.limit * 10);
  });

  it('still bounds a script that clears its device cookie', () => {
    // 25^6 codes behind scrypt at this rate is not a realistic attack.
    const perDay = (GATE_PER_ADDRESS.limit / GATE_PER_ADDRESS.windowMs) * 86_400_000;
    expect(perDay).toBeLessThan(50_000);
  });

  it('counts a device and an address independently', () => {
    const t = 2_000_000;
    for (let i = 0; i < GATE_PER_DEVICE.limit; i++) {
      expect(checkRateLimit('gate:e:device-a', GATE_PER_DEVICE, t).allowed).toBe(true);
    }
    expect(checkRateLimit('gate:e:device-a', GATE_PER_DEVICE, t).allowed).toBe(false);
    // A different phone on the same venue address is unaffected.
    expect(checkRateLimit('gate:e:device-b', GATE_PER_DEVICE, t).allowed).toBe(true);
    expect(checkRateLimit('gate:e:203.0.113.7', GATE_PER_ADDRESS, t).allowed).toBe(true);
  });
});
