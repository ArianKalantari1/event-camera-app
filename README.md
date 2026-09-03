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
npm run db:seed       # create the demo event
npm run check         # typecheck + lint + tests
```

## Layout

```
app/                Next.js routes: public event page, attendee hub, organizer console
lib/                domain logic, database schema, storage adapter
  env.ts            lazily validated environment
  routes.ts         every URL the product exposes, in one place
scripts/            migrate and seed
spike/upload/       standalone upload spike (see its own README)
docs/               PRD and reference notes
```

## Two decisions worth knowing before you read the code

**The event URL is swappable.** The origin lives in `APP_URL` and the path shape in
`lib/routes.ts`. It ends up printed on QR posters, so it is the most expensive string
here to change — nothing else should construct one.

**Access is derived, never stored.** Whether an event accepts uploads or shows its
gallery is a pure function of the row and the current time. Scheduled jobs write
durable markers and send notifications; they never decide access. A boolean flipped
by cron is a boolean that is wrong whenever cron is late.
