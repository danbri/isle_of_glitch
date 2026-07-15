#!/usr/bin/env node
/*
 * TVP/2007 — SKOS subject enrichment, via skosdex (https://skosdex.fly.dev).
 *
 * Gives every program on the dial real knowledge-organization identities,
 * mixing GENERAL schemes with DOMAIN-specific ones where they fit:
 *
 *   LCGFT — Library of Congress Genre/Form Terms: THE film/TV genre
 *           vocabulary ("Film noir", "Newsreels", "Zombie films")
 *   LCSH  — LoC Subject Headings: general topical subjects, matched from
 *           each program's dialogue keywords ("Sheriffs", "Atomic bomb")
 *   AAT   — Getty Art & Architecture Thesaurus: cultural/technical
 *           concepts ("silent films", "drive-in theaters")
 *
 * Two passes:
 *  1. channel spec — a curated (label, scheme) list per channel, resolved
 *     against skosdex at build time so concept URIs are FETCHED, never
 *     hand-typed. Misses are reported, not invented.
 *  2. keyword refinement — the corpus's unique dialogue keywords (from
 *     subindex.mjs) are looked up in LCSH/AAT; only labels that match the
 *     term exactly (case/plural-insensitively) are accepted — skosdex's
 *     label fields are tokenized, so post-filtering keeps "money" from
 *     landing on "Money laundering in motion pictures".
 *
 * Writes ../app/js/skos-gen.js. Resumable: lookups cache in .cache/skos/.
 * Run after subindex.mjs.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const DIR = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(DIR, "..", "app", "js", "channels.js"), "utf8");
const tmp = join(tmpdir(), "tvp-skos-" + process.pid + ".mjs");
writeFileSync(tmp, src + "\nexport {CHANNELS};");
const { CHANNELS } = await import(pathToFileURL(tmp).href);

const SOLR = "https://skosdex.fly.dev/solr/skos/select";
const CACHE = join(DIR, ".cache", "skos");
mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* scheme registry: key → { uri prefix used in skosdex, base for reconstruction } */
const SCHEMES = {
  lcgft: { scheme: "http://id.loc.gov/authorities/genreForms", name: "LC Genre/Form" },
  lcsh: { scheme: "http://id.loc.gov/authorities/subjects", name: "LC Subjects" },
  aat: { scheme: "http://vocab.getty.edu/aat/", name: "Getty AAT" }
};

/* ── pass 1 spec: domain concepts per channel (label, scheme[, cond]) ── */
const CHANNEL_CONCEPTS = {
  "animation-station": [["Animated films", "lcgft"], ["Computer animation", "lcsh"], ["Short films", "lcgft"]],
  "open-cinema": [["Animated films", "lcgft"], ["Computer animation", "lcsh"]],
  "cartoon-classics": [["Animated films", "lcgft"], ["animated cartoons", "aat"]],
  "creature-feature": [["Horror films", "lcgft"], ["Monster films", "lcgft"]],
  "atomic-theater": [["Science fiction films", "lcgft"]],
  "shadow-street": [["Film noir", "lcgft"]],
  "screwball-screen": [["Comedy films", "lcgft"], ["Screwball comedy films", "lcgft"]],
  "retro-vault": [["Educational films", "lcgft"], ["Industrial films", "lcgft"], ["Sponsored films", "lcgft"]],
  "newsreel-nine": [["Newsreels", "lcgft"]],
  "tube-classics": [["Television programs", "lcsh"], ["Television series", "lcgft"]],
  "picture-palace": [["Feature films", "lcgft"]],
  "five-cent-cinema": [["Short films", "lcgft"]],
  "western-roundup": [["Western films", "lcgft"]],
  "mystery-playhouse": [["Detective and mystery films", "lcgft"]],
  "drama-matinee": [["Melodramas", "lcgft"], ["Feature films", "lcgft"]],
  "toon-vault": [["Animated films", "lcgft"]],
  "trailer-park": [["Trailers (Motion pictures)", "lcgft"], ["Film trailers", "lcgft"], ["trailers (filmic previews)", "aat"]],
  "moon-tv": [["Space flight to the moon", "lcsh"], ["Documentary films", "lcgft"]]
};
/* era concepts, applied by year */
const SILENT = ["Silent films", "lcgft"];

/* ── skosdex lookup with disk cache ── */
async function solr(params) {
  const key = encodeURIComponent(JSON.stringify(params)).slice(0, 180);
  const f = join(CACHE, key + ".json");
  if (existsSync(f)) { try { return JSON.parse(readFileSync(f, "utf8")); } catch {} }
  const u = new URL(SOLR);
  for (const [k, v] of Object.entries(params)) u.searchParams.append(k, v);
  u.searchParams.set("wt", "json");
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (r.ok) {
        const j = await r.json();
        try { writeFileSync(f, JSON.stringify(j)); } catch {}
        await sleep(120);              // polite
        return j;
      }
    } catch {}
    await sleep(800 * (i + 1));
  }
  return null;
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
function labelMatches(docLabel, term) {
  const a = norm(docLabel), b = norm(term);
  return a === b || a === b + "s" || a + "s" === b;
}

/* find a concept whose label IS the term (not merely contains it) */
async function lookup(term, schemeKeys) {
  const fq = "scheme:(" + schemeKeys.map((k) => `"${SCHEMES[k].scheme}"`).join(" OR ") + ")";
  const j = await solr({ q: `exactLabel:"${term}" OR altLabel:"${term}"`, fq, rows: "10" });
  const docs = j?.response?.docs || [];
  for (const k of schemeKeys) {                       // caller's priority order
    for (const d of docs) {
      if (!(d.scheme || []).some((s) => s === SCHEMES[k].scheme || s.startsWith(SCHEMES[k].scheme))) continue;
      const labels = [...(d.exactLabel || []), ...(d.altLabel || [])];
      const hit = (d.exactLabel || []).find((l) => labelMatches(l, term)) ||
        labels.find((l) => labelMatches(l, term));
      if (hit) {
        const pref = (d.exactLabel || [hit])[0];
        return { uri: d.id, label: pref, scheme: k };
      }
    }
  }
  return null;
}

/* ── resolve the channel spec ── */
console.log("pass 1: resolving channel concept spec against skosdex…");
const resolved = new Map();   // "label|scheme" → concept or null
async function resolveSpec(label, scheme) {
  const key = label + "|" + scheme;
  if (resolved.has(key)) return resolved.get(key);
  const c = await lookup(label, [scheme]);
  resolved.set(key, c);
  if (!c) console.log(`  ✗ no ${scheme} concept for "${label}"`);
  else console.log(`  ✓ ${c.uri}  ${c.label} [${scheme}]`);
  return c;
}
const channelConcepts = {};
for (const [chId, specs] of Object.entries(CHANNEL_CONCEPTS)) {
  channelConcepts[chId] = (await Promise.all(specs.map(([l, s]) => resolveSpec(l, s)))).filter(Boolean);
}
const silentConcept = await resolveSpec(...SILENT);

/* ── pass 2: unique dialogue keywords → LCSH/AAT ──
 * Conversational filler words match over-general concepts ("Work",
 * "Life") and read as noise — subjects should be about the FILM. */
const STOP = new Set([
  "work", "must", "mean", "life", "blame", "time", "know", "right", "good",
  "well", "need", "want", "think", "thing", "things", "people", "look",
  "going", "come", "came", "really", "little", "never", "great", "first",
  "might", "every", "place", "world", "years", "night", "today", "house",
  "tell", "make", "take", "leave", "believe", "matter", "everything",
  "nothing", "something", "everybody", "nobody", "somebody", "morning",
  "minute", "moment", "trouble", "course", "please", "thank", "sorry"
]);
const kwTerms = new Map();    // term → count
for (const ch of CHANNELS) for (const p of ch.programs) {
  (p.kw || []).slice(0, 8).forEach((k) => {
    if (k.length < 5 || /^\d+$/.test(k) || STOP.has(k.toLowerCase())) return;
    kwTerms.set(k, (kwTerms.get(k) || 0) + 1);
  });
}
console.log(`pass 2: ${kwTerms.size} unique dialogue keywords → LCSH/AAT…`);
const kwConcepts = new Map();
let done = 0, found = 0;
for (const term of kwTerms.keys()) {
  const c = await lookup(term, ["lcsh", "aat"]);
  if (c) { kwConcepts.set(term, c); found++; }
  if (++done % 100 === 0) console.log(`  ${done}/${kwTerms.size} … matched=${found}`);
}
console.log(`  keyword concepts: ${found}/${kwTerms.size}`);

/* ── pass 2b: Wikidata genre (P136) + main subject (P921) claims ──
 * The most precise per-film coding available: "vampire film", "haunted
 * house film" etc., straight from each film's own Wikidata identity,
 * then resolved to LCGFT/LCSH/AAT via skosdex. Batched 50/call, cached. */
const WDCACHE = join(DIR, ".cache", "skos-wd.json");
let wdCache = {};
try { wdCache = JSON.parse(readFileSync(WDCACHE, "utf8")); } catch {}
const wdIds = [];
for (const ch of CHANNELS) for (const p of ch.programs) {
  if (p.wd && /^Q\d+$/.test(p.wd) && !(p.wd in wdCache)) wdIds.push(p.wd);
}
async function wdApi(params) {
  const u = new URL("https://www.wikidata.org/w/api.php");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("format", "json");
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": "tvp2007-enrich/1.0 (danbri)" }, signal: AbortSignal.timeout(30000) });
      if (r.ok) { await sleep(150); return await r.json(); }
    } catch {}
    await sleep(1000 * (i + 1));
  }
  return null;
}
/* QLever's Wikidata endpoint answers claims AND labels in one SPARQL
 * round trip per 500 films — the right tool for bulk graph access
 * (wbgetentities stays as the per-batch fallback). */
const QLEVER = "https://qlever.dev/api/wikidata";
async function qleverBatch(qids) {
  const query = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?film ?g ?gLabel WHERE { VALUES ?film { ${qids.map((q) => "wd:" + q).join(" ")} } ?film wdt:P136|wdt:P921 ?g . ?g rdfs:label ?gLabel . FILTER(LANG(?gLabel)="en") }`;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(QLEVER, {
        method: "POST",
        headers: { "Content-Type": "application/sparql-query", Accept: "application/sparql-results+json", "User-Agent": "tvp2007-enrich/1.0 (danbri)" },
        body: query,
        signal: AbortSignal.timeout(90000)
      });
      if (r.ok) { await sleep(250); return (await r.json()).results?.bindings || []; }
    } catch {}
    await sleep(1500 * (i + 1));
  }
  return null;
}
console.log(`pass 2b: Wikidata P136/P921 for ${wdIds.length} uncached films (QLever)…`);
for (let i = 0; i < wdIds.length; i += 500) {
  const batch = wdIds.slice(i, i + 500);
  batch.forEach((q) => { if (!Array.isArray(wdCache[q])) wdCache[q] = []; });
  const rows = await qleverBatch(batch);
  if (rows) {
    for (const b of rows) {
      const film = b.film.value.split("/").pop();
      const g = b.g.value.split("/").pop();
      if (wdCache[film] && !wdCache[film].includes(g)) wdCache[film].push(g);
      wdCache["L" + g] = b.gLabel.value;
    }
  } else {
    console.log("  QLever unavailable — wbgetentities fallback for this batch");
    for (let j2 = 0; j2 < batch.length; j2 += 50) {
      const sub = batch.slice(j2, j2 + 50);
      const j = await wdApi({ action: "wbgetentities", ids: sub.join("|"), props: "claims" });
      for (const q of sub) {
        const cl = j?.entities?.[q]?.claims || {};
        for (const prop of ["P136", "P921"]) {
          (cl[prop] || []).forEach((c) => {
            const id = c.mainsnak?.datavalue?.value?.id;
            if (id && !wdCache[q].includes(id)) wdCache[q].push(id);
          });
        }
      }
    }
  }
  console.log(`  ${Math.min(i + 500, wdIds.length)}/${wdIds.length}`);
}
/* labels for any claim entities still unlabeled (fallback path, old cache) */
const genreQs = [...new Set(Object.entries(wdCache)
  .filter(([k, v]) => !k.startsWith("L") && Array.isArray(v)).flatMap(([, v]) => v))]
  .filter((q) => /^Q\d+$/.test(q) && !(("L" + q) in wdCache));
for (let i = 0; i < genreQs.length; i += 50) {
  const batch = genreQs.slice(i, i + 50);
  const j = await wdApi({ action: "wbgetentities", ids: batch.join("|"), props: "labels", languages: "en" });
  for (const q of batch) wdCache["L" + q] = j?.entities?.[q]?.labels?.en?.value || "";
}
try { writeFileSync(WDCACHE, JSON.stringify(wdCache)); } catch {}
const wdTerms = new Set();
for (const [k, v] of Object.entries(wdCache)) {
  if (!k.startsWith("L") && Array.isArray(v)) v.forEach((q) => { const l = wdCache["L" + q]; if (l) wdTerms.add(l); });
}
console.log(`  ${wdTerms.size} distinct Wikidata genre/subject labels`);
const wdConcepts = new Map();
for (const term of wdTerms) {
  const c = await lookup(term, ["lcgft", "lcsh", "aat"]);
  if (c) wdConcepts.set(term.toLowerCase(), c);
}
console.log(`  resolved to concepts: ${wdConcepts.size}/${wdTerms.size}`);

/* ── pass 2c: archive.org subject tags (from the harvest cache) ──
 * Plentiful but SEO-noisy — strict label matching plus a spam filter
 * keeps "fine old movies online" out and lets "film noir" through. */
const IA_SPAM = /(online|on line|streaming|download|youtube|rare film|old movie|archive film|classic|full (movie|film)|free (movie|film)|public domain|good silent|fine old|movies$)/i;
const iaSubjectsOf = (id) => {
  try {
    const j = JSON.parse(readFileSync(join(DIR, ".cache", "meta", encodeURIComponent(id) + ".json"), "utf8"));
    let s = (j.metadata || {}).subject || [];
    if (typeof s === "string") s = s.split(";");
    return [...new Set(s.flatMap((x) => String(x).split(";"))
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.length > 3 && x.length < 40 && !/^\d+$/.test(x) && !IA_SPAM.test(x) && !STOP.has(x)))];
  } catch { return []; }
};
const iaTerms = new Map();
for (const ch of CHANNELS) for (const p of ch.programs) {
  const id = (p.src || "").match(/archive\.org\/download\/([^/]+)\//)?.[1];
  if (!id) continue;
  iaSubjectsOf(id).slice(0, 12).forEach((t) => iaTerms.set(t, (iaTerms.get(t) || 0) + 1));
}
/* terms blanket-applied across hundreds of items are SEO, not coding */
const iaEligible = [...iaTerms.entries()].filter(([, n]) => n <= 300).map(([t]) => t);
console.log(`pass 2c: ${iaEligible.length} eligible IA subject terms → concepts…`);
const iaConcepts = new Map();
let iaFound = 0;
for (const term of iaEligible) {
  const c = await lookup(term, ["lcgft", "lcsh", "aat"]);
  if (c) { iaConcepts.set(term, c); iaFound++; }
}
console.log(`  matched: ${iaFound}/${iaEligible.length}`);

/* ── assemble per-program subjects ── */
const out = {};
let subjectCount = 0, programCount = 0;
for (const ch of CHANNELS) {
  for (const p of ch.programs) {
    const id = (p.src || "").match(/archive\.org\/download\/([^/]+)\//)?.[1];
    if (!id) continue;
    const subj = [];
    const seen = new Set();
    const add = (c) => {
      if (!c || seen.has(c.uri) || subj.length >= 8) return;
      seen.add(c.uri);
      subj.push([c.label, c.scheme, c.uri]);
    };
    /* precision first: the film's own Wikidata genres, then its archive
       subject tags, then dialogue topics — channel genre as the floor */
    if (p.wd && wdCache[p.wd]) {
      wdCache[p.wd].forEach((q) => {
        const l = (wdCache["L" + q] || "").toLowerCase();
        if (l) add(wdConcepts.get(l));
      });
    }
    iaSubjectsOf(id).forEach((t) => add(iaConcepts.get(t)));
    (channelConcepts[ch.id] || []).forEach(add);
    if (p.year && p.year <= 1928) add(silentConcept);
    (p.kw || []).slice(0, 8).forEach((k) => add(kwConcepts.get(k)));
    if (subj.length) {
      out[id] = subj;
      programCount++;
      subjectCount += subj.length;
    }
  }
}
console.log(`assembled: ${programCount} programs, ${subjectCount} subject links`);

/* ── pass 3: the topical hierarchy — skos:broader edges between the
   concepts we actually use, straight from the index. Only in-corpus
   parents are kept: the widget's tree is OUR corpus's shape, not all
   of LCGFT. */
console.log("pass 3: broader edges among used concepts…");
const usedUris = new Map();   // uri → true
for (const subj of Object.values(out)) for (const [, , uri] of subj) usedUris.set(uri, true);
const tree = {};
const extParent = new Map();  // uri → its first external broader
let edges = 0;
for (const uri of usedUris.keys()) {
  const j = await solr({ q: `id:"${uri}"`, rows: "1", fl: "id,broader" });
  const broader = j?.response?.docs?.[0]?.broader || [];
  const parent = broader.find((b) => usedUris.has(b));
  if (parent) { tree[uri] = parent; edges++; }
  else if (broader.length) extParent.set(uri, broader[0]);
}
console.log(`  ${edges} in-corpus broader edges`);
/* out-of-corpus parents adopted as family nodes when they unite >=2 of
   our concepts — LCGFT's genres are mostly siblings under nodes like
   "Fiction films" that no program carries directly */
const famCount = new Map();
for (const p of extParent.values()) famCount.set(p, (famCount.get(p) || 0) + 1);
const families = {};          // parent uri → label
for (const [p, n] of famCount) {
  if (n < 2) continue;
  const j = await solr({ q: `id:"${p}"`, rows: "1", fl: "id,prefLabel_en,exactLabel,prefLabel" });
  const d = j?.response?.docs?.[0];
  const label = d?.prefLabel_en?.[0] || d?.exactLabel?.[0] || d?.prefLabel?.[0];
  if (!label) continue;
  families[p] = label;
  for (const [uri, pp] of extParent) if (pp === p && !tree[uri]) tree[uri] = p;
}
console.log(`  ${Object.keys(families).length} adopted family nodes: ${Object.values(families).join(" · ")}`);

const body = `/*
 * 🗂 SKOS subjects — GENERATED by tools/skosify.mjs from skosdex
 * (https://skosdex.fly.dev), which indexes the world's SKOS schemes.
 * Mix of domain vocabularies (LC Genre/Form Terms for film & TV) and
 * general ones (LC Subject Headings, Getty AAT) matched from each
 * program's channel and dialogue keywords. Every URI resolves to its
 * authority's own page. Do not edit by hand; re-run after harvests.
 */

const SKOS_SCHEMES = ${JSON.stringify(Object.fromEntries(Object.entries(SCHEMES).map(([k, v]) => [k, v.name])), null, 1)};

const SKOS_SUBJECTS = ${JSON.stringify(out, null, 0)};

/* skos:broader edges (child uri → parent uri); parents may be adopted
   family nodes named in SKOS_FAMILIES rather than in-corpus concepts */
const SKOS_TREE = ${JSON.stringify(tree, null, 0)};
const SKOS_FAMILIES = ${JSON.stringify(families, null, 0)};
`;
writeFileSync(join(DIR, "..", "app", "js", "skos-gen.js"), body);
console.log("wrote app/js/skos-gen.js");
