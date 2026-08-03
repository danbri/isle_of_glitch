#!/usr/bin/env node
/**
 * Is the foraging task UNCOVERABLE? — the precondition the seed-a-gait experiment
 * (tools/sb-evolve.js --seedPop) rests on, checked on the real soft-body arena
 * before any evolution is committed to it.
 *
 *   node tools/sb-uncover.js --food 12 --clusters 2 --clusterSpan 0.7 --senseSigma2 0.13 --relocateThresh 0
 *
 * land-control.js proved, with hand-written point-agent policies, that sensing
 * only beats coverage once the food is too sparse/clustered to sweep. This asks
 * the same question of the SOFT BODY arena at the given cfg, using real developed
 * bodies, so the number describes the world the sb-evolve arms actually run in.
 *
 * Three references, all on the SAME food field, K spawns × seeds, mean intake ± SE:
 *
 *   COVERAGE   — the committed champion crawler (populations/…-crawler.json), a
 *                strong BLIND mover (evolved for displacement, never for sensing),
 *                with its food sense ABLATED (mean-replaced). This is the best
 *                non-sensing sweep the substrate has. If it forages poorly, blind
 *                coverage does not solve the task.
 *   CRAWLER    — the same crawler with its food sense INTACT. Pre-evolution it does
 *                not USE the sense, so this ≈ COVERAGE; a gap would mean the raw
 *                gait already stumbles onto the gradient.
 *   PLANTED    — bodies translated so their centroid starts ON a food cluster: the
 *                obtainable-intake CEILING. If this is high, food IS edible and a
 *                null seeded result would be findability, not an empty arena
 *                (the solvability guard the central-place lesson demands).
 *
 * Verdict UNCOVERABLE when COVERAGE ≪ PLANTED (blind sweeping cannot collect the
 * food a body sitting on it trivially eats), so the sense has real headroom to pay.
 * Run it against the DENSE default (--food 42 --clusters 9 --clusterSpan 1.72) to
 * see the contrast: there coverage ≈ planted and the task is coverable (void).
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from './backend.js';
import { DEFAULTS, makeRng, develop, makeWorld, Colony, GENOME_LEN } from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  seedPop: 'populations/softbody-evolved-crawler.json',
  pop: 24, steps: 400, spawns: 3, seeds: 4, jitter: 0.06,
  food: 12, clusters: 2, clusterSpan: 0.7, senseSigma2: 0.13, eatSigma2: -1,
  relocateThresh: 0, consume: -1, regrow: -1, quiet: false,
});
const cfg = Object.freeze({
  ...DEFAULTS,
  ...(a.food >= 0 ? { FOOD: a.food } : {}),
  ...(a.clusters >= 0 ? { FOOD_CLUSTERS: a.clusters } : {}),
  ...(a.clusterSpan >= 0 ? { FOOD_CLUSTER_SPAN: a.clusterSpan } : {}),
  ...(a.senseSigma2 >= 0 ? { FOOD_SENSE_SIGMA2: a.senseSigma2 } : {}),
  ...(a.eatSigma2 >= 0 ? { FOOD_EAT_SIGMA2: a.eatSigma2 } : {}),
  ...(a.relocateThresh >= 0 ? { FOOD_RELOCATE_THRESH: a.relocateThresh } : {}),
  ...(a.consume >= 0 ? { FOOD_CONSUME: a.consume } : {}),
  ...(a.regrow >= 0 ? { FOOD_REGROW: a.regrow } : {}),
});

const seedBuf = (() => {
  const j = JSON.parse(readFileSync(a.seedPop, 'utf8'));
  if (!j.buf || j.buf.length !== GENOME_LEN) throw new Error(`${a.seedPop}: bad buf`);
  return Float32Array.from(j.buf);
})();
function gauss(rng) { let s = 0; for (let i = 0; i < 4; i++) s += rng.next(); return (s - 2); }
function perturb(buf, eps, rng) { const o = Float32Array.from(buf); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * eps; return o; }

const world = makeWorld(cfg, makeRng(7));
const devSeed = (id) => makeRng((0x51b0 ^ Math.imul(id, 2654435761)) >>> 0);

// A population of developed crawlers: one exact, the rest lightly jittered, so the
// coverage reference is a spread of real bodies rather than one clone.
function buildPop() {
  const rng = makeRng(0xC0FFEE);
  const phenos = [];
  for (let i = 0; i < a.pop; i++) {
    const buf = i === 0 ? seedBuf : perturb(seedBuf, a.jitter, rng);
    phenos.push(develop({ buf }, cfg, devSeed(i + 1)));
  }
  return phenos;
}
const PHENOS = buildPop();

const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const se = (v) => { const m = mean(v), n = v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1) / n); };
const finite = (x) => (Number.isFinite(x) ? x : 0);

// Run one colony, optionally food-ablated, optionally PLANTED on food clusters.
function runOnce(seed, ablate, planted) {
  const col = new Colony(PHENOS, world, cfg);
  col.foodAblate = ablate;
  col.spawn(makeRng(seed));
  if (planted) {
    // Translate each body so its centroid sits on a food patch (round-robin over
    // the patches), giving the obtainable-intake ceiling from a body already there.
    const S = col.S;
    for (let o = 0; o < col.P; o++) {
      const p = col.ph[o];
      let cx = 0, cy = 0;
      for (let k = 0; k < p.n; k++) { cx += col.px[o * S + k]; cy += col.py[o * S + k]; }
      cx /= p.n; cy /= p.n;
      const f = o % world.n, dx = world.fx[f] - cx, dy = world.fy[f] - cy;
      for (let k = 0; k < p.n; k++) { col.px[o * S + k] += dx; col.py[o * S + k] += dy; }
      col.startX[o] += dx; col.startY[o] += dy; col.lastCX[o] += dx; col.lastCY[o] += dy;
    }
  }
  try {
    for (let s = 0; s < a.steps; s++) { col.step(); if (s % 50 === 0) col.assertFinite(); }
    col.assertFinite('end');
  } catch { return PHENOS.map(() => 0); }
  return col.traits().map(t => finite(t.intake));
}

// Per-body mean intake over spawns×seeds for a condition; then population mean±SE.
function measure(ablate, planted) {
  const per = PHENOS.map(() => []);
  for (let s = 0; s < a.seeds; s++)
    for (let k = 0; k < a.spawns; k++) {
      const seed = (0x9000 ^ Math.imul(s * a.spawns + k + 1, 7919)) >>> 0;
      const intake = runOnce(seed, ablate, planted);
      for (let o = 0; o < PHENOS.length; o++) per[o].push(intake[o]);
    }
  const bodyMeans = per.map(mean);
  return { mean: mean(bodyMeans), se: se(bodyMeans) };
}

const f = x => x.toFixed(4);
if (!a.quiet) console.error(`[sb-uncover] food ${cfg.FOOD} in ${cfg.FOOD_CLUSTERS} clusters, span ${cfg.FOOD_CLUSTER_SPAN}, senseSigma2 ${cfg.FOOD_SENSE_SIGMA2}, relocateThresh ${cfg.FOOD_RELOCATE_THRESH}; pop ${a.pop}, ${a.spawns}×${a.seeds} spawns`);

const coverage = measure('mean', false);   // blind mover = coverage
const crawler = measure(null, false);       // gait with sense intact (pre-evolution ≈ coverage)
const planted = measure(null, true);        // ceiling: body starts ON food

console.log(`\n=== uncoverability check : food ${cfg.FOOD}/${cfg.FOOD_CLUSTERS}cl span ${cfg.FOOD_CLUSTER_SPAN} sense ${cfg.FOOD_SENSE_SIGMA2} reloc ${cfg.FOOD_RELOCATE_THRESH} ===`);
console.log(`  COVERAGE (crawler, food sense ABLATED)   intake ${f(coverage.mean)} ± ${f(coverage.se)}`);
console.log(`  CRAWLER  (crawler, food sense intact)    intake ${f(crawler.mean)} ± ${f(crawler.se)}`);
console.log(`  PLANTED  (body starts ON a food cluster) intake ${f(planted.mean)} ± ${f(planted.se)}   [obtainable ceiling]`);
const ratio = planted.mean > 1e-9 ? coverage.mean / planted.mean : 1;
console.log(`  coverage / planted = ${f(ratio)}  ->  ${ratio < 0.5 ? 'UNCOVERABLE (blind sweeping collects <50% of obtainable food; sense has headroom)' : 'COVERABLE (blind sweeping already collects the food — void task)'}`);
