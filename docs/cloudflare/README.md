# Tellyclub — Cloudflare R2 prefix mirror

An optional accelerator for the [Tellyclub player](../../tvp/app/). It puts the
**first ~10 seconds of every stream** in an R2 bucket at Cloudflare's edge,
so channel-flipping fills the player's first-seconds cache in ~50ms instead
of paying archive.org's first-byte latency (measured 0.4–3.6s). Everything
beyond the opening seconds always streams from archive.org — the mirror
never holds whole films.

Fits comfortably in R2's free tier:

| | This corpus (1,872 programs) | R2 free tier |
|---|---|---|
| Storage | ~2.2 GB of prefixes | 10 GB |
| Uploads (Class A ops) | ~1,900 per full sync | 1M / month |
| Reads (Class B ops) | 1 per prefix warm | 10M / month |
| Egress | free | free |

## How it fits together

```
viewer flips channel
   │
   ▼
service worker first-seconds cache ── hit ──▶ instant start,
   │  miss (warming happens here)             rest streams from
   ▼                                          archive.org datanode
R2 prefix mirror (edge, ~50ms) ── miss ──▶ archive.org/cors/ fallback
```

The player already knows the contract: prefetch orders carry the canonical
archive.org URL as the cache key, the mirror URL as the fetch target, and
the stream's true byte size from the lineup (a prefix object's own
`Content-Length` is deliberately never trusted as the full-file size). If
the mirror 404s or errors, the service worker silently falls back to
`archive.org/cors/`, so a stale or half-synced bucket can never break
playback.

## Setup (once, ~10 minutes)

1. **Create the bucket.** Cloudflare dashboard → R2 → *Create bucket* →
   name it `tvp-prefix` (any name works; export `R2_BUCKET` if you pick
   another). Location: automatic.

2. **Make it publicly readable.** Bucket → *Settings* → *Public access*.
   The quick route is enabling the `r2.dev` development URL (fine for
   personal use, lightly rate-limited); the robust route is *Custom
   Domains* → connect a hostname on a zone you have on Cloudflare (this
   also puts Cloudflare's normal edge cache in front of the bucket, which
   the `r2.dev` URL does not). Note the resulting base URL, e.g.
   `https://pub-xxxxxxxx.r2.dev` or `https://tvp-prefix.example.com`.

3. **Allow cross-origin reads.** Bucket → *Settings* → *CORS policy*:

   ```json
   [
     {
       "AllowedOrigins": ["https://danbri.github.io"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["Range"],
       "ExposeHeaders": ["x-amz-meta-total"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

   (Add `http://localhost:8471` etc. to `AllowedOrigins` if you test
   locally. `ExposeHeaders` matters: each object carries the stream's
   full byte size as metadata, and the cold-start race below only trusts
   a mirror response that can prove that size.)

4. **Create an API token for the sync script.** R2 → *Manage R2 API
   tokens* → *Create API token* → permission **Object Read & Write**,
   scoped to this one bucket. Keep the three values it shows you:

   ```sh
   export R2_ACCOUNT_ID=…        # dashboard → R2 (top right of the page)
   export R2_ACCESS_KEY_ID=…
   export R2_SECRET_ACCESS_KEY=…
   # export R2_BUCKET=tvp-prefix # only if you chose a different name
   ```

## Sync

```sh
node docs/cloudflare/sync-prefixes.mjs --dry-run   # preview: count + MB, no credentials needed
node docs/cloudflare/sync-prefixes.mjs             # the real thing
```

The script walks `tvp/app/js/channels.js`, and for each program fetches
the opening bytes straight from the item's archive.org datanode (sized
from the stream's real bitrate: 10 seconds + a little headroom, capped at
2MB) and `PUT`s them to R2 with SigV4 — no SDK, no wrangler, no
dependencies. Node 20+ is all it needs.

It is **idempotent and resumable**: each object is `HEAD`ed first and
skipped if its size already matches, so re-running after a harvest only
uploads what changed. Useful knobs: `--limit 25` (try a small batch
first), `--channel picture-palace` (one channel), `--concurrency 6`,
`--force` (re-upload everything).

Expect a full first sync to take on the order of an hour (it is polite to
archive.org; ~3GB trickles through your machine). Re-runs after a typical
harvest take a minute or two.

## Point the player at it

On any device, open the player, then in the browser console:

```js
localStorage.setItem('tvp.mirrorPrefix', JSON.stringify('https://pub-xxxxxxxx.r2.dev/'))
```

…and reload (the trailing slash matters). To go back: `localStorage.removeItem('tvp.mirrorPrefix')`.

Verify it's working: DevTools → Network, flip a channel or two, and watch
prefix warms hit your bucket's hostname (fast, small) while the `<video>`
element itself streams from `*.us.archive.org`.

## The cold-start race

With a mirror configured the player does more than warm its cache from
it. When a stream nobody prefetched starts playing — the worst case, one
datanode's first byte away from picture — the service worker **races**
the datanode against the mirror for the opening bytes and plays whichever
answers first. A winning mirror response streams through immediately
(and is banked for next time); a winning datanode means the mirror fetch
is simply dropped. Losing lanes are aborted, so nothing is downloaded
twice. This is why the sync script stamps `x-amz-meta-total` on every
object: a synthesized partial response must state the file's true size,
and a mirror object that can't prove it forfeits the race rather than
risk corrupting the player's idea of a film's duration.

## Notes

- **This never changes what plays** — only where the *opening
  seconds* come from. Playback, seeking, and everything past ~10s always
  come from archive.org, and the player works exactly as before if the
  bucket is missing, empty, or stale.
- Objects uploaded by an earlier version of the sync script (before
  `x-amz-meta-total`) still warm the cache fine but sit out the race;
  one `--force` re-sync upgrades them.
- The prefix size formula in the script mirrors `prefixCap()` in
  `tvp/app/js/app.js` — if one changes, change the other.
- Removed programs leave orphan objects behind (a few MB); add an R2
  lifecycle rule or delete by hand if that bothers you.
- There is also a separate, older knob for a **full-file** mirror
  (`tvp.mirror`) if you ever host complete streams somewhere — that one
  replaces the playback URLs themselves and is *not* free-tier material
  (~42GB and growing).
