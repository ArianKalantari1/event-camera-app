# Photo-first MVP — PRD

**Version** 0.2 · **Date** 2026-09-04 · **Owner** Ari · **Status** Milestone 0 built, parts of Milestone 1 built

Scoped to Phase 2 of the *Event Media Product Development Journey* (v0.2), rewritten
for one solo developer instead of the two-engineer team that document assumes.
Phases 4–8 appear here only as things this release must not preclude.

---

## 0. Where this actually is

Written against the code, not against intentions.

**Built and verified end to end.** Public event page with scope-filtered
resources · event code gate with attempt limiting · attendee device sessions ·
hub, gallery and gated media · client-side image pipeline with EXIF-safe
downscale, retry and a browser-generated thumbnail · moderation queue with an
audit trail · printable QR poster and venue screen · magic-link organizer
sign-in with per-event membership · self-service event creation, settings and
code rotation · retention warning and deletion job · bulk export of approved originals as a
streamed zip · attendee removal requests with an organizer queue · seed with a
demo event.

**Not built.** Analytics events · accessibility audit · deployment.

**Not verified, and only a real device can.** iOS Safari and Android Chrome.
Every browser check so far is Chromium. The EXIF-orientation question on a real
portrait iPhone photo — the one that decides whether the gallery works at all —
is still open. `spike/upload` answers it in ten minutes.

Two numbers worth carrying forward. Time to first screenful of a 40-photo
gallery: 1.5s on congested venue wifi (1.5Mbps/150ms), 5.1s on a hostile
400kbps/400ms profile. And the authorization suite (`npm run test:security`) is
47 checks, all passing.

## 1. Decisions already made

These are settled. Reopening them costs more than living with them.

| Decision | Choice | Why |
|---|---|---|
| Market | Community hackathons and builder events | Where the organizer access actually is |
| Platform | Responsive web + PWA, no install to enter | Plan §4; QR must open in the browser |
| Stack | Next.js (App Router), TypeScript, Drizzle | Solo speed, one deploy for public + hub + dashboard |
| Database | Neon Postgres | Free at pilot scale, real Postgres |
| Media storage | Cloudflare R2 via the plain S3 API | Zero egress; see §9 |
| Hosting | Vercel (Pro if monetised — Hobby is non-commercial) | |
| Analytics | PostHog | Covers the metrics epic without building one (not yet wired) |
| Organizer auth | Magic link, mailer behind an interface | Console driver needs no mail account in development |
| QR generation | `qrcode-generator` | MIT, zero dependencies, rendered server-side to SVG |
| Existing codebases | Reference only, never forked | See `docs/reference-picpeak.md` |
| Cloud provider (AWS vs Azure) | **Deferred** | Expected credits are not credits. S3 API keeps it reversible |

## 2. Hypothesis

> A community-event organizer can create one useful event doorway quickly, and
> attendees will use a code-protected gallery to contribute and retrieve community
> photos.

This release tests that and nothing else.

## 3. The sequencing decision

The source plan gates the MVP build behind two committed pilot organizers. We are
inverting that: **there are no committed organizers yet, and the demo is the
recruiting instrument.** Volunteer organizers respond to a working link, not to an
interview request.

The cost of being wrong is three weeks. The cost of the alternative — a research
phase that produces no artifact — is a solo developer with nothing to show.

**Milestone 0 (Demo Zero, ~3 weeks)** — enough product to put in an organizer's hand.
**Milestone 1 (Pilot-ready)** — begins only once an organizer commits *a named event
with a date*. "Sounds cool, keep me posted" is not a commitment.
**Milestone 2 (V1)** — driven by pilot evidence, not by this document.

---

## 4. Milestone 0 — Demo Zero

**Definition of done:** an organizer scans a QR code on their own phone, in front of
you, lands in a gallery that already looks alive, uploads a photo, and sees it held
for approval. Nothing else.

### In scope

**Attendee path**
- `/e/{slug}` → event code gate → device session → hub
- Event information: title, date, location, organizer, description, schedule, links
- Approved-photo gallery, responsive thumbnails, full-image view
- Photo upload: select or camera, client-side optimise, signed direct PUT to R2,
  progress, cancel, retry, clear failure state
- Upload consent notice and usage explanation
- "Pending approval" state visible to the contributor
- Download an approved image; share sheet where supported, download fallback where not

**Organizer path**
- Moderation queue: preview, approve, reject, remove
- Nothing else. No dashboard, no analytics, no export.

**Operations**
- One deployed environment on a real HTTPS domain
- A seeded demo event with ~40 good photos already approved
- Error tracking

### Deferred at the time, and what happened since

Deferred: organizer self-service creation · organizer authentication · retention
and deletion jobs · bulk export · QR poster generator · branded share templates ·
the event template *system* · analytics · staging environment · background job
queue.

Since built: **organizer authentication**, **self-service creation and
settings**, **retention and deletion**, and the **QR poster and venue screen**.
The shared console key that stood in for authentication is gone rather than left
beside the real thing.

Still deferred: bulk export · branded share templates · a template *system* ·
analytics · staging · a job queue. The background queue looks unlikely to be
needed at all — the browser produces the thumbnail, so nothing is waiting on
server-side image work.

### Milestone 0 acceptance

- [ ] Upload succeeds on a real iPhone (Safari) and a real Android (Chrome)
- [ ] A portrait photo displays the right way up in the gallery
- [ ] An interrupted upload shows an understandable recovery path
- [ ] No upload is visible to any attendee before approval
- [ ] The organizer can remove any image immediately
- [ ] The QR code opens the hub with no install prompt on the critical path
- [ ] Cold load of the hub is usable on a throttled 3G profile

---

## 5. Milestone 1 — Pilot-ready

Added only once an event is booked.

- Organizer authentication (magic link) and event ownership
- Organizer self-service: create, edit, preview, publish, close
- The Community Hackathon template as structured fields
- Public/private classification per field and resource
- Event code rotation
- QR poster and venue-screen graphic
- **Time windows and retention** (§7) with automated tests
- Report-content and removal-request pathways
- Moderation audit record
- Bulk export of approved originals
- Analytics events (§10)
- Event-day runbook and a fallback upload link

---

## 6. Data model

Six tables. The plan's fuller entity list stays valid as a target; this is what
Milestone 0 and 1 actually need.

```
organizations      id, name, created_at
events             id, org_id, slug, title, description, starts_at, ends_at, timezone,
                   location, banner_key, contact, state, code_hash,
                   uploads_open_at, uploads_close_at, gallery_open_at, gallery_close_at,
                   retention_until, published_at, archived_at
event_resources    id, event_id, kind, label, url, visibility, sort
event_sessions     id, event_id, token_hash, display_name, team, linkedin_url,
                   created_at, last_seen_at
media_assets       id, event_id, session_id, storage_key, mime, bytes, width, height,
                   state, moderated_by, moderated_at, reject_reason, created_at
audit_events       id, event_id, actor_type, actor_id, action, target, meta, created_at
```

**Access scopes are explicit columns, never inferred.** `event_resources.visibility`
is one of `public | attendee | organizer`. `media_assets.state` is one of
`pending | approved | rejected | removed`.

## 7. Event state and time windows

Four independent windows, per the plan's principle that they are separate concerns:

| Window | Controls | Pilot default |
|---|---|---|
| `uploads_open_at` → `uploads_close_at` | Whether contribution is possible | Event start → +24h |
| `gallery_open_at` → `gallery_close_at` | Whether attendees can browse | Event start → **+14 days** |
| `retention_until` | When originals are deleted | Per pilot agreement |
| `published_at` / `archived_at` | Lifecycle | Manual in Milestone 0 |

**The gallery window is 14 days, not the 72 hours the source plan suggests.** A short
window manufactures urgency that inflates the download metric, and the plan's own
risk register flags "gallery expiry feels coercive." Attendees look for event photos
the following week, when they write about it. Treat short windows as a cost lever to
be justified by measured storage cost, not as a default.

### The rule that matters

> `eventState(event, now)` is a **pure function of the row and the clock**. Jobs write
> durable markers and send notifications. Jobs never decide access.

A boolean flipped by cron is a boolean that is wrong whenever cron is late. This is
the single most valuable thing taken from reading PicPeak; the reasoning is in
`docs/reference-picpeak.md`.

Corollary: **authorization goes on every media URL**, including derivatives and
downloads — not only on the listing. Sequential or guessable IDs make a gated index
with ungated images no gate at all. This is the exact bug MOONSHOT-DISPOSABLE
shipped.

## 8. Access model, stated honestly

A shared event code plus a device session. The code can be forwarded and is not
equivalent to verified attendee identity. This is a deliberate trade against
requiring accounts, and the organizer must be told so in plain words — it is the
difference between "private" and "not public," and only the second is true.

Consequences: display the code at check-in rather than in public promotion, support
rotation, and never describe the gallery as secure.

## 9. Cost model

From the Disposable project's own published Firebase cost model, egress dominates and
scales as N² — photo count grows with attendees, and every attendee views them all:

| Attendees | Photos | Egress | Firebase egress cost |
|---:|---:|---:|---:|
| 100 | 1,500 | 147 GB | $17.59 |
| 200 | 3,000 | 586 GB | **$70.33** |
| 500 | 7,500 | 3,662 GB | **$439.45** |

On R2, egress is $0. The 2048px client-side downscale cuts stored bytes roughly
fourfold on top of that. This is why the storage decision was made before the
provider decision, and why the provider decision can wait.

Target: **under $20/month at pilot scale**, and a measurable cost per approved asset
before any pricing conversation.

## 10. Metrics

Milestone 1 onward. Primary outcome, unchanged from the plan:

> Useful, approved, permissioned contributions per 100 attendees.

Paired with organizer reuse and attendee download/share behaviour, so contribution
volume is not optimised at the expense of quality.

Instrument: public page views · code entries and success rate · unique device
sessions · upload started / completed / failed / retried · approvals and rejections ·
moderation latency · gallery views and browse depth · downloads and share activations.

No unnecessary personal tracking. Sessions are pseudonymous by design.

## 11. Non-goals

Inherited from the plan and still binding: native apps, any app-store distribution,
video, LinkedIn auth or publishing, persistent cross-event profiles, personal
networking QR, people directory, messaging, team/project pages, registration or
ticketing, third-party data sync, AI captions or recaps, **face recognition**, venue
or sponsor marketplace, guaranteed background uploads after the browser closes.

Face recognition is called out because the most obvious codebase to borrow from ships
it. We do not want it and will not inherit it.

## 12. Known-unresolved

1. **Monetisation.** Community hackathons have close to zero willingness to pay. The
   plausible model is free for community events, paid for sponsored or corporate ones.
   Mitigation: make one of the two pilots an event with a budget.
2. **Differentiation.** The QR-photo-gallery space is commoditised. What is defensible
   is the hackathon-shaped hub — teams, projects, "what I'm building" — which this
   release defers. The MVP validates the least differentiated part of the product.
   Demo the hub, not the gallery.
3. Domain and permanent event URL format.
4. Accepted image formats and maximum dimensions, pending real-device spike data.
5. Media licence and removal wording.
6. Pilot success targets, to be set with the organizer rather than assumed.

## 13. Immediate next actions

1. Run `spike/upload` on a real iPhone and a real Android; record `metrics.jsonl`.
2. Decide the domain and lock the `/e/{slug}` format.
3. Scaffold the Next.js app and the six tables.
4. Build the attendee path end to end against the spike's upload pipeline.
5. Seed the demo event.
6. Start organizer conversations with a link, asking for a named event and a date.

Item 1 gates item 4. Everything else is parallel.
