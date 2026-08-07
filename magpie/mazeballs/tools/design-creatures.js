/**
 * INTELLIGENT DESIGN — ten creatures, designed by specification and search.
 *
 * You cannot hand-write a GRN. The genotype-phenotype map is a dynamical system
 * run for twelve seconds of developmental time; a weight has no local meaning
 * and no gene corresponds to a limb. Writing 970 floats to get "an elongated
 * swimmer with bilateral sensors" is not a design problem, it is a search
 * problem wearing a design problem's clothes.
 *
 * So the design is the SPECIFICATION. A creature here is a name, a sentence
 * about what it is for, and a scoring function over the body that develops —
 * elongation, tissue mix, symmetry, toughness, size. The search then finds a
 * genome whose development scores well against it. That is genuinely design:
 * the intent is stated in advance and in the phenotype's own terms, which is
 * exactly where a breeder's intent lives too.
 *
 * IT DOES NOT TOUCH THE WORLD'S LAWS. These are ordinary genomes in the
 * ordinary format, found by ordinary mutation of random founders. Nothing here
 * is a new cell type, a role, or a behaviour the kernel knows about — every
 * target below is a region of the same low-level space evolution searches. What
 * is unusual is only WHO chose the direction.
 *
 * CPU only, and fast: development is a few thousand steps of arithmetic per
 * candidate, no GPU, no world.
 *
 *   deno run -A tools/design-creatures.js [--tries 900] [--out lib/creatures.json]
 */
import { develop, randomGenome, mutate, DEFAULT_EXTENT } from '../lib/devo2.js';
// The world's own rule for what a cell is, not a copy of it.
import { describe } from '../lib/evolve.js';

const args = Object.fromEntries(
  Deno.args.map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : null)
    .filter(Boolean));
const TRIES = Number(args.tries ?? 900);
const OUT = args.out ?? './lib/creatures.json';
const MAXCELLS = 60;

/** Deterministic PRNG so a library is reproducible from its seed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Measure a developed body. Everything the specs are allowed to ask about. */
function measure(cells) {
  const n = cells.length;
  if (!n) return null;
  let cx = 0, cy = 0;
  for (const c of cells) { cx += c.x; cy += c.y; }
  cx /= n; cy /= n;

  // Elongation: ratio of the principal axes of the cell cloud.
  let sxx = 0, syy = 0, sxy = 0;
  for (const c of cells) {
    const dx = c.x - cx, dy = c.y - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.max(0, tr * tr / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc), l2 = Math.max(1e-9, tr / 2 - Math.sqrt(disc));
  const elong = Math.sqrt(l1 / l2);

  const kind = [0, 0, 0, 0];
  let tough = 0, enz = 0, tag = 0, stiff = 0, senseAcuity = 0;
  for (const c of cells) {
    const t = describe(c);
    if (t >= 0 && t < 4) kind[t]++;
    tough += Math.max(0, c.toughness ?? 0);
    enz += c.enzyme ?? 0.5;
    tag += c.tag ?? 0.5;
    stiff += c.stiff ?? 0;
    senseAcuity += Math.abs(c.senseTune ?? 0);
  }
  // Bilateral symmetry: how well the body matches itself mirrored about the AP
  // axis. A real body plan is repeatable across the midline; a blob is not.
  let paired = 0;
  for (const c of cells) {
    const mx = c.x, my = 2 * cy - c.y;
    let best = 1e9;
    for (const d of cells) {
      const dd = (d.x - mx) ** 2 + (d.y - my) ** 2;
      if (dd < best) best = dd;
    }
    if (best < 0.55) paired++;
  }

  return {
    n, elong,
    neuron: kind[0] / n, sensor: kind[1] / n, muscle: kind[2] / n, anchor: kind[3] / n,
    tough: tough / n, enzyme: enz / n, tag: tag / n, stiff: stiff / n,
    acuity: senseAcuity / n,
    symmetry: paired / n,
    tissues: kind.filter((v) => v > 0).length,
  };
}

/** Reward a value being near a target, 1 at the target and falling off smoothly. */
const near = (v, t, w = 0.25) => Math.exp(-(((v - t) / w) ** 2));
/**
 * Reward a value being large, saturating at 1.
 *
 * CLAMPED AT ZERO, which is not fussiness. v/(v+k) has a pole at v = -k, so a
 * negative input — and several of these measures can be negative, stiffness
 * most obviously — sends the score through infinity instead of toward zero.
 * The Fan scored 976 against a maximum of about 4 on its first run, and won by
 * being degenerate rather than by being flat.
 */
const more = (v, k = 1) => { const x = Math.max(0, v); return x / (x + k); };

/**
 * THE TEN. Each is a name, a sentence, and a score over the measured body.
 *
 * The sentences are the design intent and are meant to be read — they say what
 * the thing is FOR, which is the part a number cannot carry. The scores are
 * deliberately about morphology and material, never about behaviour: there is
 * no term for "swims fast", because that would be selecting on an outcome the
 * world is supposed to decide.
 */
const SPECS = [
  {
    name: 'Filament',
    about: 'A long thin chain. The simplest way to be more than a blob, and the '
         + 'body plan a travelling wave needs before it can be a gait.',
    score: (m) => 2.2 * more(m.elong - 1, 1.6) + 0.6 * near(m.n, 26, 12) + 0.4 * m.muscle,
  },
  {
    name: 'Lash',
    about: 'Elongated and almost entirely muscle, with the mass at one end. '
         + 'Everything spent on force; nothing spent on knowing where it is.',
    score: (m) => 1.6 * more(m.elong - 1, 1.4) + 2.0 * m.muscle + 0.4 * near(m.n, 20, 10),
  },
  {
    name: 'Sentinel',
    about: 'Sensor-heavy and barely mobile. Bets everything on knowing what is '
         + 'nearby, which only pays in a world where something is.',
    score: (m) => 2.6 * m.sensor + 1.2 * more(m.acuity, 0.4) + 0.5 * near(m.n, 22, 10),
  },
  {
    name: 'Holdfast',
    about: 'A gripping base with a small crown. Built to stay put in a current '
         + 'and let the water bring things to it.',
    score: (m) => 2.2 * m.anchor + 0.8 * near(m.elong, 2.0, 0.9) + 0.5 * near(m.n, 24, 10),
  },
  {
    name: 'Grappler',
    about: 'Anchors at the extremities, muscle between them. The anchor-extend-'
         + 'anchor-contract ratchet, laid out as a body rather than a behaviour.',
    score: (m) => 1.4 * m.anchor + 1.4 * m.muscle + 1.0 * more(m.elong - 1, 1.2)
                + 0.6 * (m.tissues >= 3 ? 1 : 0),
  },
  {
    name: 'Cuirass',
    about: 'Compact and armoured. Pays a metabolic rent every second for a '
         + 'defence that only matters if something is trying to eat it.',
    score: (m) => 2.8 * more(m.tough, 0.35) + 0.8 * near(m.elong, 1.1, 0.35)
                + 0.5 * near(m.n, 30, 14),
  },
  {
    name: 'Digestor',
    about: 'Soft, unarmoured, and specialised in what it can break down. The '
         + 'opposite bet to Cuirass: eat well, do not bother surviving being eaten.',
    score: (m) => 1.8 * (1 - more(m.tough, 0.2)) + 1.6 * Math.abs(m.enzyme - 0.5) * 2
                + 0.6 * near(m.n, 26, 12),
  },
  {
    name: 'Fan',
    about: 'Broad and flat, maximum surface for minimum tissue. Everything it '
         + 'does, it does with the outside of itself.',
    score: (m) => 1.8 * near(m.elong, 1.15, 0.3) + 1.4 * more(m.n, 30)
                + 0.8 * more(m.stiff, 0.4),
  },
  {
    name: 'Mirror',
    about: 'Strongly bilateral. Two of everything, one on each side, which is '
         + 'what a body needs before it can turn rather than merely move.',
    score: (m) => 2.6 * m.symmetry + 0.8 * more(m.elong - 1, 1.0)
                + 0.6 * (m.tissues >= 3 ? 1 : 0),
  },
  {
    name: 'Chimera',
    about: 'All four tissues in balance. Not optimised for anything — built to '
         + 'test whether division of labour survives contact with the economy.',
    score: (m) => {
      const want = 0.25;
      const bal = 4 - (Math.abs(m.neuron - want) + Math.abs(m.sensor - want)
                     + Math.abs(m.muscle - want) + Math.abs(m.anchor - want)) * 2;
      return 0.9 * bal + 0.7 * near(m.n, 34, 14);
    },
  },
];

// ---------------------------------------------------------------------------

function grow(genome, rnd) {
  const g = develop(genome, {
    extent: DEFAULT_EXTENT, maxCells: MAXCELLS, yolk: 1e9, cellCost: 0, rnd,
  });
  return g.cells ?? [];
}

/**
 * Random restarts, then hill-climb. Deliberately simple: the point is a library
 * of usable bodies, not a good optimiser, and a fancier search would make the
 * result harder to trust rather than easier.
 */
function designOne(spec, seed) {
  const rnd = rng(seed);
  let best = null;
  const RESTARTS = 6;
  for (let r = 0; r < RESTARTS; r++) {
    let g = randomGenome(rnd);
    let m = measure(grow(g, rnd));
    // A SIZE FLOOR, because elongation is trivially maximised by a sliver. The
    // first run produced a six-cell "Filament" with an aspect ratio of 113 and
    // an eight-cell "Grappler" at 43 — perfect scores for bodies that are a
    // line of dots. A body plan has to have enough body to plan.
    const ok = (x) => x && x.n >= 12;
    let s = ok(m) ? spec.score(m) : -1;
    let stall = 0;
    for (let i = 0; i < Math.round(TRIES / RESTARTS) && stall < 140; i++) {
      // Anneal: broad early, fine late, so a restart explores before it settles.
      const frac = i / Math.max(1, TRIES / RESTARTS);
      const g2 = mutate(g, rnd, {
        rate: 0.20 * (1 - 0.6 * frac), size: 0.45 * (1 - 0.6 * frac), structural: 0.05,
      });
      const m2 = measure(grow(g2, rnd));
      const s2 = ok(m2) ? spec.score(m2) : -1;
      if (s2 > s) { g = g2; m = m2; s = s2; stall = 0; } else stall++;
    }
    if (!best || s > best.score) best = { score: s, genome: g, m };
  }
  return best;
}

console.log(`designing ${SPECS.length} creatures, ${TRIES} evaluations each\n`);
const out = [];
for (let i = 0; i < SPECS.length; i++) {
  const spec = SPECS[i];
  const t0 = performance.now();
  const r = designOne(spec, 7717 + i * 1013);
  const m = r.m;
  const ms = Math.round(performance.now() - t0);
  if (!m) { console.log(`${spec.name}: FAILED to develop anything`); continue; }
  console.log(
    `${spec.name.padEnd(10)} score ${r.score.toFixed(2).padStart(5)}  ` +
    `${String(m.n).padStart(2)} cells  elong ${m.elong.toFixed(2)}  ` +
    `n/s/m/a ${(100 * m.neuron).toFixed(0)}/${(100 * m.sensor).toFixed(0)}/` +
    `${(100 * m.muscle).toFixed(0)}/${(100 * m.anchor).toFixed(0)}%  ` +
    `tough ${m.tough.toFixed(2)}  sym ${m.symmetry.toFixed(2)}  ${ms}ms`);
  out.push({
    name: spec.name, about: spec.about,
    stats: {
      cells: m.n, elongation: +m.elong.toFixed(3), symmetry: +m.symmetry.toFixed(3),
      neuron: +m.neuron.toFixed(3), sensor: +m.sensor.toFixed(3),
      muscle: +m.muscle.toFixed(3), anchor: +m.anchor.toFixed(3),
      toughness: +m.tough.toFixed(3), enzyme: +m.enzyme.toFixed(3),
      tissues: m.tissues,
    },
    genome: Array.from(r.genome).map((v) => +v.toFixed(5)),
  });
}

await Deno.writeTextFile(OUT, JSON.stringify({
  note: 'Designed by specification and search — see tools/design-creatures.js. '
      + 'Ordinary devo2 genomes; nothing here is a new type or a role.',
  encoding: 'devo2-grn',
  creatures: out,
}, null, 1));
console.log(`\nwrote ${out.length} creatures to ${OUT}`);
