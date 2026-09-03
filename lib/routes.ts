import { env } from './env';

/**
 * Every URL the product exposes is built here.
 *
 * The event path ends up printed on QR posters and venue signage, so it is the
 * most expensive string in the system to change. Keeping the origin in APP_URL
 * and the shape in one file means the domain stays swappable until it is
 * decided (docs/mvp-prd.md §12) without a find-and-replace across the app.
 */

export const EVENT_PATH_PREFIX = '/e';

export const paths = {
  event: (slug: string) => `${EVENT_PATH_PREFIX}/${slug}`,
  eventGate: (slug: string) => `${EVENT_PATH_PREFIX}/${slug}/enter`,
  eventHub: (slug: string) => `${EVENT_PATH_PREFIX}/${slug}/hub`,
  eventGallery: (slug: string) => `${EVENT_PATH_PREFIX}/${slug}/hub/gallery`,
  eventUpload: (slug: string) => `${EVENT_PATH_PREFIX}/${slug}/hub/upload`,
  media: (id: string) => `/api/media/${id}`,
  mediaThumb: (id: string) => `/api/media/${id}/thumb`,
  console: (key: string, slug: string) => `/console/${key}/${slug}`,
} as const;

/** Absolute URL, for QR codes, link previews and anything that leaves the app. */
export function absolute(path: string): string {
  return new URL(path, env().APP_URL).toString();
}
