# What to take from PicPeak (and what not to)

Read at commit `90da797e` (v3.122.7-beta.0, 2026-09-03). MIT licensed.

## Why we are not forking it

Measured, not estimated:

| | |
|---|---:|
| Source lines (excl. deps/dist) | 302,001 |
| Source files | 1,334 |
| Database tables | ~100 |
| npm dependencies | 101 |
| Backend route files | 70 (23 of them business/CRM) |

The tables include `invoices`, `invoice_line_items`, `ledger_accounts`, `vat_codes`,
`expenses`, `quotes`, `contracts`, `projects`, `payment_term_templates`,
`whatsapp_queue`, `workflow_runs`, `mail_accounts`, `received_emails`,
`restore_runs`, `backup_manifest`.

PicPeak is a **photography business ERP** — invoicing, quoting, contracts, deals,
expenses, tax reporting, a workflow engine, an email client, backup/restore — with
a client gallery as one module inside it. Stripping it to the gallery means deleting
most of a 302k-line application across ~100 coupled tables while upstream ships beta
releases daily. For a solo developer that is the whole project, and none of it is
the product.

It also ships face recognition (`photo_faces`, a Python `ml/` service). That is an
explicit non-goal for us and a privacy problem at an event full of people who did
not consent to it.

## The four things worth stealing

### 1. Derive visibility at request time. The scheduler is bookkeeping, not the gate.

`backend/src/utils/revealMode.js`

Their gallery visibility is computed from the event row on every request. The cron
job that stamps `revealed_at` exists only to make the state durable and fire
notifications — if it lags, the gallery still opens exactly on time, because nothing
reads the stamp to decide.

This sharpens the plan's "event state machine rather than scattered date checks":
the state must be **derived from timestamps**, not stored and kept in sync by a job.
A boolean flipped by cron is a boolean that is wrong whenever cron is late.

Our `event_state(event, now)` should be a pure function. Jobs may write durable
markers and send notifications; they must never be the thing that opens or closes
access.

### 2. Gate the images, not just the listing.

Their comment: *"Photo IDs are sequential, so gating only the listing would leave
images probeable."*

MOONSHOT's shipped privacy bug was exactly this — photos in "reveal later" mode were
still reachable from the App Clip before the event ended. Authorization belongs on
every media URL, including derivatives and downloads, not only on the index endpoint.

For us: **no unguessable-URL-as-security.** Approved-but-private media is served
through an access check or a short-lived signed URL, never a permanent public one.

### 3. Make scheduled jobs idempotent with a conditional update.

```js
const stamped = await db('events')
  .where('id', event.id)
  .whereNull('revealed_at')       // the guard
  .update({ revealed_at: ..., reveal_at: null });
if (stamped !== 1) continue;      // someone else got there first
```

Row count as the concurrency primitive. Exactly one worker sends the notification.
The plan already requires deletion and retention jobs to be idempotent; this is the
cheap way to do it.

They also null out the schedule when consuming it, so a stale past timestamp cannot
silently re-open the gate if the gallery is re-armed later.

### 4. Coerce timestamps at the boundary.

Their comment: SQLite stores knex dates as milliseconds, so `new Date("178…")` on
that string is `Invalid Date` — which silently kept galleries hidden past their
scheduled reveal. Postgres hands back a `Date`, an API hands back an ISO string.

We are Postgres-only, so this specific bug does not apply, but the shape does: a
comparison against an `Invalid Date` is always false, and "always false" in an access
check fails toward whichever side the code happens to be written on. Parse once at
the edge, hold `Date` internally, and unit-test the boundary.

## Smaller notes

- `middleware/gallery.js` keeps an explicit list of which access levels bypass the
  hidden state, with a comment on why `accessLevel` alone misclassifies one of them.
  Access scope belongs in one named place, not spread across route handlers.
- Their admin-preview check re-validates against the admin's `password_changed_at`,
  because without it a logged-out or deactivated admin's token kept unlocking every
  gallery until `exp`.
- `services/storage/s3Storage.js` auto-enables `forcePathStyle` for any custom
  endpoint and SSRF-vets the endpoint in production. Worth copying the vetting idea;
  R2 does not need path style.

## Not applicable to us

- Their guest upload is a plain multi-file picker with no per-guest limits.
- Node/Express + React (not Next.js), knex, SQLite-or-Postgres dual support. The
  dual-database compatibility layer (`utils/dbCompat`, `formatBoolean`) is a large
  ongoing tax we have no reason to pay.
