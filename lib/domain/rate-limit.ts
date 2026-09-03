/**
 * Fixed-window attempt limiting, in process memory.
 *
 * This is what makes a six-character shared code defensible: without it, the
 * code space is small enough to walk through. With it, an attacker gets a
 * handful of guesses per window per address.
 *
 * Honest limitation: the counters live in one process. On a platform that runs
 * several instances, an attacker spread across them gets a multiple of the
 * limit. That is acceptable for Demo Zero on a single deployment and is not
 * acceptable once real attendee media exists — Milestone 1 moves this to a
 * shared store. Recorded here rather than in a ticket nobody reads.
 */

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Bounded so a flood of distinct keys cannot grow the map without limit. */
const MAX_TRACKED_KEYS = 10_000;

export const CODE_ATTEMPTS: RateLimitRule = { limit: 8, windowMs: 10 * 60 * 1000 };

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule = CODE_ATTEMPTS,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) sweep(now);
    // Still full after sweeping means live traffic, not stale keys. Deny rather
    // than grow: an unbounded map is a denial-of-service of its own.
    if (buckets.size >= MAX_TRACKED_KEYS) {
      return { allowed: false, remaining: 0, retryAfterMs: rule.windowMs };
    }
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= rule.limit) {
    return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { allowed: true, remaining: rule.limit - existing.count, retryAfterMs: 0 };
}

/** Called after a correct code, so one attendee's typo does not lock the next. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Test helper. */
export function clearAllRateLimits(): void {
  buckets.clear();
}
