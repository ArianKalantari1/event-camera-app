# Business model

**Status:** working hypothesis, banked 2026-09-18 · **Owner:** Ari

Recorded so it can be picked up cold. Nothing here is a commitment. Every claim is
tagged **[measured]**, **[decided]**, or **[assumption]** — the tags are the point
of the document, because in three months it will not be obvious which was which.

The near-term job is not to pick a price. It is to run the events that are coming
and come back with the four numbers in §9.

---

## 1. What this is

A private event photo hub for community hackathons. Attendees scan a QR code,
enter a shared event code, and reach one page holding the event's information, its
links, and a moderated gallery they can contribute to. Organizers get the photos
without chasing anyone. **[decided]**

The product is built and works end to end. What is not settled is who pays for it.

## 2. The problem with the obvious answer

**Community hackathons have close to zero willingness to pay.** They are run by
volunteers on sponsor money already committed to pizza and prizes. This is the
central risk in the whole plan and it has not moved. **[assumption, untested]**

The uncomfortable pairing:

- The segment we have *access* to (community hackathons, via Ari) has no budget.
- The segment with a *budget* (sponsored, corporate, university-run, conference
  side-events) we have no particular access to.

Any model that survives has to bridge those two, or pick one and accept the cost.

## 3. Segments

| Segment | Budget | Our access | Role |
|---|---|---|---|
| Community hackathons | ~none | **strong** — Ari organizes and attends | Proof, references, product learning |
| University-run hackathons | small, real | weak | First plausible payer |
| Corporate / internal hack days | real | weak | Best margin, worst fit for a "community" product |
| Sponsored community events | sponsor's, not organizer's | medium | Most interesting: the payer is not the user |

**The sponsored case is the one to watch.** The organizer does not pay; the sponsor
does, for branded exports and a recap they can post. That solves the willingness-to-pay
problem without charging the person who chose the product. **[assumption]**

## 4. Value, by side

**Organizer** — one link instead of five; photos collected without chasing; a
moderated set they can use in a recap; a QR poster they can print.

**Attendee** — finds event information fast; sees the room's photos; contributes
without an account; gets their own photos back.

**Sponsor (hypothetical)** — branded recap assets, and presence on a page every
attendee actually opens. Untested; no sponsor has been asked. **[assumption]**

## 5. Why this and not the commodity

The QR-code-to-photo-gallery space is saturated: Kululu, GuestPix, GuestCam,
SelfBooth, and a long tail. Wedding-shaped, mature, cheap. **[measured — surveyed
2026-09-03]**

So the gallery is not the product. What a wedding app structurally cannot copy is
the **hackathon-shaped hub**: teams, projects, "what I'm building", and the
networking layer that follows from knowing who took which photo.

**The strategic tension, stated plainly:** that differentiator is deliberately
deferred to a later phase. The thing that is built today is the least
differentiated part of the product. That is the correct build order — the media
pipeline has to work before anything sits on top of it — but it means the MVP
validates the commodity, not the moat. When demoing, lead with the hub.

Also unresolved: **Luma already has event-page chat with photo sharing**, and most
hackathon organizers are already on Luma. Nobody has checked what it actually does.
An hour on that is worth more than a week of building. **[open, one hour of work]**

## 6. Unit economics — the strong part

These are measured, not estimated.

Egress dominates, and it scales as **N²**: photo count grows with attendees, and
every attendee views them all. From the Disposable project's own published Firebase
cost model: **[measured]**

| Attendees | Photos | Egress | On Firebase @ $0.12/GB |
|---:|---:|---:|---:|
| 100 | 1,500 | 147 GB | $17.59 |
| 200 | 3,000 | 586 GB | **$70.33** |
| 500 | 7,500 | 3,662 GB | **$439.45** |

**On Cloudflare R2, egress is $0.** That single choice removes the cost curve.
**[decided, implemented]**

On top of that, the client downscales before upload and the server derives a 384px
thumbnail, so a gallery grid never touches originals. Measured: a 3024×4032 source
stores as 141KB display + 27KB thumbnail. **[measured]**

**Cost per pilot event: under $20/month all-in, dominated by the Vercel Pro seat
($20) rather than by usage.** Neon and R2 free tiers cover a 150-person event.
**[measured at pilot scale]**

### What that means strategically

Being free for community events **costs almost nothing**. This is not charity; it
is the cheapest possible distribution for a product whose main problem is
references and access. The paid tier does not need to subsidise the free tier,
because the free tier is nearly free to serve.

## 7. Pricing hypotheses — none chosen

Ranked by how well they fit the cost structure above.

1. **Free for community events, paid for branded ones.** Sponsor logo on exports,
   a curated public recap, custom domain. Charge the sponsor or the company, never
   the volunteer. ~$200–500 per event. **[assumption]**
2. **Per-event flat fee for corporate/internal events.** Simple, defensible,
   nobody has to think about attendee counts. ~$300–800. **[assumption]**
3. **Free, as a portfolio and credibility asset.** A legitimate choice given Ari's
   position. It is also what happens by default if nothing is decided.

**Not recommended:** per-attendee or per-photo pricing. It makes organizers ration
the exact behaviour the product exists to produce, and the marginal cost that would
justify it is now approximately zero.

## 8. Go to market

The sequencing already chosen: **the demo is the recruiting instrument.** Volunteer
organizers respond to a working link, not an interview request. Build first, recruit
with it. **[decided, done — the app works]**

The ask that counts is **a named event with a date**. "Sounds cool, keep me posted"
is not a commitment.

**This is now live: Ari has events coming.** That moves the project from "find a
pilot" to "run the pilot well and measure it".

## 9. What the coming events must answer

Four numbers. Everything else is commentary.

1. **Contribution rate.** Approved photos per 100 attendees who entered the code.
   The product's primary outcome metric; already instrumented in the organizer
   console. Below ~15% and the attendee loop does not work.
2. **Entry rate.** What share of checked-in attendees actually scan and enter. If
   this is low, nothing downstream matters.
3. **Would the organizer use it again** — and separately, **would anyone have paid**.
   Ask the second question even though the answer will be no; the *reason* is the
   signal.
4. **Real cost for the event.** Compare against the table in §6 to see whether the
   model holds outside a spreadsheet.

Secondary, but cheap to capture: does anyone ask "who took this photo?" — that is
the networking layer asking to be built, and it is the moat.

## 10. What would falsify this

- Attendees enter but do not contribute → the attendee loop is broken; a prettier
  gallery will not fix it.
- Organizers publish and never return → the organizer loop is broken; the hub is
  not saving them work.
- Nobody asks about people or teams → the hackathon differentiator is imagined,
  and this is a commodity gallery competing with mature products on price.
- Luma ships an adequate gallery → the free tier's distribution advantage
  evaporates, and only the paid branded case survives.

## 11. Open decisions

| # | Decision | Blocked on |
|---|---|---|
| 1 | Free / paid / portfolio — what this is *for* | The coming events |
| 2 | Whether to pursue the sponsor-pays model | One sponsor conversation |
| 3 | What Luma's photo feature actually covers | One hour |
| 4 | Whether to build the networking layer | Whether anyone asks at the events |
| 5 | Domain and brand | Nothing — just unmade |
| 6 | Deployment (Vercel + Neon + R2, ~20 min) | Needed before any real event |

## 12. Where the rest lives

- `docs/mvp-prd.md` — product scope, what is built, what is not
- `docs/reference-picpeak.md` — why this was built rather than forked
- The measured performance and security work is in the commit history on
  `claude/development-discussion-y8bjho`

---

### Pick-up note for a future session

Ari has events coming and the app is built but **not deployed**. The highest-value
next actions, in order: deploy it; run `spike/upload` on a real iPhone (the one
assumption never verified — EXIF orientation on a real portrait photo); run the
event; collect the four numbers in §9. Pricing is downstream of all of that.
