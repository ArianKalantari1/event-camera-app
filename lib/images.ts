import sharp from 'sharp';

/**
 * Server-side image validation and thumbnail derivation.
 *
 * This exists because of a real defect, so the reasoning is worth keeping.
 *
 * The browser used to upload the display image AND its thumbnail as two
 * independent objects. The moderation queue rendered the thumbnail; the gallery
 * served the original. Nothing tied them together, so an attendee could upload
 * an innocuous thumbnail and arbitrary content as the original, and an
 * organizer approving what they were shown published something they had never
 * seen. Deriving the thumbnail here, from the same bytes, is what makes
 * "reviewed before anyone sees it" true rather than aspirational.
 *
 * It also means the client's declared content type stops mattering. What the
 * file actually is, is what sharp says it is.
 */

export const THUMB_MAX_DIM = 384;
export const THUMB_QUALITY = 68;

/** SVG decodes fine and is a script-execution vector; it is not an event photo. */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heif: 'image/heic',
};

/** Guards against a decompression bomb: a small file claiming enormous dimensions. */
const MAX_PIXELS = 60_000_000;

export interface InspectedImage {
  mime: string;
  width: number;
  height: number;
}

export type ImageProblem =
  | 'not_an_image'
  | 'unsupported_format'
  | 'implausible_dimensions';

export async function inspectImage(
  bytes: Buffer,
): Promise<{ ok: true; image: InspectedImage } | { ok: false; problem: ImageProblem }> {
  let meta;
  try {
    meta = await sharp(bytes, { failOn: 'error' }).metadata();
  } catch {
    return { ok: false, problem: 'not_an_image' };
  }

  const format = meta.format ?? '';
  if (!ALLOWED_FORMATS.has(format)) return { ok: false, problem: 'unsupported_format' };

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1 || width * height > MAX_PIXELS) {
    return { ok: false, problem: 'implausible_dimensions' };
  }

  return { ok: true, image: { mime: MIME_BY_FORMAT[format], width, height } };
}

/**
 * Derives the gallery thumbnail from the stored bytes.
 *
 * `rotate()` with no argument applies the EXIF orientation and then drops the
 * tag, so a portrait photo is upright for every client rather than only for the
 * ones that read EXIF.
 */
export async function deriveThumbnail(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { failOn: 'error' })
    .rotate()
    .resize(THUMB_MAX_DIM, THUMB_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
}

export function explainImageProblem(problem: ImageProblem): string {
  switch (problem) {
    case 'unsupported_format':
      return 'That file type cannot be shown in a gallery. Try a JPEG or PNG.';
    case 'implausible_dimensions':
      return 'That image is too large to process.';
    default:
      return 'That file is not an image we can read.';
  }
}
