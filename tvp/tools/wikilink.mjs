#!/usr/bin/env node
/*
 * TVP/2007 provenance linker.
 *
 * For every program in ../app/js/channels.js, tries to identify the film
 * on Wikidata (title + year match against film-typed items) and back-fills:
 *
 *   wd    — Wikidata QID (e.g. "Q152423")
 *   wp    — English Wikipedia URL, when the item has a sitelink
 *   dir   — director name(s)            (P57, up to 2)
 *   cast  — leading cast names          (P161, up to 3)
 *   co    — production company name(s)  (P272, up to 2)
 *
 * The point is provenance you can check: a film with a Wikipedia article
 * and a Wikidata identity is easy to vet for rights history, disputes,
 * and context — and the entity links its people, companies, locations
 * and topics onward. Run after curate.mjs + enrich.mjs.
 *
 * Polite to Wikidata: sequential, ~7 req/s max, custom User-Agent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "js", "channels.js");
const src = readFileSync(FILE, "utf8");
const tmp = join(tmpdir(), "tvp-wl-" + process.pid + ".mjs");
writeFileSync(tmp, src + "\nexport {CHANNELS, EPG_CATEGORIES};");
const { CHANNELS, EPG_CATEGORIES } = await import(pathToFileURL(tmp).href);

const UA = "TVP2007-revival/1.0 (https://github.com/danbri/isle_of_glitch; contact via repo issues)";
const WD = "https://www.wikidata.org/w/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, tries = 3) {
  const url = WD + "?" + new URLSearchParams({ format: "json", ...params });
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.json();
    } catch {}
    await sleep(1200 * (i + 1));
  }
  return null;
}

/* film-ish P31 values: film, silent film, short film, animated film,
   feature film, television film, documentary film, film serial */
const FILMISH = new Set(["Q11424", "Q226730", "Q24862", "Q202866", "Q24869", "Q506240", "Q93204", "Q336144"]);

const cleanForSearch = (t) => String(t)
  .replace(/charlie chaplin'?s?/i, "").replace(/["“”]/g, "")
  .replace(/\baka\b.*$/i, "").replace(/[([].*?[)\]]/g, "")
  .replace(/\s+/g, " ").trim();

function claimIds(entity, prop, max) {
  return (entity.claims?.[prop] || [])
    .map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0, max);
}
function pubYears(entity) {
  return (entity.claims?.P577 || [])
    .map((c) => parseInt(String(c.mainsnak?.datavalue?.value?.time || "").slice(1, 5), 10))
    .filter(Boolean);
}

const labelWanted = new Set();
let matched = 0, withWp = 0, n = 0;
const progs = CHANNELS.flatMap((c) => c.programs);

for (const p of progs) {
  n++;
  if (!p.year || p.wd) continue;
  const q = cleanForSearch(p.title);
  if (q.length < 3) continue;
  const s = await api({ action: "wbsearchentities", search: q, language: "en", type: "item", limit: 7 });
  const ids = (s?.search || []).map((e) => e.id);
  if (!ids.length) { await sleep(120); continue; }
  const g = await api({
    action: "wbgetentities", ids: ids.join("|"),
    props: "claims|sitelinks", sitefilter: "enwiki"
  });
  if (g?.entities) {
    for (const id of ids) {
      const e = g.entities[id];
      if (!e) continue;
      const p31 = claimIds(e, "P31", 8);
      if (!p31.some((v) => FILMISH.has(v))) continue;
      const years = pubYears(e);
      if (!years.some((y) => Math.abs(y - p.year) <= 1)) continue;
      p.wd = id;
      matched++;
      const title = e.sitelinks?.enwiki?.title;
      if (title) { p.wp = "https://en.wikipedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_")); withWp++; }
      p._dirIds = claimIds(e, "P57", 2);
      p._castIds = claimIds(e, "P161", 3);
      p._coIds = claimIds(e, "P272", 2);
      [...p._dirIds, ...p._castIds, ...p._coIds].forEach((x) => labelWanted.add(x));
      break;
    }
  }
  if (n % 50 === 0) console.log(`  ${n}/${progs.length} … matched=${matched} wp=${withWp}`);
  await sleep(140);
}

/* resolve people/company labels in batches of 50 */
const labels = {};
const ids = [...labelWanted];
for (let i = 0; i < ids.length; i += 50) {
  const g = await api({ action: "wbgetentities", ids: ids.slice(i, i + 50).join("|"), props: "labels", languages: "en" });
  Object.entries(g?.entities || {}).forEach(([id, e]) => {
    const l = e.labels?.en?.value;
    if (l) labels[id] = l;
  });
  await sleep(200);
}
for (const p of progs) {
  const name = (arr) => (arr || []).map((id) => labels[id]).filter(Boolean);
  const dir = name(p._dirIds), cast = name(p._castIds), co = name(p._coIds);
  if (dir.length) p.dir = dir;
  if (cast.length) p.cast = cast;
  if (co.length) p.co = co;
  delete p._dirIds; delete p._castIds; delete p._coIds;
}

console.log(`wikilinked ${matched}/${progs.length} programs (${withWp} with Wikipedia articles, ${ids.length} people/companies labelled)`);

const banner = src.slice(0, src.indexOf("const CHANNELS"));
const body = banner +
  "const CHANNELS = " + JSON.stringify(CHANNELS, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* EPG category rail — vocabulary from the 2007 client's catalog */" +
  "\nconst EPG_CATEGORIES = " + JSON.stringify(EPG_CATEGORIES, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* Broadcast epoch: 16 Jan 2007, the day The Venice Project became \"Joost\". */" +
  "\nconst BROADCAST_EPOCH = Date.UTC(2007, 0, 16, 0, 0, 0);\n";
writeFileSync(FILE, body);
console.log("wrote " + FILE);
