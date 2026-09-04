/**
 * Object key layout.
 *
 * Three prefixes, and the split between them is a security boundary, not
 * housekeeping.
 *
 *   events/<eventId>/incoming/<assetId>.<ext>      <- the ONLY presigned key
 *   events/<eventId>/original/<assetId>.<ext>      <- served
 *   events/<eventId>/derived/<assetId>/<variant>.jpg
 *
 * A browser is only ever handed a signed URL for `incoming`, which is never
 * served to anyone. On completion the bytes are validated and copied to
 * `original`, and the thumbnail is derived from those same bytes — so the key
 * an attendee reads was never one the uploader could write, and the artifact a
 * moderator reviews is derived from the artifact everyone is shown.
 *
 * Originals and derivatives stay separate so retention can delete one without
 * touching the other, and so a lifecycle rule can target a prefix.
 */

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export const ACCEPTED_MIME = Object.keys(EXT_BY_MIME);

/** 12 MB. Comfortably above an optimised photo, below an unprocessed original. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export function extensionFor(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null;
}

/** The upload target. Presigned, write-only in practice, and never served. */
export function incomingKey(eventId: string, assetId: string, mime: string): string {
  const ext = extensionFor(mime);
  if (!ext) throw new Error(`Unsupported media type: ${mime}`);
  return `events/${eventId}/incoming/${assetId}.${ext}`;
}

export function originalKey(eventId: string, assetId: string, mime: string): string {
  const ext = extensionFor(mime);
  if (!ext) throw new Error(`Unsupported media type: ${mime}`);
  return `events/${eventId}/original/${assetId}.${ext}`;
}

export function derivedKey(eventId: string, assetId: string, variant: string): string {
  return `events/${eventId}/derived/${assetId}/${variant}.jpg`;
}

export function eventPrefix(eventId: string): string {
  return `events/${eventId}/`;
}

/**
 * Keys reach the filesystem in the local driver and a URL path in the S3 one,
 * so they are validated rather than trusted. Anything outside this shape is
 * rejected before it can become a path.
 */
const KEY_PATTERN =
  /^events\/[0-9a-fA-F-]{36}\/(incoming|original|derived)\/[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

export function isValidKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (key.includes('..') || key.includes('//') || key.includes('\0')) return false;
  return KEY_PATTERN.test(key);
}

export function assertValidKey(key: string): string {
  if (!isValidKey(key)) throw new Error(`Refusing to use an invalid storage key: ${key}`);
  return key;
}
