#!/usr/bin/env node
/*
 * TVP/2007 lineup enricher.
 *
 * Back-fills two per-program fields into ../app/js/channels.js using one
 * archive.org metadata call per item:
 *
 *   frame — an indicative mid-film thumbnail (from the item's .thumbs/
 *           folder) shown instantly while zapping ("skim card")
 *   subs  — a subtitle file (.srt/.vtt; archive.org's auto-generated
 *           .asr.srt included), fetched at runtime via archive.org/cors/
 *
 * Safe to re-run; existing fields are refreshed. Run after curate.mjs.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "js", "channels.js");
const src = readFileSync(FILE, "utf8");
const tmp = join(tmpdir(), "tvp-channels-" + process.pid + ".mjs");
writeFileSync(tmp, src + "\nexport {CHANNELS, EPG_CATEGORIES};");
const { CHANNELS, EPG_CATEGORIES } = await import(pathToFileURL(tmp).href);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CACHE = join(dirname(fileURLToPath(import.meta.url)), ".cache", "meta");
async function meta(id, tries = 3) {
  // reuse the harvester's on-disk metadata cache when present
  try {
    const f = join(CACHE, encodeURIComponent(id) + ".json");
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {}
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`https://archive.org/metadata/${id}`, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
    } catch {}
    await sleep(800 * (i + 1));
  }
  return null;
}

const enc = (n) => n.split("/").map(encodeURIComponent).join("/");

/* ── codec sniffing ──
 * archive.org's `format` field names the CONTAINER for original uploads
 * ("MPEG4" = .mp4 file, codec unknown) and is only codec-truthful for
 * derivatives ("h.264", "512Kb MPEG4"). Cast hardware cares about the
 * codec, so for ambiguous files we range-fetch a slice and scan the mp4
 * sample description for codec boxes: avcC/avc1 (h.264, castable),
 * hvcC (HEVC, not safe on older Cast), mp4v/xvid/divx (Part 2, no).
 * Results cache per URL — each file is ever probed once. */
const CODEC_FILE = join(dirname(fileURLToPath(import.meta.url)), ".cache", "codec.json");
let codecCache = {};
try { codecCache = JSON.parse(readFileSync(CODEC_FILE, "utf8")); } catch {}
let probes = 0;
function scanCodec(buf) {
  const s = buf.toString("latin1");
  if (s.includes("avcC") || s.includes("avc1") || s.includes("avc3")) return "h264";
  if (s.includes("hvcC") || s.includes("hev1") || s.includes("hvc1")) return "hevc";
  if (s.includes("mp4v") || /xvid|divx|DX50/i.test(s)) return "mp4v";
  return null;
}
async function sniffCodec(url, size) {
  if (url in codecCache) return codecCache[url];
  let out = "unknown";
  try {
    // head slice first (faststart files put moov up front)…
    let r = await fetch(url, { headers: { Range: "bytes=0-65535" }, signal: AbortSignal.timeout(30000) });
    let found = r.ok ? scanCodec(Buffer.from(await r.arrayBuffer())) : null;
    // …originals usually keep moov at the tail
    if (!found && size > 300000) {
      r = await fetch(url, { headers: { Range: `bytes=${size - 262144}-${size - 1}` }, signal: AbortSignal.timeout(30000) });
      if (r.ok) found = scanCodec(Buffer.from(await r.arrayBuffer()));
    }
    if (found) out = found;
  } catch {}
  codecCache[url] = out;
  if (++probes % 20 === 0) writeFileSync(CODEC_FILE, JSON.stringify(codecCache));
  await sleep(150);
  return out;
}

let frames = 0, subs = 0, misses = 0, n = 0;
const total = CHANNELS.reduce((s, c) => s + c.programs.length, 0);

for (const ch of CHANNELS) {
  for (const p of ch.programs) {
    n++;
    const m = (p.src || "").match(/archive\.org\/download\/([^/]+)\//);
    if (!m) continue;
    const id = m[1];
    const j = await meta(id);
    if (!j?.files) { misses++; continue; }

    // indicative frame: a thumb ~40% through the film
    const thumbs = j.files.filter((f) => /\.thumbs\/.*\.jpe?g$/i.test(f.name))
      .map((f) => f.name).sort();
    if (thumbs.length) {
      const pick = thumbs[Math.min(thumbs.length - 1, Math.floor(thumbs.length * 0.4))];
      p.frame = `https://archive.org/download/${id}/${enc(pick)}`;
      frames++;
    }

    // subtitles: prefer a human .srt/.vtt over the auto-generated .asr.srt
    const subFiles = j.files.filter((f) => /\.(srt|vtt)$/i.test(f.name)).map((f) => f.name);
    const best = subFiles.find((f) => !/\.asr\./i.test(f)) || subFiles[0];
    if (best) { p.subs = best; subs++; }

    // stream size: lets the player compute exact bytes-per-second for
    // right-sized first-seconds prefetching
    const srcName = decodeURIComponent((p.src.split(`/download/${id}/`)[1] || ""));
    const f = j.files.find((f) => f.name === srcName);
    if (f?.size) p.bytes = parseInt(f.size, 10);

    // datanode: archive.org /download/ 302-redirects every request to a
    // datanode, and browsers don't cache 302s — so each cold tune and each
    // mid-file range request re-pays ~1s of frontend latency. The metadata
    // API names the node; the player composes a direct URL and falls back
    // to /download/ if the item has since migrated.
    if (j.server && j.dir) p.node = j.server + j.dir;

    // Chromecast-safe encode: many archive derivatives are MPEG-4 Part 2
    // (the DivX-era codec), which Cast hardware cannot decode — the TV
    // plays audio over black. When the on-air file isn't h.264, bake the
    // item's h.264 derivative for casting (castSrc: url), or an explicit
    // "no compatible encode" marker (castSrc: 0) so the player can warn.
    // Ambiguous "MPEG4"-labelled files (originals: container name, codec
    // unknown) get their codec sniffed — Blender-era originals are h.264
    // inside and would otherwise be misfiled as uncastable.
    // (NB "cast" is taken — that's the actors list from wikilink.mjs.)
    if (f) {
      let onAirCastable = /h\.?264/i.test(f.format || "");
      if (!onAirCastable && /\.mp4$/i.test(f.name)) {
        onAirCastable = (await sniffCodec(p.src, parseInt(f.size, 10) || 0)) === "h264";
      }
      if (onAirCastable) {
        delete p.castSrc;
      } else {
        let alt = j.files.find((x) => /h\.?264/i.test(x.format || "") && /\.mp4$/i.test(x.name));
        if (!alt) {
          // probe the other ambiguous mp4s before giving up on the item
          for (const x of j.files.filter((x) => /\.mp4$/i.test(x.name) && x.name !== f.name && !/h\.?264/i.test(x.format || "")).slice(0, 2)) {
            const u = `https://archive.org/download/${id}/${enc(x.name)}`;
            if ((await sniffCodec(u, parseInt(x.size, 10) || 0)) === "h264") { alt = x; break; }
          }
        }
        p.castSrc = alt ? `https://archive.org/download/${id}/${enc(alt.name)}` : 0;
      }
    } else {
      delete p.castSrc;
    }
    // second replica (~5% of items carry one): the player's error ladder
    // falls back node → node2 → /download/ when a datanode goes stale
    if (j.d2 && j.dir && j.d2 !== j.server) p.node2 = j.d2 + j.dir;

    if (n % 25 === 0) console.log(`  ${n}/${total} … frames=${frames} subs=${subs}`);
  }
}

try { writeFileSync(CODEC_FILE, JSON.stringify(codecCache)); } catch {}
console.log(`enriched ${total} programs: ${frames} frames, ${subs} subtitle tracks, ${misses} metadata misses, ${probes} codec probes`);

const banner = src.slice(0, src.indexOf("const CHANNELS"));
const body = banner +
  "const CHANNELS = " + JSON.stringify(CHANNELS, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* EPG category rail — the dial's 2007-flavoured category vocabulary */" +
  "\nconst EPG_CATEGORIES = " + JSON.stringify(EPG_CATEGORIES, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* Broadcast epoch: 16 Jan 2007 — the moment this dial's clock started ticking. */" +
  "\nconst BROADCAST_EPOCH = Date.UTC(2007, 0, 16, 0, 0, 0);\n";
writeFileSync(FILE, body);
console.log("wrote " + FILE);
