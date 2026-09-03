import {
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/** promisify() resolves to the three-argument overload, which loses the params. */
function scrypt(
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/**
 * Event codes and slugs.
 *
 * Both are read off a poster or a screen across a room and typed on a phone, so
 * the alphabet excludes every pair a person confuses under those conditions:
 * 0/O, 1/I/L, 2/Z, 5/S, 8/B. What remains is 25 unambiguous characters.
 */
const ALPHABET = '34679ACDEFGHJKMNPQRTUVWXY';

/** Cryptographically uniform pick — Math.random() is not acceptable here. */
function randomFrom(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/**
 * The shared event code. Six characters from a 25-character alphabet is about
 * 2.4e8 combinations — meaningful only alongside the attempt limiting in
 * lib/domain/rate-limit.ts, and never a substitute for identity. A code can be
 * forwarded, and the organizer is told so (docs/mvp-prd.md §8).
 */
export function generateEventCode(length = 6): string {
  return randomFrom(ALPHABET, length);
}

/** Appears in the URL, so lowercase; same alphabet for the same reason. */
export function generateSlug(length = 6): string {
  return randomFrom(ALPHABET, length).toLowerCase();
}

/**
 * What a person types is rarely what was printed: they add spaces or dashes and
 * they may not hold shift. Fold case and drop the separators.
 *
 * Deliberately no character substitution. It is tempting to map a typed O onto
 * some alphabet character, but O is equally close to D and Q, so any mapping is
 * a guess — and a wrong guess turns a correctly typed code into a rejection.
 * Excluding the confusable characters from the alphabet is the fix; guessing
 * after the fact is not.
 */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s\-_.]/g, '');
}

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

/**
 * Codes are hashed, not stored. Scrypt rather than a plain digest because the
 * search space is small enough that a leaked table of SHA-256 codes would be
 * exhausted in seconds.
 */
export async function hashCode(code: string): Promise<string> {
  const salt = randomFrom('abcdef0123456789', 32);
  const key = await scrypt(normalizeCode(code), salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt, key.toString('base64url')].join('$');
}

/** Returns false for malformed stored values rather than throwing at a caller. */
export async function verifyCode(code: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, salt, expected] = parts;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    return false;
  }

  let expectedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected, 'base64url');
  } catch {
    return false;
  }
  if (expectedBuf.length === 0) return false;

  try {
    const key = await scrypt(normalizeCode(code), salt, expectedBuf.length, params);
    return timingSafeEqual(key, expectedBuf);
  } catch {
    return false;
  }
}
