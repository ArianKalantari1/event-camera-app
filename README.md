# Event hub

A private, no-install event doorway for community hackathons: attendees scan a QR
code, enter an event code, and reach a hub with the event's information, resources
and a moderated community photo gallery.

Scope and rationale live in [`docs/mvp-prd.md`](docs/mvp-prd.md). Why we build rather
than fork is in [`docs/reference-picpeak.md`](docs/reference-picpeak.md).

## Stack

Next.js (App Router) · TypeScript · Postgres via Drizzle · S3-compatible object
storage · plain CSS. No Tailwind: the attendee hub loads on venue wifi, and a small
payload is a product constraint rather than a preference.

## Running locally

```bash
cp .env.example .env
npm install
npm run dev
```

The defaults need no cloud credentials — `STORAGE_DRIVER=local` keeps uploaded media
on the filesystem under `.storage/`. A Postgres URL is the only thing you must supply.

```bash
npm run db:generate   # write a migration from the schema
npm run db:migrate    # apply migrations
npm run db:seed       # create the demo event and an organizer account
npm run check         # typecheck + lint + tests

npm run job:retention -- --dry-run   # what retention would delete
npm run job:retention                # warn, then delete what is due
```

`npm run test:a11y` runs accessibility regression checks against the same server
— page titles, the upload control's presence in the tab order, gallery labelling
and the contrast tokens. Focus management and the lightbox need a real browser
and are not covered there.

`npm run test:security` runs an authorization suite against a running server and
a seeded database — 47 checks covering media access, cross-event isolation,
organizer membership, magic-link replay, storage key handling and resource
scoping. It needs `npm run dev` and `npm run db:seed` first, and it mutates the
seeded event as it goes, so point it at a development database.

`db:seed` prints the attendee link, the event code, and a ready-to-use organizer
sign-in link. With `MAIL_DRIVER=console` — the default — every later sign-in link
is printed to the server log too, so nothing here needs a mail provider until you
deploy somewhere real people sign in.

## Layout

```
app/                Next.js routes
  e/[slug]/         public event page, code gate, attendee hub
  organizer/        sign-in, event list, moderation console, poster and screen
  api/              media, uploads, dev storage
lib/                domain logic, database schema, storage adapter
  env.ts            lazily validated environment
  routes.ts         every URL the product exposes, in one place
  organizer.ts      organizer sessions and per-event membership
  mail/             mailer interface; console driver needs no account
scripts/            migrate and seed
spike/upload/       standalone upload spike (see its own README)
docs/               PRD and reference notes
```

## Two decisions worth knowing before you read the code

**The event URL is swappable.** The origin lives in `APP_URL` and the path shape in
`lib/routes.ts`. It ends up printed on QR posters, so it is the most expensive string
here to change — nothing else should construct one.

**The reviewed image is the served image.** A browser uploads one file, to a
prefix nothing serves. Completion decodes it, copies it to a key that was never
presigned, and derives the thumbnail from those same bytes. That ordering is
what makes "reviewed before anyone sees it" true: a client cannot supply the
thumbnail a moderator judges independently of the picture attendees get, and a
still-valid signed URL cannot be replayed over an approved photo.

**Retention deletes for real.** `job:retention` warns owners a week ahead, then
deletes originals and derivatives once the date passes. It is safe to run twice
or concurrently — both phases claim their work with a conditional update — and
`--dry-run` changes nothing and sends no mail. The audit row is written before
the rows it counts are deleted, so the record of a deletion outlives it.

**Access is derived, never stored.** Whether an event accepts uploads or shows its
gallery is a pure function of the row and the current time. Scheduled jobs write
durable markers and send notifications; they never decide access. A boolean flipped
by cron is a boolean that is wrong whenever cron is late.
