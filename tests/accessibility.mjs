/**
 * Accessibility regression checks, at the markup level.
 *
 * An audit found that the upload screen was completely unusable without a mouse
 * — the file input was `hidden`, so it was in neither the tab order nor the
 * accessibility tree — and that every page announced the same title. Those are
 * one-line regressions to reintroduce, so they are asserted here.
 *
 * Deliberately HTTP-only, like the security suite. Focus management, the
 * lightbox trap and Escape handling need a real browser and are verified
 * separately; what is checkable in server-rendered HTML is checked here, where
 * it runs with no extra dependency.
 *
 *   npm run dev && npm run db:seed && npm run test:a11y
 */

import { createHmac, randomBytes } from 'node:crypto';
import postgres from 'postgres';
import 'dotenv/config';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const sql = postgres(process.env.DATABASE_URL, { max: 2 });
const hash = (t) => createHmac('sha256', process.env.SESSION_SECRET).update(t).digest('base64url');

let passed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const titleOf = (html) => (html.match(/<title[^>]*>([^<]*)<\/title>/i) ?? [])[1] ?? '';

async function main() {
  const [event] = await sql`select * from events where slug = 'demo42' limit 1`;
  if (!event) throw new Error('Run `npm run db:seed` first.');

  const token = randomBytes(32).toString('base64url');
  await sql`
    insert into event_sessions (event_id, token_hash, expires_at)
    values (${event.id}, ${hash(token)}, ${new Date(Date.now() + 3600_000)})`;
  const cookie = `eh_session=${token}`;

  const get = async (path, withSession = true) =>
    (await fetch(`${BASE}${path}`, { headers: withSession ? { cookie } : {} })).text();

  console.log('\ndistinct page titles');
  const titles = {};
  for (const [path, expect, withSession] of [
    ['/e/demo42', 'Sydney Builders Hackathon', true],
    // Without a session: holding one redirects the gate straight to the hub,
    // which is correct behaviour and would read as the hub's title here.
    ['/e/demo42/enter', 'Enter the event code', false],
    ['/e/demo42/hub', 'hub', true],
    ['/e/demo42/hub/gallery', 'Community gallery', true],
    ['/e/demo42/hub/upload', 'Add your photos', true],
  ]) {
    const title = titleOf(await get(path, withSession));
    titles[path] = title;
    check(`${path} has its own title`, title.includes(expect), `got "${title}"`);
  }
  check(
    'no two attendee pages share a title',
    new Set(Object.values(titles)).size === Object.keys(titles).length,
  );

  console.log('\nthe upload screen is operable without a mouse');
  const upload = await get('/e/demo42/hub/upload');
  const input = (upload.match(/<input[^>]*type="file"[^>]*>/) ?? [])[0] ?? '';
  check('a file input is rendered', input.length > 0);
  check(
    'the file input is not removed from the tab order with `hidden`',
    !/\shidden(?:[\s/>=])/.test(input),
    input.slice(0, 120),
  );
  check('it is visually hidden instead', /visually-hidden/.test(input));
  check('the label points at it', /for="photo-input"/.test(upload));
  check('a live region exists before any upload starts', /aria-live="polite"/.test(upload));

  console.log('\nthe gallery is navigable');
  const gallery = await get('/e/demo42/hub/gallery');
  const tileLabels = [...gallery.matchAll(/aria-label="(Photo \d+ of \d+[^"]*)"/g)].map((m) => m[1]);
  check('every tile is named individually', tileLabels.length > 1);
  check('tile names are unique', new Set(tileLabels).size === tileLabels.length);
  check('the grid keeps list semantics', /role="list"/.test(gallery));

  console.log('\nheadings and contrast tokens');
  const hub = await get('/e/demo42/hub');
  check('hub sections use real headings', (hub.match(/<h2/g) ?? []).length >= 3);

  const css = await (await fetch(`${BASE}/e/demo42`)).text();
  void css;
  const { readFileSync } = await import('node:fs');
  const tokens = readFileSync('app/globals.css', 'utf8');
  check('--line-strong exists for control borders', /--line-strong:/.test(tokens));
  // Match the declaration, not the prose: the rule's comment mentions --ink-3
  // to explain why it is no longer used.
  const labelRule = (tokens.match(/\.label \{([\s\S]*?)\}/) ?? [])[1] ?? '';
  const labelColor = (labelRule.match(/^\s*color:\s*var\((--[a-z0-9-]+)\)/m) ?? [])[1] ?? '';
  check('.label uses a colour that passes AA', labelColor === '--ink-2', `got ${labelColor}`);
  check('forced-colors is handled', /forced-colors: active/.test(tokens));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  await sql.end();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
