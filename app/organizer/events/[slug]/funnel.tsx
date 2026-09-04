import { contributionsPerHundred, type FunnelCounts } from '@/lib/domain/funnel';

/**
 * The event funnel.
 *
 * A labelled bar list rather than a plot: seven ordered stages read once by one
 * person, where the number itself is the point and a chart would only put a
 * scale between the organizer and it. One hue for magnitude; the text stays in
 * ink tokens so the colour carries nothing the words do not.
 */
export function Funnel({ counts }: { counts: FunnelCounts }) {
  const perHundred = contributionsPerHundred(counts);

  const stages: { label: string; value: number; note?: string }[] = [
    { label: 'Saw the public page', value: counts.publicViews },
    { label: 'Tried the code', value: counts.gateAttempts },
    { label: 'Got in', value: counts.gateSuccesses, note: `${counts.uniqueSessions} devices` },
    { label: 'Opened the hub', value: counts.hubViews },
    { label: 'Opened the gallery', value: counts.galleryViews },
    { label: 'Started an upload', value: counts.uploadsStarted },
    { label: 'Finished an upload', value: counts.uploadsCompleted },
    { label: 'Approved', value: counts.approved },
  ];

  const max = Math.max(1, ...stages.map((s) => s.value));
  const completionRate =
    counts.uploadsStarted > 0
      ? Math.round((counts.uploadsCompleted / counts.uploadsStarted) * 100)
      : null;

  return (
    <section className="stack" style={{ gap: 12 }}>
      <h2 style={{ margin: 0 }}>Numbers</h2>

      <div className="card stack" style={{ gap: 4 }}>
        <p className="label" style={{ margin: 0 }}>Approved photos per 100 attendees</p>
        <p
          style={{
            margin: 0,
            fontSize: 44,
            lineHeight: 1.05,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {/* A denominator of zero is not a score of zero. */}
          {perHundred === null ? '—' : perHundred}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {perHundred === null
            ? 'Nobody has entered the code yet.'
            : `${counts.approved} approved from ${counts.uniqueSessions} device${counts.uniqueSessions === 1 ? '' : 's'} that entered.`}
          {completionRate !== null ? ` ${completionRate}% of started uploads finished.` : ''}
        </p>
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        {stages.map((stage) => (
          <div
            key={stage.label}
            style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'baseline' }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                {stage.label}
                {stage.note ? <span className="muted"> · {stage.note}</span> : null}
              </p>
              <div
                aria-hidden="true"
                style={{ height: 6, marginTop: 5, background: 'var(--line-2)', borderRadius: 3 }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(stage.value > 0 ? 2 : 0, (stage.value / max) * 100)}%`,
                    background: 'var(--accent)',
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 15 }}>
              {stage.value}
            </span>
          </div>
        ))}
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Counted in this application, not by a third party. Each row records a stage and a
        pseudonymous session — no address, no device fingerprint.
      </p>
    </section>
  );
}
