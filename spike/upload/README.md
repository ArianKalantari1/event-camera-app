# Spike 01 — iPhone photo to object storage

Everything else in this product is CRUD. This is the part that decides whether it
works: a 4MB HEIC photo, picked on someone's phone, on venue wifi, reaching storage
without the attendee giving up.

Run it, put it on your phone, and find out. The point is not the code — it's the
numbers in `metrics.jsonl` afterwards.

## Run

```bash
node server.mjs                       # mock mode: no credentials, no npm install
```

Open the printed `phone:` URL on your phone (same wifi as the laptop). If your
phone can't reach it, tunnel instead:

```bash
cloudflared tunnel --url http://localhost:3000
```

Exercise the retry path by making the network hostile:

```bash
FAIL_RATE=0.5 LATENCY_MS=1500 node server.mjs
```

Against real R2 (or any S3 API):

```bash
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
MODE=r2 R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... node server.mjs
```

The bucket needs CORS allowing `PUT` and the `content-type` header from your origin.

## What to actually test

Do these on a real iPhone and a real Android, not on the laptop.

1. **A portrait photo.** Look at the thumbnail. Sideways means EXIF orientation is
   not surviving the canvas round-trip, and that breaks the whole gallery.
2. **A HEIC photo** (iPhone default unless the camera is set to "Most Compatible").
   Note whether iOS handed over a `.heic` or silently converted to JPEG — it depends
   on the phone's settings, and both paths have to work.
3. **Five photos at once.** Watch for the tab reloading itself; that is iOS killing
   the page for memory. The queue is serial for this reason.
4. **On mobile data, then on bad wifi.** Compare `uploadMs`.
5. **Lock the phone mid-upload**, then come back. Record what happens — this is the
   known browser limitation the plan's MVP non-goals already admit to.
6. **A screenshot and a photo of a document**, not just scenery — text is where
   quality loss at 0.82 shows up first.

## Settings worth changing

In `public/index.html`:

- `maxDim: 2048` — the whole size story. Enough for a gallery and a reasonable
  print, at a fraction of the original bytes.
- `quality: 0.82` — drop to 0.75 and see whether you can tell on a phone screen.
- `attempts: 3` — with backoff at 500ms, then 1s.

## What this deliberately does not do

- **No resumable upload.** A single PUT that retries from zero. At a few hundred KB
  that is cheap, and multipart is a large amount of machinery to avoid re-sending
  it. If the metrics show uploads failing repeatedly on venue wifi, that conclusion
  changes and resumability moves from Phase 4 to now.
- **No auth, no event, no moderation.** Not the risk being tested.
- **Uploads go straight to storage, not through the app server.** That property is
  in the plan and is far easier to keep from the start than to retrofit.

## Reading the output

`metrics.jsonl` gets one line per upload, with device UA and connection type.
After a few real-device runs:

```bash
python3 -c "
import json
for l in open('metrics.jsonl'):
    r = json.loads(l)
    kb = r.get('outBytes', r['originalBytes']) / 1024
    print(f\"{kb:6.0f}KB {r['uploadMs']:6}ms  x{r['attempts']}  {r.get('net')}  {r['name']}\")
"
```

The number that decides the architecture: **first-attempt upload success rate on
venue-grade wifi.** Above ~90% and a plain PUT with retry is fine for the pilot.
Below it, resumability stops being a Phase 4 nicety.

## Status

Verified in headless Chromium: a 3024x4032 source is decoded, downscaled to
1536x2048, re-encoded, and PUT successfully; with failures injected, the client
makes 3 attempts with backoff and then reports a clear failure without losing the
optimised image. **Not yet verified on any real phone** — that is the entire
remaining point of this spike.
