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

/* ── storage backend ───────────────────────────────────────────────
 * Prefixes live in the Origin Private File System when the browser can
 * write it from a service worker (Chrome/Edge/Firefox) — OPFS is "site
 * data", which tends to outlive "clear cached data" flows and reboots,
 * especially once navigator.storage.persist() is granted (the page
 * requests that at power-on). Safari can't write OPFS from a SW, so it
 * falls back to the Cache API transparently. Reads check both, so a
 * browser upgrade migrates gracefully.
 */

let opfsDir = null;   // dir handle, or false when unusable
async function opfs() {
  if (opfsDir !== null) return opfsDir;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("tvp-prefix", { create: true });
    const probe = await dir.getFileHandle(".probe", { create: true });
    const w = await probe.createWritable();   // throws on Safari
    await w.close();
    opfsDir = dir;
  } catch { opfsDir = false; }
  return opfsDir;
}

async function keyHash(key) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/* The player may request media straight from a datanode
 * (https://dn123456.us.archive.org/0/items/{id}/{file}) to skip the
 * /download/ 302; the cache is keyed by the canonical /download/ URL,
 * so normalize before any lookup. */
const canon = (u) => u.replace(/^https:\/\/[a-z]+\d+\.us\.archive\.org\/\d+\/items\//, "https://archive.org/download/");

/* In-memory index of cached keys: lets the fetch handler answer misses
 * (the overwhelmingly common case) without touching OPFS or the Cache
 * API at all. Rebuilt lazily per SW lifetime; kept in sync by put/remove;
 * dropped wholesale after prune/nuke. */
let knownKeysPromise = null;
function knownKeys() {
  if (!knownKeysPromise) knownKeysPromise = (async () => {
    const keys = new Set();
    try {
      const dir = await opfs();
      if (dir) {
        for await (const [name, handle] of dir.entries()) {
          if (!name.endsWith(".json") || name === ".probe") continue;
          try { keys.add(JSON.parse(await (await handle.getFile()).text()).key); } catch {}
        }
      }
    } catch {}
    try { for (const r of await (await caches.open(CACHE)).keys()) keys.add(r.url); } catch {}
    return keys;
  })();
  return knownKeysPromise;
}

/* tiny hot-buffer memo so scrubbing a cached prefix doesn't re-read the
 * whole ~1.5MB from OPFS on every seek */
const bufMemo = new Map();
function memoPut(key, hit) {
  bufMemo.set(key, hit);
  if (bufMemo.size > 4) bufMemo.delete(bufMemo.keys().next().value);
}

const storeBackend = {
  async put(key, buf, meta) {
    const dir = await opfs();
    if (dir) {
      const h = await keyHash(key);
      const bw = await (await dir.getFileHandle(h + ".bin", { create: true })).createWritable();
      await bw.write(buf); await bw.close();
      const mw = await (await dir.getFileHandle(h + ".json", { create: true })).createWritable();
      await mw.write(JSON.stringify({ key, ...meta })); await mw.close();
      return;
    }
    const cache = await caches.open(CACHE);
    await cache.put(key, new Response(buf, {
      headers: {
        "content-type": meta.type || "video/mp4",
        "x-tvp-total": String(meta.total),
        "x-tvp-at": String(meta.at)
      }
    }));
  },

  async match(key) {
    const dir = await opfs();
    if (dir) {
      try {
        const h = await keyHash(key);
        const mf = await (await dir.getFileHandle(h + ".json")).getFile();
        const meta = JSON.parse(await mf.text());
        const bf = await (await dir.getFileHandle(h + ".bin")).getFile();
        return { buf: await bf.arrayBuffer(), total: meta.total, type: meta.type };
      } catch {}
    }
    const hit = await (await caches.open(CACHE)).match(key);
    if (!hit) return null;
    const buf = await hit.arrayBuffer();
    return {
      buf,
      total: parseInt(hit.headers.get("x-tvp-total") || String(buf.byteLength), 10),
      type: hit.headers.get("content-type")
    };
  },

  async has(key) {
    const dir = await opfs();
    if (dir) {
      try { await dir.getFileHandle((await keyHash(key)) + ".json"); return true; } catch {}
    }
    return !!(await (await caches.open(CACHE)).match(key));
  },

  async remove(key) {
    const dir = await opfs();
    if (dir) {
      const h = await keyHash(key);
      try { await dir.removeEntry(h + ".json"); } catch {}
      try { await dir.removeEntry(h + ".bin"); } catch {}
    }
    try { await (await caches.open(CACHE)).delete(key); } catch {}
  },

  async prune() {
    const dir = await opfs();
    if (dir) {
      const metas = [];
      for await (const [name, handle] of dir.entries()) {
        if (!name.endsWith(".json") || name === ".probe") continue;
        try { metas.push([name, JSON.parse(await (await handle.getFile()).text())]); } catch {}
      }
      if (metas.length <= MAX_ENTRIES) return;
      metas.sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
      for (const [name] of metas.slice(0, metas.length - MAX_ENTRIES)) {
        const h = name.replace(/\.json$/, "");
        try { await dir.removeEntry(h + ".json"); } catch {}
        try { await dir.removeEntry(h + ".bin"); } catch {}
      }
      return;
    }
    const cache = await caches.open(CACHE);
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
};

/* ── prefetch protocol: page posts {type:'prefetch', urls:[{key,via}|string]} ── */

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "prefetch" && Array.isArray(e.data.urls)) {
    e.waitUntil(prefetchAll(e.data.urls));
  }
  if (e.data && e.data.type === "evict" && e.data.key) {
    const key = canon(e.data.key);
    bufMemo.delete(key);
    e.waitUntil((async () => {
      await storeBackend.remove(key);
      try { (await knownKeys()).delete(key); } catch {}
    })());
  }
  if (e.data && e.data.type === "nuke") {
    bufMemo.clear();
    knownKeysPromise = null;
    e.waitUntil((async () => {
      try { await caches.delete(CACHE); } catch {}
      try { await caches.delete(ART_CACHE); } catch {}
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry("tvp-prefix", { recursive: true });
      } catch {}
    })());
  }
});

/* ── icon/art cache: cache-first for archive.org imagery ──
 * Only CORS-capable responses are stored (the /cors/ endpoints), so
 * entries carry their real few-KB size — never opaque-response quota
 * padding. Anything else passes through untouched. */

const ART_CACHE = "tvp-art-v1";
const ART_MAX = 250;

async function serveArt(req) {
  const cache = await caches.open(ART_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const r = await fetch(req.url, { mode: "cors", signal: AbortSignal.timeout(20000) });
    if (r.ok && r.type !== "opaque") {
      await cache.put(req.url, r.clone());
      cache.keys().then(async (keys) => {          // fire-and-forget LRU-ish trim
        if (keys.length > ART_MAX) for (const k of keys.slice(0, keys.length - ART_MAX)) await cache.delete(k);
      });
      return r;
    }
  } catch {}
  return fetch(req);
}

async function prefetchAll(entries) {
  for (const entry of entries.slice(0, 8)) {
    const key = typeof entry === "string" ? entry : entry.key;
    const via = typeof entry === "string" ? entry : (entry.via || entry.key);
    const cap = (typeof entry === "object" && entry.cap) ? entry.cap : PREFIX_BYTES;
    try {
      if (await storeBackend.has(key)) continue;
      const r = await fetch(via, {
        headers: { Range: `bytes=0-${cap - 1}` },
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
        while (got < cap) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          got += value.byteLength;
        }
        try { await reader.cancel(); } catch {}
        const joined = new Uint8Array(Math.min(got, cap));
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

      await storeBackend.put(key, buf, {
        type: r.headers.get("content-type") || "video/mp4",
        total,
        at: Date.now()
      });
      (await knownKeys()).add(key);
      await storeBackend.prune();
      knownKeysPromise = null;   // prune may have dropped entries — relist lazily
    } catch {}
  }
}

/* ── serve cached prefixes for in-range requests ── */

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.destination === "image" && /archive\.org\/cors\//.test(req.url)) {
    e.respondWith(serveArt(req));
    return;
  }
  const range = req.headers.get("range");
  const m = range && range.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return;                       // no/odd Range → let the network handle it
  e.respondWith(serveRange(req, parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : null));
});

async function serveRange(req, start, endWanted) {
  try {
    const key = canon(req.url);
    if (!(await knownKeys()).has(key)) return fetch(req);   // cheap miss: no storage I/O
    let hit = bufMemo.get(key);
    if (!hit) {
      hit = await storeBackend.match(key);
      if (hit) memoPut(key, hit);
    }
    if (hit) {
      const { buf, total } = hit;
      const cachedEnd = buf.byteLength - 1;
      if (start <= cachedEnd) {
        const end = Math.min(endWanted ?? cachedEnd, cachedEnd);
        if (end >= start) {
          return new Response(buf.slice(start, end + 1), {
            status: 206,
            headers: {
              "content-type": hit.type || "video/mp4",
              "content-range": `bytes ${start}-${end}/${total || buf.byteLength}`,
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
