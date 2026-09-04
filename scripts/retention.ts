import 'dotenv/config';
import { runRetention } from '../lib/jobs/retention';

/**
 * The retention job.
 *
 *   npm run job:retention -- --dry-run
 *   npm run job:retention
 *
 * Intended to run on a schedule once deployed. It is safe to run more often
 * than needed and safe to run twice at once: both phases claim their work with
 * a conditional update.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const report = await runRetention({ dryRun });

  if (dryRun) console.log('DRY RUN — nothing was changed and no mail was sent.\n');

  if (report.warned.length === 0 && report.purged.length === 0) {
    console.log('Nothing due.');
  }

  for (const w of report.warned) {
    console.log(`warn   ${w.slug}  ${w.title}  -> ${w.recipients} owner(s)`);
  }
  for (const p of report.purged) {
    console.log(`purge  ${p.slug}  ${p.title}  -> ${p.mediaRows} media rows, ${p.objects} objects`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
