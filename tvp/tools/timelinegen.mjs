#!/usr/bin/env node
/*
 * Corpus timeline data — every dated event around the collection:
 * film releases (from channels.js years), births and deaths of the
 * directors/cast/writers, and publication of the source works films
 * are based on. All Wikidata traffic goes through QLever (batched
 * SPARQL, zero Wikimedia load — see /CLAUDE.md); results cache in
 * .cache/timeline-wd.json so re-runs cost nothing for known films.
 *
 * Writes ../app/js/timeline-gen.js. Run after wikilink.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const DIR = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(DIR, "..", "app", "js", "channels.js"), "utf8");
const tmp = join(tmpdir(), "tvp-tl-" + process.pid + ".mjs");
writeFileSync(tmp, src + "\nexport {CHANNELS};");
const { CHANNELS } = await import(pathToFileURL(tmp).href);

const CACHE_FILE = join(DIR, ".cache", "timeline-wd.json");
let cache = {};
try { cache = JSON.parse(readFileSync(CACHE_FILE, "utf8")); } catch {}
const saveCache = () => writeFileSync(CACHE_FILE, JSON.stringify(cache));

const QLEVER = "https://qlever.dev/api/wikidata";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sparql(q, key) {
  if (cache[key]) return cache[key];
  const r = await fetch(QLEVER, {
    method: "POST",
    headers: { "Content-Type": "application/sparql-query", Accept: "application/sparql-results+json" },
    body: q, signal: AbortSignal.timeout(120000)
  });
  if (!r.ok) throw new Error(`qlever ${r.status}`);
  const rows = (await r.json()).results.bindings;
  cache[key] = rows;
  saveCache();
  await sleep(400);
  return rows;
}
const qid = (uri) => uri?.split("/").pop();
const yearOf = (v) => { const m = String(v || "").match(/^(-?\d{4})/); return m ? +m[1] : null; };

/* film QIDs + which archive identifiers they map to */
const filmOf = new Map();       // film QID → [iaId…]
const namesOf = new Map();      // film QID → Set(lowercased credited names)
for (const c of CHANNELS) for (const p of c.programs) {
  if (!p.wd) continue;
  const id = (p.src.match(/download\/([^/]+)\//) || [])[1];
  if (!id) continue;
  if (!filmOf.has(p.wd)) { filmOf.set(p.wd, []); namesOf.set(p.wd, new Set()); }
  filmOf.get(p.wd).push(id);
  [...(p.dir || []), ...(p.cast || [])].forEach((n) => namesOf.get(p.wd).add(n.toLowerCase()));
}
const films = [...filmOf.keys()];
console.log(`${films.length} films carry Wikidata ids`);

/* pass 1: credits + source works per film */
const people = new Map();       // person QID → {n, roles: Map(iaId → role)}
const works = new Map();        // work QID → {n, films: Set(iaId)}
const ROLE = { P57: "dir", P58: "wri", P161: "act" };
for (let i = 0; i < films.length; i += 200) {
  const batch = films.slice(i, i + 200);
  const rows = await sparql(`
PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?f ?p ?v ?l WHERE {
  VALUES ?f { ${batch.map((q) => "wd:" + q).join(" ")} }
  VALUES ?p { wdt:P57 wdt:P58 wdt:P161 wdt:P144 }
  ?f ?p ?v . ?v rdfs:label ?l . FILTER(LANG(?l) = "en")
}`, "credits-" + batch[0] + "-" + batch.length);
  for (const row of rows) {
    const f = qid(row.f.value), prop = qid(row.p.value), v = qid(row.v.value), label = row.l.value;
    const iaIds = filmOf.get(f) || [];
    if (prop === "P144") {
      if (!works.has(v)) works.set(v, { n: label, films: new Set() });
      iaIds.forEach((x) => works.get(v).films.add(x));
    } else {
      /* keep the person if credited on the program (dir/cast fields) or a
         director/writer — uncredited deep-cast lists would triple the data */
      const credited = namesOf.get(f)?.has(label.toLowerCase());
      if (prop === "P161" && !credited) continue;
      if (!people.has(v)) people.set(v, { n: label, roles: [] });
      iaIds.forEach((x) => people.get(v).roles.push([x, ROLE[prop]]));
    }
  }
  console.log(`  credits ${Math.min(i + 200, films.length)}/${films.length} … people=${people.size} works=${works.size}`);
}

/* pass 2: person birth/death years */
const pq = [...people.keys()];
for (let i = 0; i < pq.length; i += 400) {
  const batch = pq.slice(i, i + 400);
  const rows = await sparql(`
PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?x ?b ?d WHERE {
  VALUES ?x { ${batch.map((q) => "wd:" + q).join(" ")} }
  OPTIONAL { ?x wdt:P569 ?b } OPTIONAL { ?x wdt:P570 ?d }
}`, "life-" + batch[0] + "-" + batch.length);
  for (const row of rows) {
    const x = people.get(qid(row.x.value));
    if (!x) continue;
    x.b = x.b ?? yearOf(row.b?.value);
    x.d = x.d ?? yearOf(row.d?.value);
  }
  console.log(`  lives ${Math.min(i + 400, pq.length)}/${pq.length}`);
}

/* pass 3: source works — publication year + author */
const wq = [...works.keys()];
for (let i = 0; i < wq.length; i += 400) {
  const batch = wq.slice(i, i + 400);
  const rows = await sparql(`
PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?w ?y ?i ?a WHERE {
  VALUES ?w { ${batch.map((q) => "wd:" + q).join(" ")} }
  OPTIONAL { ?w wdt:P577 ?y } OPTIONAL { ?w wdt:P571 ?i }
  OPTIONAL { ?w wdt:P50 ?au . ?au rdfs:label ?a . FILTER(LANG(?a) = "en") }
}`, "works-" + batch[0] + "-" + batch.length);
  for (const row of rows) {
    const w = works.get(qid(row.w.value));
    if (!w) continue;
    w.y = w.y ?? (yearOf(row.y?.value) || yearOf(row.i?.value));
    w.by = w.by || row.a?.value;
  }
  console.log(`  works ${Math.min(i + 400, wq.length)}/${wq.length}`);
}

/* emit — compact arrays keyed by QID */
const P = {};
for (const [q, x] of people) {
  if (!x.b && !x.d) continue;                     // undated people carry no events
  P[q] = [x.n, x.b || 0, x.d || 0, x.roles];
}
const W = {};
for (const [q, x] of works) {
  if (!x.y) continue;
  W[q] = [x.n, x.y, x.by || "", [...x.films]];
}
const out = `/*
 * 📅 Corpus timeline — GENERATED by tools/timelinegen.mjs from Wikidata
 * via QLever. TL_PEOPLE: QID → [name, born, died, [[iaId, role]…]]
 * (role: dir/act/wri). TL_WORKS: QID → [title, year, author, [iaId…]]
 * — the works films are based on. Do not edit by hand.
 */

const TL_PEOPLE = ${JSON.stringify(P)};
const TL_WORKS = ${JSON.stringify(W)};
`;
writeFileSync(join(DIR, "..", "app", "js", "timeline-gen.js"), out);
console.log(`wrote timeline-gen.js: ${Object.keys(P).length} dated people, ${Object.keys(W).length} dated source works`);
