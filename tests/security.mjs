/**
 * Authorization regression suite.
 *
 * Every check here corresponds to a boundary that was verified by hand while the
 * feature was built. Hand verification does not survive the next refactor, so it
 * lives here instead.
 *
 * Plain HTTP and direct database setup — no browser. The assertions are about
 * status codes and access, not rendering, and a suite that needs a browser is a
 * suite that stops being run.
 *
 * Sessions are created the way the application creates them: a random token in a
 * cookie, its HMAC in the database. Nothing here bypasses the real check; it
 * only skips the form that would have produced the token.
 *
 *   npm run dev            # in another terminal
 *   npm run db:seed
 *   npm run test:security
 */

import { createHmac, randomBytes } from 'node:crypto';
import postgres from 'postgres';
import 'dotenv/config';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const SECRET = process.env.SESSION_SECRET;
if (!SECRET) throw new Error('SESSION_SECRET is required. Run with the app env loaded.');

const sql = postgres(process.env.DATABASE_URL, { max: 4 });

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const hash = (token) => createHmac('sha256', SECRET).update(token).digest('base64url');

/** An attendee device session for one event, made the way the app makes one. */
async function attendeeSession(eventId) {
  const token = randomBytes(32).toString('base64url');
  await sql`insert into event_sessions (event_id, token_hash) values (${eventId}, ${hash(token)})`;
  return `eh_session=${token}`;
}

/** An organizer session, optionally without membership of anything. */
async function organizerSession(email) {
  const [user] = await sql`
    insert into organizer_users (email, name) values (${email}, 'Suite')
    on conflict (email) do update set name = 'Suite'
    returning id`;
  const token = randomBytes(32).toString('base64url');
  await sql`insert into organizer_sessions (user_id, token_hash) values (${user.id}, ${hash(token)})`;
  return { cookie: `eh_organizer=${token}`, userId: user.id };
}

const get = (path, cookie) =>
  fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' });

const post = (path, cookie, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
    redirect: 'manual',
  });

async function main() {
  const [event] = await sql`select * from events where slug = 'demo42' limit 1`;
  if (!event) throw new Error('Run `npm run db:seed` first.');

  const [approved] = await sql`
    select id from media_assets where event_id = ${event.id} and state = 'approved' limit 1`;
  const [pending] = await sql`
    select id from media_assets where event_id = ${event.id} and state = 'pending' limit 1`;
  if (!approved || !pending) throw new Error('Seed data is missing approved or pending media.');

  // A second event, so cross-event isolation can be tested rather than assumed.
  const [otherOrg] = await sql`insert into organizations (name) values ('Suite Org') returning id`;
  const [other] = await sql`
    insert into events (org_id, slug, title, starts_at, ends_at, lifecycle, published_at,
                        uploads_open_at, gallery_open_at)
    values (${otherOrg.id}, ${'suite' + Date.now().toString(36).slice(-3)}, 'Suite Event',
            now() - interval '1 hour', now() + interval '1 day', 'published', now(),
            now() - interval '1 hour', now() - interval '1 hour')
    returning *`;

  const attendee = await attendeeSession(event.id);
  const otherAttendee = await attendeeSession(other.id);
  const stranger = await organizerSession(`suite-stranger-${Date.now()}@example.com`);

  console.log('\nmedia authorization');
  check('anonymous cannot read an approved photo',
    (await get(`/api/media/${approved.id}`)).status === 404);
  check('attendee of this event can read an approved photo',
    [200, 302].includes((await get(`/api/media/${approved.id}`, attendee)).status));
  check('attendee cannot read a pending photo',
    (await get(`/api/media/${pending.id}`, attendee)).status === 404);
  check('attendee of ANOTHER event cannot read this event\'s photo',
    (await get(`/api/media/${approved.id}`, otherAttendee)).status === 404);
  check('signed-in organizer with no membership cannot read a pending photo',
    (await get(`/api/media/${pending.id}`, stranger.cookie)).status === 404);
  check('a made-up media id is 404, not an error',
    (await get('/api/media/11111111-2222-3333-4444-555555555555', attendee)).status === 404);

  console.log('\nevent windows gate the bytes, not just the listing');
  await sql`update events set gallery_close_at = now() - interval '1 minute' where id = ${event.id}`;
  check('closing the gallery closes the image URL itself',
    (await get(`/api/media/${approved.id}`, attendee)).status === 404);
  await sql`update events set gallery_close_at = now() + interval '14 days' where id = ${event.id}`;
  await sql`update events set retention_until = now() - interval '1 minute' where id = ${event.id}`;
  check('lapsed retention overrides an open gallery window',
    (await get(`/api/media/${approved.id}`, attendee)).status === 404);
  await sql`update events set retention_until = now() + interval '60 days' where id = ${event.id}`;
  check('restoring the windows restores access',
    [200, 302].includes((await get(`/api/media/${approved.id}`, attendee)).status));

  console.log('\nupload authorization');
  const body = { slug: 'demo42', contentType: 'image/jpeg', declaredBytes: 1000, consent: true };
  check('anonymous cannot reserve an upload',
    (await post('/api/uploads', null, body)).status === 403);
  check('attendee of another event cannot upload here',
    (await post('/api/uploads', otherAttendee, body)).status === 403);
  check('upload without consent is refused',
    (await post('/api/uploads', attendee, { ...body, consent: false })).status === 400);
  check('a non-image content type is refused',
    (await post('/api/uploads', attendee, { ...body, contentType: 'application/pdf' })).status === 400);
  check('a declared size over the cap is refused',
    (await post('/api/uploads', attendee, { ...body, declaredBytes: 50 * 1024 * 1024 })).status === 400);

  const reserved = await post('/api/uploads', attendee, body);
  const { assetId } = await reserved.json();
  check('completing with no bytes uploaded is refused',
    (await post(`/api/uploads/${assetId}/complete`, attendee)).status === 409);
  check('another device cannot complete someone else\'s reservation',
    (await post(`/api/uploads/${assetId}/complete`, otherAttendee)).status === 404);

  await sql`update events set uploads_close_at = now() - interval '1 minute' where id = ${event.id}`;
  check('uploads are refused once the window closes',
    (await post('/api/uploads', attendee, body)).status === 409);
  await sql`update events set uploads_close_at = now() + interval '2 days' where id = ${event.id}`;

  console.log('\nstorage keys');
  for (const key of [
    `events/${event.id}/original/../../../../etc/passwd`,
    '/etc/passwd',
    `events/${event.id}/secret/a.jpg`,
    'events/not-a-uuid/original/a.jpg',
  ]) {
    const res = await fetch(
      `${BASE}/api/storage/local?key=${encodeURIComponent(key)}&expires=${Date.now() + 60000}&sig=x`,
      { redirect: 'manual' },
    );
    check(`storage route refuses ${key.slice(0, 44)}`, [400, 403, 404].includes(res.status), `got ${res.status}`);
  }
  const realKey = `events/${event.id}/original/${approved.id}.png`;
  check('storage route refuses a valid key with a forged signature',
    [403, 404].includes(
      (await fetch(
        `${BASE}/api/storage/local?key=${encodeURIComponent(realKey)}&expires=${Date.now() + 60000}&sig=forged`,
        { redirect: 'manual' },
      )).status));
  check('storage route refuses an expired signature',
    [403, 404].includes(
      (await fetch(
        `${BASE}/api/storage/local?key=${encodeURIComponent(realKey)}&expires=1&sig=${hash('anything')}`,
        { redirect: 'manual' },
      )).status));

  console.log('\norganizer surfaces');
  check('anonymous is redirected away from the event console',
    [302, 303, 307].includes((await get('/organizer/events/demo42')).status));
  check('anonymous is redirected away from settings',
    [302, 303, 307].includes((await get('/organizer/events/demo42/settings')).status));
  check('signed-in organizer without membership gets 404 on the console',
    (await get('/organizer/events/demo42', stranger.cookie)).status === 404);
  check('signed-in organizer without membership gets 404 on settings',
    (await get('/organizer/events/demo42/settings', stranger.cookie)).status === 404);
  check('signed-in organizer without membership gets 404 on the poster',
    (await get('/organizer/events/demo42/poster', stranger.cookie)).status === 404);
  check('a forged session cookie is not a session',
    [302, 303, 307].includes((await get('/organizer', 'eh_organizer=' + randomBytes(32).toString('base64url'))).status));

  console.log('\nmagic links');
  const token = randomBytes(32).toString('base64url');
  const [owner] = await sql`select email from organizer_users order by created_at limit 1`;
  await sql`
    insert into login_tokens (email, token_hash, expires_at)
    values (${owner.email}, ${hash(token)}, now() + interval '15 minutes')`;
  const first = await get(`/organizer/verify?token=${encodeURIComponent(token)}`);
  check('a valid link signs in', [302, 303].includes(first.status) &&
    (first.headers.get('location') ?? '').endsWith('/organizer'));
  const replay = await get(`/organizer/verify?token=${encodeURIComponent(token)}`);
  check('the same link cannot be redeemed twice',
    (replay.headers.get('location') ?? '').includes('expired=1'));

  const expiredToken = randomBytes(32).toString('base64url');
  await sql`
    insert into login_tokens (email, token_hash, expires_at)
    values (${owner.email}, ${hash(expiredToken)}, now() - interval '1 minute')`;
  check('an expired but unconsumed link is refused',
    ((await get(`/organizer/verify?token=${expiredToken}`)).headers.get('location') ?? '').includes('expired=1'));
  check('an invented token is refused',
    ((await get('/organizer/verify?token=made-up')).headers.get('location') ?? '').includes('expired=1'));

  console.log('\npublic page scoping');
  const publicHtml = await (await get('/e/demo42')).text();
  const attendeeOnly = await sql`
    select label from event_resources where event_id = ${event.id} and visibility <> 'public'`;
  for (const r of attendeeOnly) {
    check(`non-public resource "${r.label.slice(0, 32)}" is absent from the public page`,
      !publicHtml.includes(r.label));
  }

  console.log('\ndraft events');
  await sql`update events set lifecycle = 'draft' where id = ${event.id}`;
  check('a draft event is 404 for the public', (await get('/e/demo42')).status === 404);
  check('a draft event serves no media', (await get(`/api/media/${approved.id}`, attendee)).status === 404);
  await sql`update events set lifecycle = 'published' where id = ${event.id}`;

  // Clean up the fixtures this suite created.
  await sql`delete from organizations where id = ${otherOrg.id}`;
  await sql`delete from organizer_users where email like 'suite-stranger-%'`;

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nfailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  await sql.end();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
