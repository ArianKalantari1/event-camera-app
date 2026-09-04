'use client';

import { useState, useTransition } from 'react';
import { dismissReport, moderate } from './actions';

export interface ReportRow {
  id: string;
  mediaId: string;
  reason: string;
  detail: string | null;
  createdAt: string;
}

const REASON_TEXT: Record<string, string> = {
  in_photo: 'Someone in the photo asked for it to be removed',
  inappropriate: 'Reported as not belonging in the gallery',
  wrong_event: 'Reported as not from this event',
  other: 'Reported',
};

export function Reports({ slug, reports }: { slug: string; reports: ReportRow[] }) {
  if (reports.length === 0) return null;
  return (
    <section className="stack" style={{ gap: 10 }}>
      <h2 style={{ margin: 0 }}>Removal requests ({reports.length})</h2>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Nothing has been hidden automatically. Someone asked; you decide.
      </p>
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 10 }}>
        {reports.map((r) => (
          <ReportCard key={r.id} slug={slug} report={r} />
        ))}
      </ul>
    </section>
  );
}

function ReportCard({ slug, report }: { slug: string; report: ReportRow }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (gone) return null;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) setGone(true);
      else setNote(res.message ?? 'That did not work.');
    });

  return (
    <li
      className="card"
      style={{
        display: 'flex',
        gap: 12,
        borderLeft: `3px solid ${report.reason === 'in_photo' ? 'var(--bad)' : 'var(--warn)'}`,
        borderRadius: '0 10px 10px 0',
      }}
    >
      <a href={`/api/media/${report.mediaId}`} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${report.mediaId}?v=thumb`}
          alt=""
          style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, background: 'var(--line-2)' }}
        />
      </a>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
          {REASON_TEXT[report.reason] ?? REASON_TEXT.other}
        </p>
        {report.detail ? (
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>“{report.detail}”</p>
        ) : null}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            className="btn"
            type="button"
            disabled={pending}
            onClick={() => run(() => moderate(slug, report.mediaId, 'remove'))}
            style={{ minHeight: 40, padding: '0 14px', fontSize: 14 }}
          >
            Remove the photo
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={pending}
            onClick={() => run(() => dismissReport(slug, report.id))}
            style={{ minHeight: 40, padding: '0 14px', fontSize: 14 }}
          >
            Keep it
          </button>
        </div>

        {note ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--warn)' }}>{note}</p> : null}
      </div>
    </li>
  );
}
