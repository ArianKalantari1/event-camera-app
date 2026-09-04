'use client';

import { useRef, useState } from 'react';
import { processImage, putWithRetry } from './pipeline';

type Status = 'queued' | 'preparing' | 'uploading' | 'done' | 'failed';

interface Item {
  key: number;
  name: string;
  status: Status;
  progress: number;
  message?: string;
  previewUrl?: string;
}

export function Uploader({ slug }: { slug: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [consent, setConsent] = useState(false);
  const nextKey = useRef(0);
  // Serial: decoding several 12-megapixel photos at once gets the tab killed
  // for memory on iOS. This is the queue, not a nicety.
  const queue = useRef<Promise<void>>(Promise.resolve());

  function patch(key: number, next: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...next } : i)));
  }

  async function uploadOne(file: File, key: number) {
    try {
      patch(key, { status: 'preparing' });

      let display: Blob = file;
      let width: number | undefined;
      let height: number | undefined;

      try {
        const processed = await processImage(file);
        display = processed.display;
        width = processed.width;
        height = processed.height;
      } catch (err) {
        // Never lose a contribution because optimisation failed. The original
        // goes up instead, and the size limit still applies server-side.
        patch(key, { message: `Could not optimise this one (${(err as Error).message}); sending it as is.` });
      }

      patch(key, { previewUrl: URL.createObjectURL(display) });

      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          contentType: display.type || 'image/jpeg',
          declaredBytes: display.size,
          width,
          height,
          originalFilename: file.name.slice(0, 255),
          consent: true,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'could not start the upload');
      }

      const { assetId, upload } = await res.json();

      patch(key, { status: 'uploading', progress: 0 });
      await putWithRetry(upload, display, 3, (f) => patch(key, { progress: f }));

      const done = await fetch(`/api/uploads/${assetId}/complete`, { method: 'POST' });
      if (!done.ok) {
        const body = await done.json().catch(() => ({}));
        throw new Error(body.error ?? 'could not finish the upload');
      }

      patch(key, { status: 'done', progress: 1, message: undefined });
    } catch (err) {
      patch(key, { status: 'failed', message: (err as Error).message });
    }
  }

  function handleFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const key = nextKey.current++;
      setItems((prev) => [{ key, name: file.name, status: 'queued', progress: 0 }, ...prev]);
      queue.current = queue.current.then(() => uploadOne(file, key));
    }
  }

  return (
    <div className="stack">
      <label
        className="card"
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ width: 20, height: 20, marginTop: 2, flex: '0 0 auto' }}
        />
        <span style={{ fontSize: 14 }}>
          I took these photos, or I have permission to share them. The organizers may use approved
          photos in the event recap. I can ask for anything of mine to be removed.
        </span>
      </label>

      <label className="btn" style={{ opacity: consent ? 1 : 0.5, cursor: consent ? 'pointer' : 'not-allowed' }}>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={!consent}
          hidden
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        Choose photos
      </label>

      {items.length > 0 ? (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 10 }}>
          {items.map((item) => (
            <li key={item.key} className="card" style={{ display: 'flex', gap: 12 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  flex: '0 0 auto',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--line-2)',
                }}
              >
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.name}
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 13,
                    color:
                      item.status === 'failed'
                        ? 'var(--bad)'
                        : item.status === 'done'
                          ? 'var(--good)'
                          : 'var(--ink-2)',
                  }}
                >
                  {label(item)}
                </p>
                {item.status === 'uploading' ? (
                  <div
                    style={{ height: 4, background: 'var(--line-2)', borderRadius: 2, marginTop: 8 }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.round(item.progress * 100)}%`,
                        background: 'var(--accent)',
                        borderRadius: 2,
                        transition: 'width .15s',
                      }}
                    />
                  </div>
                ) : null}
                {item.message && item.status !== 'failed' ? (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--warn)' }}>{item.message}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function label(item: Item): string {
  switch (item.status) {
    case 'queued':
      return 'Waiting…';
    case 'preparing':
      return 'Preparing…';
    case 'uploading':
      return `Uploading ${Math.round(item.progress * 100)}%`;
    case 'done':
      return 'Sent — waiting for an organizer to approve it';
    case 'failed':
      return item.message ?? 'Failed';
  }
}
