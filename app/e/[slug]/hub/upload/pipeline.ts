/**
 * Client-side image pipeline, carried over from spike/upload.
 *
 * Verified there against a real browser: decode with EXIF orientation applied,
 * downscale, re-encode to JPEG.
 *
 * This produces the display image only. It used to produce the thumbnail too,
 * and that was a security defect: the thumbnail a moderator reviewed and the
 * image attendees were served were two independent uploads. The server now
 * derives the thumbnail from the bytes it received, so this is purely a
 * bandwidth optimisation — the upload is smaller, and nothing about what gets
 * published depends on the client being honest.
 */

export const DISPLAY_MAX_DIM = 2048;
export const DISPLAY_QUALITY = 0.82;

export interface Processed {
  display: Blob;
  width: number;
  height: number;
}

type Decoded = ImageBitmap | HTMLImageElement;

async function decode(file: File): Promise<Decoded> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Safari may reject the options bag; desktop browsers reject HEIC.
    }
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> path, which applies EXIF orientation itself.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('this browser cannot read that image'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function render(src: Decoded, maxDim: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const sw = src.width;
  const sh = src.height;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('canvas unavailable'));
  ctx.drawImage(src, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // Release the backing store promptly; iOS is unforgiving about this.
        canvas.width = 0;
        canvas.height = 0;
        if (blob) resolve({ blob, w, h });
        else reject(new Error('could not encode that image'));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function processImage(file: File): Promise<Processed> {
  const src = await decode(file);
  try {
    const display = await render(src, DISPLAY_MAX_DIM, DISPLAY_QUALITY);
    return { display: display.blob, width: display.w, height: display.h };
  } finally {
    if ('close' in src) src.close();
  }
}

export interface PutTarget {
  url: string;
  headers: Record<string, string>;
}

/**
 * XHR rather than fetch: fetch reports no upload progress without request
 * streams, and an attendee watching a motionless screen on venue wifi is the
 * failure this whole path exists to avoid.
 */
export function put(target: PutTarget, body: Blob, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.url, true);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('the connection dropped'));
    xhr.ontimeout = () => reject(new Error('the upload timed out'));
    xhr.timeout = 120_000;
    xhr.send(body);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function putWithRetry(
  target: PutTarget,
  body: Blob,
  attempts = 3,
  onProgress?: (fraction: number) => void,
): Promise<number> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      onProgress?.(0);
      await put(target, body, onProgress);
      return attempt;
    } catch (err) {
      last = err;
      if (attempt < attempts) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw last instanceof Error ? last : new Error('upload failed');
}
