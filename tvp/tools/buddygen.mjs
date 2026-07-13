#!/usr/bin/env node
/*
 * 👀 Watch Buddy — the sax & violins pass.
 *
 * Sweeps the whole lineup and generates discreet content tags for
 * programs whose title or channel genre suggests adult themes (🎷 "sax")
 * or screen violence (🎻 "violins") — the emoji euphemism keeps the
 * ambient strip subtle; the overlay decodes it politely. Hand-written
 * annotations in annotations.js always override these.
 *
 * Writes ../app/js/annotations-gen.js. Re-run after any harvest.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const DIR = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(DIR, "..", "app", "js", "channels.js"), "utf8");
const tmp = join(tmpdir(), "tvp-bg-" + process.pid + ".mjs");
writeFileSync(tmp, src + "\nexport {CHANNELS};");
const { CHANNELS } = await import(pathToFileURL(tmp).href);

const VIOLINS = /(murder|kill|blood|terror|dead\b|death|corpse|vampire|zombie|monster|horror|haunt|ghost|ghoul|revenge|outlaw|gunfight|gun\b|shoot|bandit|crime|slaughter|strangl|poison|creature|devil|demon|maniac|psycho|torture|massacre|invasion|attack of|fiend|werewolf|frankenstein|dracula)/i;
const VIOLIN_GENRES = new Set(["Cult", "Mystery", "Western"]);
const WAR = /(war\b|battle|bomb|blitz|combat|d-day|invasion|front\b|tirpitz|panay)/i;
const SAX = /(burlesque|scandal|vice\b|\bsin\b|sinner|temptation|forbidden|seduc|jealous|wicked|shameless|torrid|paradise for|good time girl|bad girl)/i;

const nodes = [];
let sax = 0, violins = 0, both = 0;

for (const ch of CHANNELS) {
  for (const p of ch.programs) {
    const id = (p.src || "").match(/archive\.org\/download\/([^/]+)\//)?.[1];
    if (!id) continue;
    const hay = p.title + " " + (p.desc || "");
    const v = VIOLINS.test(hay) || VIOLIN_GENRES.has(ch.category) ||
      (ch.category === "News" && WAR.test(hay));
    const x = SAX.test(hay);
    if (!v && !x) continue;
    const emoji = v && x ? "🎷🎻" : (v ? "🎻" : "🎷");
    const text = v && x
      ? "The orchestra is at full strength tonight: expect both the brass section (adult themes by the standards of its day) and the strings (period screen violence)."
      : v
        ? "Heavy on the violins: expect period screen violence — gunplay, menace or monster business typical of this genre and era."
        : "Notable sax section: innuendo or adult themes, by the standards of its day.";
    if (v && x) both++; else if (v) violins++; else sax++;
    nodes.push({
      "@id": "https://archive.org/details/" + id,
      "@type": "Movie",
      contentWarning: { warningEmoji: emoji, text }
    });
  }
}

console.log(`sax & violins pass: 🎻 ${violins} · 🎷 ${sax} · 🎷🎻 ${both} — ${nodes.length}/${CHANNELS.reduce((s, c) => s + c.programs.length, 0)} programs tagged`);

const out = `/*
 * 👀 Watch Buddy — GENERATED sax & violins tags (tools/buddygen.mjs).
 * 🎷 = adult themes, 🎻 = screen violence, discreetly. Hand annotations
 * in annotations.js override anything here. Do not edit by hand.
 */

const WATCH_BUDDY_GENERATED = ${JSON.stringify(nodes, null, 1)};
`;
writeFileSync(join(DIR, "..", "app", "js", "annotations-gen.js"), out);
console.log("wrote app/js/annotations-gen.js");
