#!/usr/bin/env node
/**
 * The first evolutionary loop this substrate has ever seen.
 *
 *   node tools/sb-evolve.js --pop 64 --gens 30 --eps 0.08 --seed 1 --out run.json
 *
 * Everything upstream of this file is measurement. `sb-gate.js` established that
 * the soft-body substrate is selectable where the incumbent was not — behaviour
 * repeats at ~0.90 against the incumbent's 0.05, and morphology stays a smooth,
 * saturating function of the genome up to ε ≈ 0.75. This is the loop that spends
 * that selectability.
 *
 * SELECTION: tournament, k = 2. This is the ONLY selection rule that has ever
 * moved anything in this project — it produced the first prey improvement in the
 * incumbent's history, beating truncation and MAP-Elites, and the 2×2 that
 * isolated it showed the operative factor is selection *intensity*, not elitism.
 * Truncation keeps the top few of a whole population on one noisy episode, which
 * is a lottery; a soft k=2 tournament averages many near-independent draws and
 * tolerates the residual evaluation noise rather than trying to abolish it.
 *
 * MUTATION: additive Gaussian on every locus (`perturbGenome`), rate `--eps`.
 * The default 0.08 is read off the gate's own sensitivity curve, not guessed:
 *
 *     eps    0.02   0.05   0.12   0.30   0.75   1.60
 *     morph  0.077  0.093  0.524  0.720  0.973  0.984   <- saturates ~0.75
 *     behav  0.273  1.598  2.121  1.603  1.507  1.291   <- peaks 0.05-0.12
 *
 * 0.08 sits in the window the gate flags: an order of magnitude below the ε≈0.75
 * ceiling where inheritance is destroyed, in the band where morphology distance
 * is still small (~0.15, the child body resembles the parent) while behavioural
 * sensitivity is near its maximum — so a mutation makes a proportionate,
 * selectable change in what the body does rather than randomising it into a
 * different animal.
 *
 * ELITISM: `--elite` genomes carried unchanged (cloned) each generation. Small
 * by default (2), so it stabilises the frontier without collapsing the
 * tournament's diversity.
 *
 * FITNESS: displacement over one episode. Locomotion is the trait the gate
 * proved is both expressed and repeatable (0.90); intake repeatability read
 * exactly 0 because nothing forages yet, so selecting on intake now would be
 * selecting on a trait with no between-genotype variance. Displacement first.
 *
 * NUMERICS: `assertFinite` stays live inside every episode. A soft body fails by
 * emitting NaN, not by scoring badly, and in a shared arena one NaN centroid
 * poisons the depleting food field for the whole population — silent corruption.
 * If an episode throws, this falls back to evaluating each organism ALONE, so
 * the culprit gets a displacement of 0 and cannot contaminate its neighbours.
 *
 * REPRODUCIBILITY: every random draw comes from one seeded LCG. Development,
 * spawns and the re-measurement seeds are all derived deterministically, so a
 * whole run reconstructs from `--seed`.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from './backend.js';
import {
  DEFAULTS, makeRng, randomGenome, perturbGenome, cloneGenome, blockCrossover,
  develop, makeWorld, Colony,
} from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  pop: 64, gens: 30, elite: 2, eps: 0.08, steps: 600,
  seed: 1, evals: 6, crossover: false, out: '', quiet: false,
});
const cfg = DEFAULTS;
const log = (...m) => { if (!a.quiet) console.error(...m); };

/* --------------------------------------------------------------- helpers */

const world = makeWorld(cfg, makeRng(7));                 // fixed, as in the gate
// Development is deterministic given (genome, dev-seed); seed it from the
// genome's identity, exactly as sb-probe.js does, so a body is a property of the
// genome and re-developing an unchanged elite yields the same body.
const devSeed = (id) => makeRng((0x51b0 ^ Math.imul(id, 2654435761)) >>> 0);
// Fresh spawn per generation: the loop never locks onto one lucky spawn config.
const spawnSeed = (gen) => (0x3000 ^ Math.imul(gen + 1, 40503)) >>> 0;

let nextId = 0;
function mkRandom(rng) { return { buf: randomGenome(rng, cfg).buf, id: nextId++, pheno: null }; }
function pheno(g) { return g.pheno || (g.pheno = develop({ buf: g.buf }, cfg, devSeed(g.id))); }

/**
 * Run one episode of a whole population in a shared arena and return per-organism
 * trait rows. NaN-safe: keeps assertFinite live, and on a throw isolates each
 * organism in its own colony so a single non-finite body scores 0 instead of
 * poisoning the shared food field for everyone.
 */
function runColony(phenos, seed, steps) {
  const col = new Colony(phenos, world, cfg);
  col.spawn(makeRng(seed));
  try {
    for (let s = 0; s < steps; s++) {
      col.step();
      if (s % 50 === 0) col.assertFinite();
    }
    col.assertFinite('end');
    return col.traits();
  } catch (err) {
    log(`  [nan] shared episode threw (${String(err.message).slice(0, 60)}); isolating`);
    return phenos.map((p, i) => {
      const solo = new Colony([p], world, cfg);
      solo.spawn(makeRng((seed ^ Math.imul(i + 1, 2654435761)) >>> 0));
      try {
        for (let s = 0; s < steps; s++) { solo.step(); if (s % 50 === 0) solo.assertFinite(); }
        solo.assertFinite('end');
        return solo.traits()[0];
      } catch {
        return { displacement: 0, path: 0, speed: 0, occupancy: 0, intake: 0 };
      }
    });
  }
}

const finite = (x) => (Number.isFinite(x) ? x : 0);
const median = (v) => { const s = [...v].sort((p, q) => p - q); return s[s.length >> 1]; };
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const se = (v) => { const m = mean(v), n = v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1) / n); };

/** Fitness = displacement, NaN scrubbed to 0 (an unfit, unselectable body). */
function fitnessOf(phenos, seed) { return runColony(phenos, seed, a.steps).map(t => finite(t.displacement)); }

/** Same repeatability estimator as sb-gate.js / repeatability.js. obs[g][e]. */
function repeatability(obs) {
  const G = obs.length, E = obs[0].length, N = G * E;
  const means = obs.map(r => r.reduce((s, v) => s + v, 0) / E);
  const grand = means.reduce((s, v) => s + v, 0) / G;
  let sw = 0;
  for (let g = 0; g < G; g++) for (let e = 0; e < E; e++) sw += (obs[g][e] - means[g]) ** 2;
  const varW = sw / Math.max(1, N - G);
  const varMeans = means.reduce((s, v) => s + (v - grand) ** 2, 0) / Math.max(1, G - 1);
  const varB = Math.max(0, varMeans - varW / E);
  const total = varB + varW;
  return total > 1e-12 ? varB / total : 0;
}

/**
 * Behavioural re-measurement, exactly as the gate does it: one canonical
 * development per genome, then `evals` independent spawns, and repeatability of
 * each behavioural trait across those spawns. Returns the per-trait R plus the
 * fraction of the population that locomotes and the mean intake — the two
 * numbers the gate flagged its 0.90 and its intake=0 as contingent on.
 */
function remeasure(genomes) {
  const canon = genomes.map(pheno);
  const keys = ['displacement', 'path', 'occupancy', 'intake'];
  const obs = Object.fromEntries(keys.map(k => [k, genomes.map(() => [])]));
  for (let e = 0; e < a.evals; e++) {
    const tr = runColony(canon, 0x9000 + e * 7919, a.steps);
    for (let g = 0; g < genomes.length; g++)
      for (const k of keys) obs[k][g].push(finite(tr[g][k]));
  }
  const R = Object.fromEntries(keys.map(k => [k, repeatability(obs[k])]));
  // Per-genome means, for the population-level descriptors.
  const dispMean = genomes.map((_, g) => mean(obs.displacement[g]));
  const intakeMean = genomes.map((_, g) => mean(obs.intake[g]));
  return {
    R,
    moveFrac: dispMean.filter(d => d > 0.02).length / genomes.length,
    meanDisp: mean(dispMean), seDisp: se(dispMean),
    meanIntake: mean(intakeMean),
    forageFrac: intakeMean.filter(v => v > 0.01).length / genomes.length,
  };
}

/* ------------------------------------------------------------------- loop */

const rng = makeRng(a.seed);
let pop = Array.from({ length: a.pop }, () => mkRandom(rng));
const gen0 = pop.map(g => ({ buf: Float32Array.from(g.buf), id: g.id, pheno: pheno(g) }));

log(`[sb-evolve] pop ${a.pop}, gens ${a.gens}, elite ${a.elite}, eps ${a.eps}, steps ${a.steps}, seed ${a.seed}` +
    `${a.crossover ? ', +blockCrossover' : ''}`);

const traj = [];
let fit = fitnessOf(pop.map(pheno), spawnSeed(0));
function record(gen, fit) {
  const row = { gen, best: Math.max(...fit), median: median(fit), mean: mean(fit),
                moveFrac: fit.filter(d => d > 0.02).length / fit.length };
  traj.push(row);
  log(`  gen ${String(gen).padStart(2)}  best ${row.best.toFixed(3)}  ` +
      `median ${row.median.toFixed(3)}  mean ${row.mean.toFixed(3)}  moving ${(row.moveFrac * 100).toFixed(0)}%`);
  return row;
}
record(0, fit);

for (let gen = 1; gen <= a.gens; gen++) {
  // rank current population by fitness, descending
  const order = fit.map((f, i) => i).sort((p, q) => fit[q] - fit[p]);
  const next = [];
  for (let e = 0; e < a.elite && e < order.length; e++) {
    const src = pop[order[e]];
    next.push({ buf: cloneGenome(src).buf, id: src.id, pheno: src.pheno });   // unchanged body carried
  }
  // tournament, k=2, mutation (optionally block crossover first)
  const pick = () => { const i = rng.int() % pop.length, j = rng.int() % pop.length; return fit[i] >= fit[j] ? i : j; };
  while (next.length < a.pop) {
    const parent = pop[pick()];
    let childBuf = parent.buf;
    if (a.crossover && rng.next() < 0.5) childBuf = blockCrossover(parent, pop[pick()], rng).buf;
    const child = perturbGenome({ buf: childBuf }, a.eps, rng);
    next.push({ buf: child.buf, id: nextId++, pheno: null });
  }
  pop = next;
  fit = fitnessOf(pop.map(pheno), spawnSeed(gen));
  record(gen, fit);
}

/* ------------------------------------------------- rigorous end comparison */
// Spawn-noise-averaged displacement and honest repeatability, gen-0 vs evolved.
log('[remeasure] generation-0 population…');
const m0 = remeasure(gen0);
log('[remeasure] evolved population…');
const mE = remeasure(pop);

/* ------------------------------------------------------------------ report */
const f = x => x.toFixed(4);
console.log(`\n=== soft-body evolution : seed ${a.seed} ===`);
console.log(`pop ${a.pop}, gens ${a.gens}, elite ${a.elite}, eps ${a.eps}, steps ${a.steps}` +
            `${a.crossover ? ', +blockCrossover' : ''}\n`);
console.log('fitness trajectory (displacement, selection-time, fresh spawn each gen):');
console.log('  gen   best    median   mean    moving');
for (const r of traj)
  if (r.gen === 0 || r.gen === a.gens || r.gen % Math.max(1, Math.floor(a.gens / 10)) === 0)
    console.log(`  ${String(r.gen).padStart(3)}  ${f(r.best)}  ${f(r.median)}  ${f(r.mean)}   ${(r.moveFrac * 100).toFixed(0)}%`);

console.log('\nrigorous end comparison (mean displacement over ' + a.evals + ' held-out spawns):');
console.log(`  gen-0     ${f(m0.meanDisp)} ± ${f(m0.seDisp)}   moving ${(m0.moveFrac * 100).toFixed(0)}%   meanIntake ${f(m0.meanIntake)}`);
console.log(`  evolved   ${f(mE.meanDisp)} ± ${f(mE.seDisp)}   moving ${(mE.moveFrac * 100).toFixed(0)}%   meanIntake ${f(mE.meanIntake)}`);
const gain = mE.meanDisp - m0.meanDisp, bar = 2 * Math.sqrt(m0.seDisp ** 2 + mE.seDisp ** 2);
console.log(`  ascent    ${gain >= 0 ? '+' : ''}${f(gain)}  vs 2·SE bar ${f(bar)}  -> ${gain > bar ? 'ASCENDS' : 'not past bar'}`);

console.log('\nbehavioural repeatability (same body, different spawn), honest re-measure:');
console.log('  trait          gen-0     evolved');
for (const k of ['displacement', 'path', 'occupancy', 'intake'])
  console.log(`  ${k.padEnd(13)}  ${f(m0.R[k])}    ${f(mE.R[k])}`);
console.log(`  (gate reported displacement 0.897 / path 0.909 / occupancy 0.897 / intake 0.000,`);
console.log(`   flagged as inflated by a bimodal population — most random genomes did not move.)`);
console.log(`  forage-expressing fraction: gen-0 ${(m0.forageFrac * 100).toFixed(0)}%  evolved ${(mE.forageFrac * 100).toFixed(0)}%`);

if (a.out) {
  writeFileSync(a.out, JSON.stringify({
    seed: a.seed, pop: a.pop, gens: a.gens, elite: a.elite, eps: a.eps, steps: a.steps,
    crossover: !!a.crossover, traj,
    gen0: m0, evolved: mE, gain, bar,
  }, null, 2));
  log(`[out] ${a.out}`);
}
