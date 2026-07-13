/*
 * TVP/2007 service worker — first-seconds cache.
 *
 * Stores the opening ~1.5MB of selected streams (about the first 20-25
 * seconds of a 512kbps derivative). When the player later tunes one of
 * them, the opening Range request is served from cache instantly while
 * the browser fetches the rest from the network — TV-style channel
 * flipping without re-paying archive.org's first-byte latency.
 *
 * archive.org's media nodes don't send CORS headers, so prefetching goes
 * through archive.org/cors/ (which does) — the page passes each target as
 * {key, via}: fetch `via`, cache under `key` (the /download/ URL that the
 * <video> element actually requests). /cors/ ignores Range, so the body
 * is stream-read up to the prefix size and then cancelled — never more
 * than ~1.5MB per prefetch on the wire.
 *
 * Conservative by design:
 *  - only answers Range requests that start inside a cached prefix;
 *    everything else passes straight through to the network
 *  - LRU-capped at 40 entries (~60MB)
 */

"use strict";

const CACHE = "tvp-prefix-v1";
const PREFIX_BYTES = 1.5 * 1024 * 1024;
const MAX_ENTRIES = 40;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

/* ── prefetch protocol: page posts {type:'prefetch', urls:[{key,via}|string]} ── */

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "prefetch" && Array.isArray(e.data.urls)) {
    e.waitUntil(prefetchAll(e.data.urls));
  }
});

async function prefetchAll(entries) {
  const cache = await caches.open(CACHE);
  for (const entry of entries.slice(0, 8)) {
    const key = typeof entry === "string" ? entry : entry.key;
    const via = typeof entry === "string" ? entry : (entry.via || entry.key);
    try {
      if (await cache.match(key)) continue;
      const r = await fetch(via, {
        headers: { Range: `bytes=0-${PREFIX_BYTES - 1}` },
        signal: AbortSignal.timeout(45000)
      });
      if (r.status !== 206 && r.status !== 200) continue;

      let buf, total;
      if (r.status === 206) {
        buf = await r.arrayBuffer();
        const cr = r.headers.get("content-range");
        const m = cr && cr.match(/\/(\d+)\s*$/);
        total = m ? parseInt(m[1], 10) : buf.byteLength;
      } else {
        // 200: the server ignored Range — stream only the prefix, then hang up
        total = parseInt(r.headers.get("content-length") || "0", 10);
        const reader = r.body.getReader();
        const chunks = [];
        let got = 0;
        while (got < PREFIX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          got += value.byteLength;
        }
        try { await reader.cancel(); } catch {}
        const joined = new Uint8Array(Math.min(got, PREFIX_BYTES));
        let at = 0;
        for (const c of chunks) {
          const take = Math.min(c.byteLength, joined.length - at);
          if (take <= 0) break;
          joined.set(c.subarray(0, take), at);
          at += take;
        }
        buf = joined.buffer;
        if (!total) total = buf.byteLength;
      }
      if (!buf.byteLength) continue;

      await cache.put(key, new Response(buf, {
        headers: {
          "content-type": r.headers.get("content-type") || "video/mp4",
          "x-tvp-total": String(total),
          "x-tvp-at": String(Date.now())
        }
      }));
      await pruneLRU(cache);
    } catch {}
  }
}

async function pruneLRU(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const dated = [];
  for (const k of keys) {
    const r = await cache.match(k);
    dated.push([parseInt(r?.headers.get("x-tvp-at") || "0", 10), k]);
  }
  dated.sort((a, b) => a[0] - b[0]);
  for (const [, k] of dated.slice(0, keys.length - MAX_ENTRIES)) await cache.delete(k);
}

/* ── serve cached prefixes for in-range requests ── */

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const range = req.headers.get("range");
  const m = range && range.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return;                       // no/odd Range → let the network handle it
  e.respondWith(serveRange(req, parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : null));
});

async function serveRange(req, start, endWanted) {
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      const total = parseInt(hit.headers.get("x-tvp-total") || String(buf.byteLength), 10);
      const cachedEnd = buf.byteLength - 1;
      if (start <= cachedEnd) {
        const end = Math.min(endWanted ?? cachedEnd, cachedEnd);
        if (end >= start) {
          return new Response(buf.slice(start, end + 1), {
            status: 206,
            headers: {
              "content-type": hit.headers.get("content-type") || "video/mp4",
              "content-range": `bytes ${start}-${end}/${total}`,
              "content-length": String(end - start + 1),
              "accept-ranges": "bytes"
            }
          });
        }
      }
    }
  } catch {}
  return fetch(req);
}
