#!/usr/bin/env node
/*
 * TVP/2007 — R2 prefix-mirror sync.
 *
 * Uploads the first ~10 seconds of every stream on the dial to a
 * Cloudflare R2 bucket, so the player's service worker can fill its
 * first-seconds cache from a ~50ms global edge instead of archive.org
 * (~0.4–3.6s first byte). Playback beyond the prefix always comes from
 * archive.org — the mirror never carries whole films.
 *
 * Zero dependencies (Node 20+): SigV4 signing is done here with
 * node:crypto against R2's S3-compatible endpoint.
 *
 * Setup and full instructions: README.md next to this file.
 *
 * Env:
 *   R2_ACCOUNT_ID         Cloudflare account id (dashboard → R2)
 *   R2_ACCESS_KEY_ID      R2 API token key id
 *   R2_SECRET_ACCESS_KEY  R2 API token secret
 *   R2_BUCKET             bucket name (default: tvp-prefix)
 *
 * Usage:
 *   node sync-prefixes.mjs [--dry-run] [--limit N] [--channel id]
 *                          [--concurrency 6] [--force]
 *
 * Safe to re-run after every harvest: objects whose size already matches
 * are skipped (one cheap HEAD each), so an unchanged lineup costs zero
 * uploads. Removed programs are NOT deleted from the bucket — prune by
 * hand or with a lifecycle rule if you care about the few spare MB.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, createHmac } from "node:crypto";

/* ── config ── */

const ACCOUNT = process.env.R2_ACCOUNT_ID;
const KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET || "tvp-prefix";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DRY = flag("--dry-run");
const FORCE = flag("--force");
const LIMIT = parseInt(opt("--limit", "0"), 10) || Infinity;
const ONLY_CH = opt("--channel", "");
const CONCURRENCY = Math.max(1, parseInt(opt("--concurrency", "6"), 10) || 6);

if (!DRY && (!ACCOUNT || !KEY_ID || !SECRET)) {
  console.error("Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY (see README.md). Use --dry-run to preview without credentials.");
  process.exit(1);
}

/* ── load the lineup (same import trick as tvp/tools/) ── */

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, "..", "..", "tvp", "app", "js", "channels.js"), "utf8");
const tmp = join(tmpdir(), "tvp-r2sync-" + process.pid + ".mjs");
writeFileSync(tmp, src + "\nexport {CHANNELS};");
const { CHANNELS } = await import(pathToFileURL(tmp).href);

/* ── the prefix contract ──
 * Mirror objects hold the first PREFIX_SECONDS of each stream, sized from
 * the stream's real bitrate — the DESKTOP tier (10s), the larger of the
 * player's two tiers, so one object serves both (phones stream-read 5s
 * worth and hang up). Must stay in step with prefixCap() in
 * tvp/app/js/app.js. */
const PREFIX_SECONDS = 10;
function prefixCap(p) {
  if (p.bytes && p.dur) {
    return Math.min(2 * 1024 * 1024, Math.ceil((p.bytes / p.dur) * PREFIX_SECONDS) + 128 * 1024);
  }
  return 1.5 * 1024 * 1024;
}

/* ── SigV4 against R2's S3 endpoint ── */

const HOST = `${ACCOUNT}.r2.cloudflarestorage.com`;
const sha256hex = (s) => createHash("sha256").update(s).digest("hex");
const hmac = (k, s) => createHmac("sha256", k).update(s).digest();
const encSeg = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const encKey = (key) => key.split("/").map(encSeg).join("/");

/* `amz` holds extra x-amz-* headers (they MUST be signed per SigV4 —
 * e.g. x-amz-meta-total, the full-file size the player's service worker
 * reads to synthesize Content-Range when racing the mirror against a
 * datanode). `unsigned` holds ordinary headers (Content-Type etc.),
 * which S3 permits outside the signature. */
function signedHeaders(method, key, unsigned = {}, amz = {}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const date = amzDate.slice(0, 8);
  const uri = `/${BUCKET}/${encKey(key)}`;
  const payload = "UNSIGNED-PAYLOAD";
  const toSign = {
    host: HOST,
    "x-amz-content-sha256": payload,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(amz).map(([k, v]) => [k.toLowerCase(), String(v).trim()]))
  };
  const names = Object.keys(toSign).sort();
  const canonicalHeaders = names.map((n) => `${n}:${toSign[n]}\n`).join("");
  const signedList = names.join(";");
  const canonicalRequest = [method, uri, "", canonicalHeaders, signedList, payload].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  let k = hmac("AWS4" + SECRET, date);
  k = hmac(k, "auto"); k = hmac(k, "s3"); k = hmac(k, "aws4_request");
  const signature = createHmac("sha256", k).update(stringToSign).digest("hex");
  const { host, ...requestHeaders } = toSign;
  return {
    ...unsigned,
    ...requestHeaders,
    "Authorization": `AWS4-HMAC-SHA256 Credential=${KEY_ID}/${scope}, SignedHeaders=${signedList}, Signature=${signature}`
  };
}

const r2url = (key) => `https://${HOST}/${BUCKET}/${encKey(key)}`;

async function r2head(key) {
  const r = await fetch(r2url(key), { method: "HEAD", headers: signedHeaders("HEAD", key) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HEAD ${key}: ${r.status}`);
  return parseInt(r.headers.get("content-length") || "0", 10);
}

async function r2put(key, body, totalBytes) {
  const amz = totalBytes ? { "x-amz-meta-total": totalBytes } : {};
  const r = await fetch(r2url(key), {
    method: "PUT",
    headers: signedHeaders("PUT", key, {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=604800"
    }, amz),
    body
  });
  if (!r.ok) throw new Error(`PUT ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/* ── fetch a stream's opening bytes (datanode first, front door second) ── */

async function fetchPrefix(p, suffix, cap) {
  const urls = [];
  if (p.node) urls.push(`https://${p.node}/${suffix}`);
  urls.push(`https://archive.org/download/${suffix}`);
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        headers: { Range: `bytes=0-${cap - 1}` },
        signal: AbortSignal.timeout(60000),
        redirect: "follow"
      });
      if (r.status !== 206 && r.status !== 200) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.subarray(0, cap);
    } catch {}
  }
  return null;
}

/* ── the sweep ── */

const jobs = [];
for (const ch of CHANNELS) {
  if (ONLY_CH && ch.id !== ONLY_CH) continue;
  for (const p of ch.programs) {
    const m = (p.src || "").match(/^https:\/\/archive\.org\/download\/(.+)$/);
    if (!m) continue;                      // non-archive sources stay unmirrored
    const suffix = m[1];
    const key = suffix.split("/").map(decodeURIComponent).join("/");
    const cap = prefixCap(p);
    const expect = p.bytes ? Math.min(cap, p.bytes) : cap;
    jobs.push({ ch: ch.id, p, suffix, key, cap, expect });
  }
}
const seen = new Set();
const queue = jobs.filter((j) => !seen.has(j.key) && seen.add(j.key)).slice(0, LIMIT);

const totalMB = queue.reduce((s, j) => s + j.expect, 0) / 1048576;
console.log(`${queue.length} prefix objects, ~${totalMB.toFixed(0)}MB total${DRY ? " (dry run)" : ""}`);

let done = 0, uploaded = 0, skipped = 0, failed = 0, sentBytes = 0;
async function worker() {
  for (;;) {
    const j = queue.shift();
    if (!j) return;
    try {
      if (DRY) {
        console.log(`  would sync ${j.key} (${(j.expect / 1024).toFixed(0)}KB)`);
        skipped++;
      } else {
        const have = FORCE ? null : await r2head(j.key);
        if (have !== null && Math.abs(have - j.expect) < 4096) { skipped++; }
        else {
          const buf = await fetchPrefix(j.p, j.suffix, j.cap);
          if (!buf || !buf.length) throw new Error("no bytes from archive.org");
          await r2put(j.key, buf, j.p.bytes || 0);
          uploaded++; sentBytes += buf.length;
        }
      }
    } catch (e) {
      failed++;
      console.error(`  ✗ ${j.key}: ${e.message}`);
    }
    if (++done % 50 === 0) console.log(`  ${done}/${done + queue.length} … up=${uploaded} skip=${skipped} fail=${failed}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`done: ${uploaded} uploaded (${(sentBytes / 1048576).toFixed(1)}MB), ${skipped} already current, ${failed} failed`);
if (failed) process.exitCode = 2;
