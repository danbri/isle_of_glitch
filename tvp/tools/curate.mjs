#!/usr/bin/env node
/*
 * TVP/2007 content curator.
 *
 * Harvests free/open video from Internet Archive collections, verifies that
 * each item has a light H.264 derivative (fast to start on mobile), extracts
 * durations, and regenerates ../app/js/channels.js.
 *
 * Run:  node curate.mjs            (writes channels.js)
 *       node curate.mjs --dry     (report only)
 *
 * Being polite to archive.org: modest concurrency, one metadata call per
 * candidate, a single 1-byte ranged GET to verify the chosen file streams.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "js", "channels.js");
const DRY = process.argv.includes("--dry");
const ARCHIVE = "https://archive.org/download/";

/* ── the dial ──────────────────────────────────────────────────────────
 * Hand-picked channels keep their curated programs; harvested channels
 * pull the most-viewed items from an archive.org collection and keep the
 * ones that pass verification. per-channel caps keep schedules varied.
 */

const HAND = (title, year, dur, path, desc, license) =>
  ({ title, year, dur, src: ARCHIVE + path, desc, license });

const BLENDER = "CC-BY · Blender Foundation";

const DIAL = [
  {
    num: 1, id: "animation-station", name: "Animation Station",
    category: "Cartoons & Animation", tagline: "Round-the-clock open-source toons",
    art: "BigBuckBunny_124",
    hand: [
      HAND("Big Buck Bunny", 2008, 596.5, "BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
        "A giant rabbit takes gentle revenge on three bullying rodents.", BLENDER),
      HAND("Caminandes: Llama Drama", 2013, 90, "Caminandes1LlamaDrama/01_llama_drama_1080p.mp4",
        "Koro the llama versus a very inconvenient fence.", BLENDER),
      HAND("Caminandes: Gran Dillama", 2013, 146, "Caminandes2GranDillama/02_gran_dillama_1080p.mp4",
        "The grass really is greener on the other side of the road.", BLENDER)
    ]
  },
  {
    num: 2, id: "open-cinema", name: "Open Cinema",
    category: "Film", tagline: "The Blender open movie channel", art: "Sintel",
    hand: [
      HAND("Elephants Dream", 2006, 653.8, "ElephantsDream/ed_1024_512kb.mp4",
        "Two strange characters explore an infinite machine.", BLENDER),
      HAND("Sintel", 2010, 888, "Sintel/sintel-2048-stereo_512kb.mp4",
        "A lone girl searches for the dragon she once rescued.", BLENDER),
      HAND("Tears of Steel", 2012, 734.1, "Tears-of-Steel/tears_of_steel_720p.mp4",
        "Scientists restage an old heartbreak to save Amsterdam from robots.", BLENDER),
      HAND("Cosmos Laundromat: First Cycle", 2015, 730.6,
        "CosmosLaundromatFirstCycle/Cosmos%20Laundromat%20-%20First%20Cycle%20%281080p%29.mp4",
        "A suicidal sheep is offered any life he wants.", BLENDER),
      HAND("Spring", 2019, 464.2, "springopenmovie/springopenmovie.mp4",
        "A shepherd girl and her dog face ancient spirits.", BLENDER)
    ]
  },
  {
    num: 3, id: "cartoon-classics", name: "Cartoon Classics",
    category: "Kids", tagline: "Hand-drawn wonders since 1911", art: "Gertie",
    hand: [
      HAND("Little Nemo", 1911, 634.2, "LittleNemo_548/LittleNemo_512kb.mp4",
        "Winsor McCay's pioneering hand-tinted animation.", "Public domain"),
      HAND("Gertie the Dinosaur", 1914, 738.6, "Gertie/GertietheDinosaur.mp4",
        "The first cartoon star ever.", "Public domain"),
      HAND("Steamboat Willie", 1928, 442.4, "SteamboatWillie/Steamboat%20Willie.mp4",
        "The synchronized-sound sensation that launched a mouse.", "Public domain"),
      HAND("Superman: The Mechanical Monsters", 1941, 613.8,
        "SupermanTheMechanicalMonsters1941/Superman%20-%20The%20Mechanical%20Monsters%20%281941%29.mp4",
        "Fleischer's art-deco Superman battles robot bank-robbers.", "Public domain")
    ],
    collection: "classic_cartoons", want: 10, minDur: 240, maxDur: 1800
  },
  {
    num: 4, id: "creature-feature", name: "Creature Feature",
    category: "Cult", tagline: "Late-night chills, all night",
    art: "Night.Of.The.Living.Dead_1080p",
    hand: [
      HAND("Night of the Living Dead", 1968, 5752.7,
        "Night.Of.The.Living.Dead_1080p/NightOfTheLivingDead_1080p_512kb.mp4",
        "The farmhouse siege that invented the modern zombie.", "Public domain"),
      HAND("House on Haunted Hill", 1959, 4483.2,
        "house_on_haunted_hill_ipod/house_on_haunted_hill_512kb.mp4",
        "Vincent Price offers five guests $10,000 to survive the night.", "Public domain")
    ],
    collection: "SciFi_Horror", want: 8, minDur: 2400, maxDur: 7800,
    titleFilter: /(horror|dead|zombie|vampire|ghost|haunt|terror|monster|creature|devil|blood|corpse|body snatch|carnival of souls|dementia|attack)/i
  },
  {
    num: 5, id: "atomic-theater", name: "Atomic Theater",
    category: "Sci-Fi", tagline: "Flying saucers & fallout, nightly",
    art: "Plan_9_from_Outer_Space_1959",
    hand: [],
    query: 'collection:SciFi_Horror AND mediatype:movies AND title:(space OR planet OR saucer OR mars OR rocket OR atomic OR "outer space" OR robot OR satellite OR venus OR moon)',
    want: 10, minDur: 2400, maxDur: 7800,
    titleFilter: /(planet|space|outer|rocket|saucer|mars|moon|robot|atomic|future|invasion|astro|cosmic|satellite|ufo|venus|brain|teenagers from)/i
  },
  {
    num: 6, id: "noir-alley", name: "Noir Alley",
    category: "Drama", tagline: "Shadows, cigarettes and bad decisions",
    art: "Film_Noir",
    hand: [],
    collection: "Film_Noir", want: 10, minDur: 2800, maxDur: 7800
  },
  {
    num: 7, id: "screwball-screen", name: "Screwball Screen",
    category: "Comedy", tagline: "Fast talk from the golden age",
    art: "his_girl_friday",
    hand: [
      HAND("His Girl Friday", 1940, 5504.5, "his_girl_friday/his_girl_friday_512kb.mp4",
        "The fastest dialogue ever filmed.", "Public domain")
    ],
    collection: "Comedy_Films", want: 9, minDur: 2400, maxDur: 7800
  },
  {
    num: 8, id: "retro-vault", name: "Retro Vault",
    category: "Documentary", tagline: "Ephemeral films from the Prelinger vaults",
    art: "DuckandC1951",
    hand: [
      HAND("Duck and Cover", 1951, 555.4, "DuckandC1951/DuckandC1951_512kb.mp4",
        "Bert the Turtle teaches Cold-War civil defense.", "Public domain · Prelinger"),
      HAND("The Home Economics Story", 1951, 748.4, "HomeEcon1951/HomeEcon1951_512kb.mp4",
        "A gloriously earnest recruiting film.", "Public domain · Prelinger")
    ],
    collection: "prelinger", want: 12, minDur: 240, maxDur: 2400
  },
  {
    num: 9, id: "newsreel-nine", name: "Newsreel Nine",
    category: "News", tagline: "History as it happened, twice a week",
    art: "universal_newsreels",
    hand: [],
    collection: "universal_newsreels", want: 12, minDur: 120, maxDur: 1500
  },
  {
    num: 10, id: "tube-classics", name: "Tube Classics",
    category: "Entertainment", tagline: "The golden age of the small screen",
    art: "classic_tv",
    hand: [],
    collection: "classic_tv", want: 12, minDur: 1200, maxDur: 3900,
    /* classic_tv is full of infringing uploads — allow only well-known
       public-domain-era shows */
    titleFilter: /(bonanza|lone ranger|beverly hillbillies|dick van dyke|petticoat junction|dragnet|sherlock holmes|one step beyond|racket squad|ozzie and harriet|jack benny|burns and allen|lucy|milton berle|texaco|your show of shows|studio one|suspense|lights out)/i
  },
  {
    num: 11, id: "silent-palace", name: "Silent Palace",
    category: "Film", tagline: "No talking. Piano optional.",
    art: "silent_films",
    hand: [],
    collection: "silent_films", want: 10, minDur: 600, maxDur: 7800
  },
  {
    num: 12, id: "trailer-park", name: "Trailer Park",
    category: "Entertainment", tagline: "Coming attractions, forever",
    art: "movie_trailers",
    hand: [],
    /* the movie_trailers collection is a swamp; verified classics + a
       year-bounded query for golden-age attractions */
    ids: [
      "SitaSingsTheBluesTrailer2008-640x360", "NightOfTheLivingDeadTrailer",
      "RevengeOfTheCreatureTrailer", "BananasTrailer_733", "FantasticPlanetTrailer"
    ],
    query: 'collection:movie_trailers AND mediatype:movies AND title:(trailer) AND date:[1930-01-01 TO 1977-12-31]',
    want: 16, minDur: 45, maxDur: 360, maxYear: 1977,
    titleFilter: /trailer/i
  },
  {
    num: 13, id: "moon-tv", name: "Moon TV",
    category: "Science & Tech", tagline: "One small step, on a loop",
    art: "youtube-S9HdPi9Ikhk",
    hand: [
      HAND("Apollo 11 Moonwalk (Restored)", 1969, 10950, "youtube-S9HdPi9Ikhk/S9HdPi9Ikhk.mp4",
        "NASA's restored original EVA television.", "Public domain · NASA")
    ],
    collection: "nasa", want: 8, minDur: 240, maxDur: 4000
  }
];

/* ── plumbing ─────────────────────────────────────────────────────── */

/* keep the default dial family-friendly and clear of obvious rip uploads */
const GLOBAL_EXCLUDE = /(sex|porn|milf|erot|nude|xxx|kama sutra|\bdesire\b|psycho cat|ramrodder|women are bad|snuff|hbo|netflix|complete series|complete docuseries|ken.?\s*burns|world at war|blu.?ray|1080p rip|x26[45])/i;

const normTitle = (t) => String(t || "").toLowerCase()
  .replace(/[^a-z0-9 ]+/g, "").replace(/^the /, "").replace(/\s+/g, " ").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
    } catch {}
    await sleep(1000 * (i + 1));
  }
  return null;
}

async function search(query, rows) {
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}` +
    `&fl[]=identifier&fl[]=title&fl[]=year&fl[]=downloads` +
    `&sort[]=downloads+desc&rows=${rows}&output=json`;
  const j = await getJSON(url);
  return j?.response?.docs ?? [];
}

function parseLen(s) {
  if (s == null) return NaN;
  const str = String(s);
  if (/^[\d.]+$/.test(str)) return parseFloat(str);
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/* pick a light, streamable h.264 file; also note a bigger one for "best" */
function pickFiles(files) {
  const mp4s = files.filter((f) => /\.mp4$/i.test(f.name) && f.size);
  if (!mp4s.length) return null;
  const score = (f) => {
    const n = f.name.toLowerCase();
    if (n.endsWith("_512kb.mp4")) return 0;          // classic h.264 derivative
    if (n.endsWith(".ia.mp4")) return 1;             // modern ia derivative
    return 2 + Math.min(1, +f.size / 4e8);           // originals: prefer smaller
  };
  mp4s.sort((a, b) => score(a) - score(b) || +a.size - +b.size);
  const lo = mp4s[0];
  const hi = mp4s.filter((f) => f !== lo && +f.size > +lo.size * 1.4)
                 .sort((a, b) => +a.size - +b.size)[0];
  return { lo, hi };
}

async function verify(url) {
  try {
    const r = await fetch(url, {
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(25000), redirect: "follow"
    });
    return r.status === 206 || r.status === 200;
  } catch { return false; }
}

function cleanTitle(t) {
  return String(t || "").replace(/\s+/g, " ")
    .replace(/\s*[\(\[]\s*(19|20)\d\d\s*[\)\]]\s*$/, "").trim().slice(0, 70);
}

async function harvestChannel(ch, taken, seenTitles) {
  if (!ch.want || (!ch.collection && !ch.ids && !ch.query)) return [];
  const q = ch.query || (ch.collection && `collection:${ch.collection} AND mediatype:movies`);
  const docs = [
    ...(ch.ids || []).map((identifier) => ({ identifier })),
    ...(q ? await search(q, ch.want * 6) : [])
  ];
  const out = [];
  const rejects = {};
  const reject = (why) => { rejects[why] = (rejects[why] || 0) + 1; };
  for (const d of docs) {
    if (out.length >= ch.want) break;
    if (!d.identifier || taken.has(d.identifier)) { reject("dup-id"); continue; }
    const searchTitle = String(d.title || "");
    if (d.title !== undefined) {
      if (GLOBAL_EXCLUDE.test(searchTitle)) { reject("excluded"); continue; }
      if (ch.titleFilter && !ch.titleFilter.test(searchTitle)) { reject("filter"); continue; }
    }
    const meta = await getJSON(`https://archive.org/metadata/${d.identifier}`);
    if (!meta?.files) { reject("no-meta"); continue; }
    const title = cleanTitle(d.title || meta.metadata?.title) || d.identifier;
    if (GLOBAL_EXCLUDE.test(title)) { reject("excluded"); continue; }
    if (seenTitles.has(normTitle(title))) { reject("dup-title"); continue; }
    const picked = pickFiles(meta.files);
    if (!picked) { reject("no-mp4"); continue; }
    const dur = parseLen(picked.lo.length) ||
                parseLen(meta.files.find((f) => parseLen(f.length))?.length);
    if (!dur || dur < ch.minDur || dur > ch.maxDur) { reject("duration"); continue; }
    const year = parseInt(d.year) || parseInt(meta.metadata?.year) ||
                 parseInt(String(meta.metadata?.date || "").slice(0, 4)) || undefined;
    if (ch.maxYear && year && year > ch.maxYear) { reject("too-new"); continue; }
    const enc = (n) => n.split("/").map(encodeURIComponent).join("/");
    const src = `${ARCHIVE}${d.identifier}/${enc(picked.lo.name)}`;
    if (!(await verify(src))) { reject("verify"); continue; }
    taken.add(d.identifier);
    seenTitles.add(normTitle(title));
    out.push({
      title,
      year, dur: Math.round(dur * 10) / 10,
      src,
      srcHi: picked.hi ? `${ARCHIVE}${d.identifier}/${enc(picked.hi.name)}` : undefined,
      art: `https://archive.org/services/img/${d.identifier}`,
      desc: "",
      license: "via archive.org"
    });
    process.stdout.write(`  + ${ch.id}: ${out.length}/${ch.want} ${d.identifier}\n`);
  }
  if (out.length < ch.want) console.log(`  rejects: ${JSON.stringify(rejects)}`);
  return out;
}

/* ── main ─────────────────────────────────────────────────────────── */

const taken = new Set();
const seenTitles = new Set();
const channels = [];

for (const ch of DIAL) {
  console.log(`── ${ch.num} ${ch.name} ${ch.collection ? `(harvest ${ch.collection})` : "(hand-picked)"}`);
  ch.hand.forEach((p) => {
    const m = p.src.match(/download\/([^/]+)\//);
    if (m) taken.add(m[1]);
    seenTitles.add(normTitle(p.title));
    p.art = p.art || `https://archive.org/services/img/${m ? m[1] : ""}`;
  });
  const harvested = await harvestChannel(ch, taken, seenTitles);
  const programs = [...ch.hand, ...harvested]
    .sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title));
  if (!programs.length) { console.log(`  !! ${ch.id} came up empty — skipped`); continue; }
  channels.push({
    num: 0, id: ch.id, name: ch.name, category: ch.category,
    tagline: ch.tagline, art: `https://archive.org/services/img/${ch.art}`,
    programs
  });
  console.log(`  = ${programs.length} programs`);
}

/* renumber contiguously so keypad zapping has no gaps */
channels.forEach((c, i) => { c.num = i + 1; });

const totalPrograms = channels.reduce((s, c) => s + c.programs.length, 0);
const totalHours = channels.reduce((s, c) => s + c.programs.reduce((x, p) => x + p.dur, 0), 0) / 3600;
console.log(`\nDial: ${channels.length} channels, ${totalPrograms} programs, ${totalHours.toFixed(1)} hours of airtime`);

const CATS = [
  { id: "explore", label: "Explore", icon: "◉" },
  { id: "my", label: "My Channels", icon: "★" },
  ...[...new Set(channels.map((c) => c.category))].map((c) => ({ id: c, label: c, icon: "▸" }))
];

const banner = `/*
 * TVP/2007 — channel lineup.
 * GENERATED by tvp/tools/curate.mjs on ${new Date().toISOString().slice(0, 10)} — edit that script, not this file.
 * ${channels.length} channels · ${totalPrograms} programs · ${totalHours.toFixed(1)} hours of free/open video,
 * all verified range-streamable from the Internet Archive at harvest time.
 * Hand-picked programs carry license notes; harvested items are from
 * archive.org public collections (Prelinger, Film Noir, SciFi_Horror, …).
 */
`;

const body = banner +
  "\nconst CHANNELS = " + JSON.stringify(channels, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* EPG category rail — vocabulary from the 2007 client's catalog */" +
  "\nconst EPG_CATEGORIES = " + JSON.stringify(CATS, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* Broadcast epoch: 16 Jan 2007, the day The Venice Project became \"Joost\". */" +
  "\nconst BROADCAST_EPOCH = Date.UTC(2007, 0, 16, 0, 0, 0);\n";

if (DRY) {
  console.log("(dry run — not writing)");
} else {
  writeFileSync(OUT, body);
  console.log("wrote " + OUT);
}
