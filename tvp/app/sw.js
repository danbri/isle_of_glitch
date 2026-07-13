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
    e.waitUntil(storeBackend.remove(e.data.key));
  }
});

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
      await storeBackend.prune();
    } catch {}
  }
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
    const hit = await storeBackend.match(req.url);
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
