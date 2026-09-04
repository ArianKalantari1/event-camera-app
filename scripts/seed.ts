import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  auditEvents,
  eventResources,
  eventSessions,
  events,
  loginTokens,
  mediaAssets,
  organizationMembers,
  organizations,
  organizerUsers,
} from '../lib/db/schema';
import { hashSessionToken, mintSessionToken, LOGIN_TOKEN_TTL_MS } from '../lib/domain/session';
import { hashCode } from '../lib/domain/codes';
import { derivedKey, originalKey } from '../lib/storage/keys';
import { placeholderImage } from './png';
import { mostRecentLocalHour } from './zoned-time';

/**
 * Creates the demo event.
 *
 * The photo count is the point. An organizer scanning into an empty grid sees
 * nothing; scanning into a full gallery sees the product. A few rows are left
 * pending so the moderation queue has something in it too.
 */

const SLUG = 'demo42';
const TIMEZONE = 'Australia/Sydney';
const CODE = 'HJ4K9M';
const APPROVED = 40;
const PENDING = 5;

const ORGANIZER_EMAIL = process.env.SEED_ORGANIZER_EMAIL ?? 'organizer@example.com';

const CONTRIBUTORS = [
  'Priya', 'Tom', 'Wei', 'Amara', 'Jonas', 'Sofia', 'Dev', 'Mei', 'Callum', 'Ruth',
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required. See .env.example.');

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);
  const storageRoot = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? '.storage');

  try {
    // Reseeding is expected during development, so start from a clean event.
    // The cascade takes resources, sessions, media and audit rows with it.
    const [existing] = await db.select().from(events).where(eq(events.slug, SLUG)).limit(1);
    if (existing) {
      await db.delete(events).where(eq(events.id, existing.id));
      await fs.rm(path.join(storageRoot, 'events', existing.id), { recursive: true, force: true });
      console.log(`removed the previous ${SLUG}`);
    }

    const now = Date.now();
    const day = 86_400_000;
    const hour = 3_600_000;

    // Anchor to a plausible local hour rather than to the server's clock. Left
    // to drift, the demo shows an organizer a hackathon that started at 1:46am.
    // "Most recent 9am that has already passed" keeps it reliably in progress.
    const startsAt = mostRecentLocalHour(TIMEZONE, 9);
    const endsAt = new Date(startsAt.getTime() + 33 * hour); // 9am Saturday to 6pm Sunday

    const [org] = await db
      .insert(organizations)
      .values({ name: 'Sydney Builders Collective' })
      .returning();

    // One organizer account, owner of that organization. Created only if the
    // address is new, so reseeding does not orphan an existing sign-in.
    const [existingUser] = await db
      .select()
      .from(organizerUsers)
      .where(eq(organizerUsers.email, ORGANIZER_EMAIL))
      .limit(1);

    const user =
      existingUser ??
      (await db.insert(organizerUsers).values({ email: ORGANIZER_EMAIL, name: 'Demo organizer' }).returning())[0];

    await db.insert(organizationMembers).values({ orgId: org.id, userId: user.id, role: 'owner' });

    const [event] = await db
      .insert(events)
      .values({
        orgId: org.id,
        slug: SLUG,
        title: 'Sydney Builders Hackathon',
        description:
          'Thirty-six hours, twelve teams, one room. Build something small that actually runs, ' +
          'then show it to everyone at 4pm on Sunday.',
        startsAt,
        endsAt,
        timezone: TIMEZONE,
        location: 'Fishburners, 11 York St, Sydney',
        contactName: 'Organizing team',
        contactEmail: 'organizers@example.com',
        lifecycle: 'published',
        publishedAt: new Date(),
        codeHash: await hashCode(CODE),
        uploadsOpenAt: startsAt,
        uploadsCloseAt: new Date(endsAt.getTime() + day),
        galleryOpenAt: startsAt,
        // Fourteen days, not seventy-two hours — see docs/mvp-prd.md §7.
        galleryCloseAt: new Date(endsAt.getTime() + 14 * day),
        retentionUntil: new Date(endsAt.getTime() + 60 * day),
      })
      .returning();

    await db.insert(eventResources).values([
      { eventId: event.id, kind: 'action', label: 'Register on Eventbrite', detail: 'Free, but please claim a spot', url: 'https://example.com/tickets', visibility: 'public', sort: 10 },
      { eventId: event.id, kind: 'action', label: 'Join the Discord', detail: 'Announcements and team-finding', url: 'https://example.com/discord', visibility: 'attendee', sort: 20 },
      { eventId: event.id, kind: 'action', label: 'Submit your project', detail: 'Closes 3pm Sunday, no exceptions', url: 'https://example.com/submit', visibility: 'attendee', sort: 30 },
      { eventId: event.id, kind: 'resource', label: 'Starter templates and API keys', url: 'https://example.com/drive', visibility: 'attendee', sort: 40 },
      { eventId: event.id, kind: 'note', label: 'Wifi', detail: 'Network “builders-guest”, password “buildthings”', visibility: 'attendee', sort: 50 },
      { eventId: event.id, kind: 'note', label: 'Code of conduct', detail: 'Be decent. Ask before photographing anyone. Organizers are in red lanyards.', visibility: 'attendee', sort: 60 },
      { eventId: event.id, kind: 'note', label: 'Venue contact', detail: 'Building manager 0400 000 000 — organizers only', visibility: 'organizer', sort: 70 },
      { eventId: event.id, kind: 'schedule', label: 'Doors and breakfast', startsAt: new Date(startsAt.getTime()), visibility: 'attendee', sort: 100 },
      { eventId: event.id, kind: 'schedule', label: 'Kickoff and team forming', startsAt: new Date(startsAt.getTime() + hour), visibility: 'attendee', sort: 110 },
      { eventId: event.id, kind: 'schedule', label: 'Mentor hours', detail: 'Grab anyone in a red lanyard', startsAt: new Date(startsAt.getTime() + 5 * hour), visibility: 'attendee', sort: 120 },
      { eventId: event.id, kind: 'schedule', label: 'Late-night pizza', startsAt: new Date(startsAt.getTime() + 12 * hour), visibility: 'attendee', sort: 130 },
      { eventId: event.id, kind: 'schedule', label: 'Submissions close', detail: 'No extensions', startsAt: new Date(endsAt.getTime() - 3 * hour), visibility: 'attendee', sort: 140 },
      { eventId: event.id, kind: 'schedule', label: 'Demos and judging', startsAt: new Date(endsAt.getTime()), visibility: 'attendee', sort: 150 },
    ]);

    const sessions = await db
      .insert(eventSessions)
      .values(
        CONTRIBUTORS.map((name, i) => ({
          eventId: event.id,
          // Seeded sessions are not sign-in-able: no real token hashes to a
          // value anybody holds, so these cannot be used to enter the event.
          tokenHash: `seed:${event.id}:${i}`,
          displayName: name,
        })),
      )
      .returning();

    let written = 0;
    for (let i = 0; i < APPROVED + PENDING; i++) {
      const approved = i < APPROVED;
      const contributor = sessions[i % sessions.length];
      const createdAt = new Date(startsAt.getTime() + (i / (APPROVED + PENDING)) * (now - startsAt.getTime()));

      const [asset] = await db
        .insert(mediaAssets)
        .values({
          eventId: event.id,
          sessionId: contributor.id,
          storageKey: 'pending',
          originalFilename: `IMG_${4000 + i}.png`,
          mime: 'image/png',
          width: 1200,
          height: 800,
          state: approved ? 'approved' : 'pending',
          moderatedBy: approved ? 'seed' : null,
          moderatedAt: approved ? createdAt : null,
          createdAt,
          uploadedAt: createdAt,
        })
        .returning();

      const key = originalKey(event.id, asset.id, 'image/png');
      const display = placeholderImage(1200, 800, i + 1);
      // 320px wide: the grid never renders a tile larger than that.
      const thumb = placeholderImage(320, 213, i + 1);

      await write(storageRoot, key, display);
      await write(storageRoot, derivedKey(event.id, asset.id, 'thumb'), thumb);
      await db
        .update(mediaAssets)
        .set({ storageKey: key, bytes: display.length })
        .where(eq(mediaAssets.id, asset.id));

      written += display.length + thumb.length;
    }

    await db.insert(auditEvents).values({
      eventId: event.id,
      actorType: 'system',
      action: 'event.seeded',
      meta: { approved: APPROVED, pending: PENDING },
    });

    const base = process.env.APP_URL ?? 'http://localhost:3000';

    // A ready-to-use sign-in link, so a fresh checkout does not need a working
    // mailbox to reach the organizer console. It is single-use and expires like
    // any other, and it is printed to a terminal the developer already controls.
    const token = mintSessionToken();
    await db.insert(loginTokens).values({
      email: ORGANIZER_EMAIL,
      tokenHash: hashSessionToken(token, process.env.SESSION_SECRET!),
      expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
    });

    console.log(`
seeded "${event.title}"

  public page    ${base}/e/${SLUG}
  attendee code  ${CODE}

  organizer      ${ORGANIZER_EMAIL}
  sign in now    ${base}/organizer/verify?token=${encodeURIComponent(token)}
                 (single use, expires in 15 minutes — afterwards use
                  ${base}/organizer/login and read the link from this log)

  ${APPROVED} approved photos, ${PENDING} waiting for review, ${(written / 1048576).toFixed(1)}MB written
`);
  } finally {
    await sql.end();
  }
}

async function write(root: string, key: string, body: Buffer) {
  const file = path.join(root, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
