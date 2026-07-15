#!/usr/bin/env node
/*
 * TVP/2007 subtitle indexer.
 *
 * For every program with a subtitle file (human or archive.org ASR),
 * fetches the text via archive.org/cors/, strips timestamps, and distils
 * the dialogue into a dozen distinctive keywords, stored as `kw` on the
 * program. The player folds these into search, so "submarine", "seance"
 * or "atomic" can find films by what's *said* in them, not just titles.
 *
 * Run after curate.mjs + enrich.mjs (needs the `subs` fields).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "js", "channels.js");
const src = readFileSync(FILE, "utf8");
const tmp = join(tmpdir(), "tvp-si-" + process.pid + ".mjs");
writeFileSync(tmp, src + "\nexport {CHANNELS, EPG_CATEGORIES};");
const { CHANNELS, EPG_CATEGORIES } = await import(pathToFileURL(tmp).href);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STOP = new Set(`a about above after again against all am an and any are aren't as at be because been
before being below between both but by can't cannot could couldn't did didn't do does doesn't doing don't
down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here
here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself
let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out
over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs
them themselves then there there's these they they'd they'll they're they've this those through to too under
until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which
while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself
yourselves well yeah yes okay right now get got going go come came just know think see look said say tell
told want like one two three good great little man men time day night way back thing things make made take
sir mrs mr miss lady gentleman gentlemen hello goodbye please thank thanks sorry really never always something
nothing anything everything someone anyone everyone somebody anybody everybody here there gonna wanna gotta
music applause laughter inaudible indistinct speaking foreign continues plays dramatic`.split(/\s+/));

function keywords(text, n = 12) {
  const counts = new Map();
  for (const raw of text.toLowerCase().split(/[^a-z']+/)) {
    const w = raw.replace(/^'+|'+$/g, "");
    if (w.length < 4 || STOP.has(w) || /^\d/.test(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

let indexed = 0, failed = 0, done = 0;
const progs = CHANNELS.flatMap((c) => c.programs);
const withSubs = progs.filter((p) => p.subs);
console.log(`${withSubs.length}/${progs.length} programs have subtitle files`);

for (const p of withSubs) {
  done++;
  const item = (p.src || "").match(/archive\.org\/download\/([^/]+)\//);
  if (!item) continue;
  try {
    const url = `https://archive.org/cors/${item[1]}/${p.subs.split("/").map(encodeURIComponent).join("/")}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { failed++; continue; }
    const text = (await r.text())
      .replace(/^\d+\s*$/gm, "")
      .replace(/\d{2}:\d{2}:\d{2}[.,]\d+\s*-->.*$/gm, "")
      .replace(/<[^>]+>/g, " ");
    const kw = keywords(text);
    if (kw.length >= 4) { p.kw = kw; indexed++; }
  } catch { failed++; }
  if (done % 40 === 0) console.log(`  ${done}/${withSubs.length} … indexed=${indexed} failed=${failed}`);
  await sleep(150);
}

console.log(`subtitle index: ${indexed} programs keyworded, ${failed} fetch failures`);

const banner = src.slice(0, src.indexOf("const CHANNELS"));
const body = banner +
  "const CHANNELS = " + JSON.stringify(CHANNELS, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* EPG category rail — the dial's 2007-flavoured category vocabulary */" +
  "\nconst EPG_CATEGORIES = " + JSON.stringify(EPG_CATEGORIES, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* Broadcast epoch: 16 Jan 2007 — the moment this dial's clock started ticking. */" +
  "\nconst BROADCAST_EPOCH = Date.UTC(2007, 0, 16, 0, 0, 0);\n";
writeFileSync(FILE, body);
console.log("wrote " + FILE);
