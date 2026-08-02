#!/usr/bin/env node
/**
 * The gate. Can anything in this substrate be selected on?
 *
 *   node tools/sb-gate.js --genomes 24 --evals 6 --steps 600
 *
 * Three quantities, and they are NOT the same thing. Conflating them is what
 * made the original mandate for this substrate wrong:
 *
 *   1. DEVELOPMENTAL repeatability. Same genome, different developmental noise
 *      — does the same body come out? Turing patterns should score HIGH here:
 *      a reaction-diffusion pattern is an attractor set by the kinetics and the
 *      domain, not by the noise that seeded it. If this is low the substrate is
 *      unusable, because the genome does not name a body.
 *
 *   2. BEHAVIOURAL repeatability. Same body, different spawn — same behaviour?
 *      This is the incumbent's ~0.05, and it is the number that decides
 *      selectability. Truncation can only act on the between-genotype part of a
 *      trait, so at R = 0.05 selection is sorting noise 95% of the time.
 *
 *   3. GENOTYPE SENSITIVITY. Perturb the genome by eps — how far does the
 *      phenotype move? This should be HIGH. It is the amplification the whole
 *      substrate exists to get, not a hazard. It also yields the usable
 *      mutation ceiling for free: the eps at which phenotype distance
 *      saturates is the point beyond which a mutation may as well be a fresh
 *      random genome, and setting the rate above it destroys inheritance.
 *
 * Repeatability is computed exactly as tools/repeatability.js does it, so the
 * numbers are comparable with the incumbent's:
 *
 *   R = var(genotype means) / var(all observations)
 *
 * with the between-genotype term bias-corrected by var(within)/E, which matters
 * at small E — uncorrected it overstates R.
 */
import { parseArgs } from './backend.js';
import { DEFAULTS, makeRng, randomGenome, perturbGenome, develop, makeWorld, Colony }
  from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  genomes: 24, evals: 6, steps: 600, seed: 1,
  eps: '0.02,0.05,0.12,0.30,0.75,1.6', quiet: false,
});
const cfg = DEFAULTS;
const EPS = String(a.eps).split(',').map(Number);

/* Same estimator as tools/repeatability.js. obs[g][e]. */
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

const devSeed = (g, e) => makeRng(0x51b0 ^ (g * 2654435761) ^ (e * 40503));
const mkWorld = () => makeWorld(cfg, makeRng(7));

/** Run one already-developed phenotype set for `steps`, return per-organism traits. */
function runOnce(phenos, spawnSeed) {
  const col = new Colony(phenos, mkWorld(), cfg);
  col.spawn(makeRng(spawnSeed));
  for (let s = 0; s < a.steps; s++) col.step();
  return col.traits();
}

const rng = makeRng(a.seed);
const genomes = Array.from({ length: a.genomes }, () => randomGenome(rng, cfg));
const log = (...m) => { if (!a.quiet) console.error(...m); };

/* ---------------------------------------------------- 1. developmental */
// Same genome, E independent developmental noise draws. Morphology only — the
// body has to be reproducible before asking whether its behaviour is.
log('[1/3] developmental repeatability…');
const devObs = { cells: [], muscles: [], sensors: [], extent: [] };
for (let g = 0; g < a.genomes; g++) {
  for (const k of Object.keys(devObs)) devObs[k].push([]);
  for (let e = 0; e < a.evals; e++) {
    const p = develop(genomes[g], cfg, devSeed(g, e));
    for (const k of Object.keys(devObs)) devObs[k][g].push(p.stats[k]);
  }
}
const devR = Object.fromEntries(Object.keys(devObs).map(k => [k, repeatability(devObs[k])]));

/* ------------------------------------------------------- 2. behavioural */
// One canonical development per genome, then E spawns. This isolates spawn
// noise from developmental noise — measuring both at once would report their
// sum and could not say which one selection is fighting.
log('[2/3] behavioural repeatability…');
const canon = genomes.map((gm, g) => develop(gm, cfg, devSeed(g, 0)));
const behObs = { displacement: [], path: [], occupancy: [], intake: [] };
for (const k of Object.keys(behObs)) for (let g = 0; g < a.genomes; g++) behObs[k].push([]);
for (let e = 0; e < a.evals; e++) {
  const tr = runOnce(canon, 0x3000 + e * 7919);
  for (let g = 0; g < a.genomes; g++)
    for (const k of Object.keys(behObs)) behObs[k][g].push(tr[g][k] ?? 0);
}
const behR = Object.fromEntries(Object.keys(behObs).map(k => [k, repeatability(behObs[k])]));

/* -------------------------------------------------------- 3. sensitivity */
// Perturb, develop at the SAME developmental seed, and compare against the
// unperturbed twin. Holding the seed fixed is the point: any difference is the
// genome's doing, not the noise's.
log('[3/3] genotype sensitivity…');
const base = canon.map(p => p.stats);
const baseTr = runOnce(canon, 0x3000);
const rel = (x, y, s) => Math.abs(x - y) / Math.max(s, 1e-9);
const sens = [];
for (const eps of EPS) {
  const pr = makeRng(0xBEEF ^ Math.round(eps * 1e6));
  const mut = genomes.map((gm, g) => develop(perturbGenome(gm, eps, pr), cfg, devSeed(g, 0)));
  const mutTr = runOnce(mut, 0x3000);
  let dm = 0, db = 0;
  for (let g = 0; g < a.genomes; g++) {
    // Morphology distance, each term scaled by its own population spread so
    // cell counts and extents contribute comparably.
    dm += (rel(mut[g].stats.cells, base[g].cells, 20)
         + rel(mut[g].stats.muscles, base[g].muscles, 80)
         + rel(mut[g].stats.extent, base[g].extent, 0.06)) / 3;
    db += rel(mutTr[g].displacement, baseTr[g].displacement, 0.05);
  }
  sens.push({ eps, morph: dm / a.genomes, behav: db / a.genomes });
}

/* ------------------------------------------------------------- report */
const f = x => x.toFixed(4);
console.log('\n=== gate: can this substrate be selected on? ===');
console.log(`${a.genomes} genomes x ${a.evals} evaluations, ${a.steps} steps\n`);
console.log('1. DEVELOPMENTAL repeatability  (same genome, different developmental noise)');
for (const k of Object.keys(devR)) console.log(`     ${k.padEnd(12)} ${f(devR[k])}`);
console.log('\n2. BEHAVIOURAL repeatability   (same body, different spawn)');
for (const k of Object.keys(behR)) console.log(`     ${k.padEnd(12)} ${f(behR[k])}`);
console.log('     ---');
console.log(`     incumbent, for comparison: ~0.05 (hazard exposure), 0.012-0.047 (intake)`);
console.log('\n3. GENOTYPE SENSITIVITY        (perturb by eps, same developmental seed)');
console.log('     eps      morphology   behaviour');
for (const s of sens) console.log(`     ${String(s.eps).padEnd(8)} ${f(s.morph).padStart(9)}   ${f(s.behav).padStart(9)}`);

// The mutation ceiling: the smallest eps whose morphology distance is within
// 5% of the largest measured. Past that the map has saturated and a mutation
// carries no more information about its parent than a random genome would.
const top = Math.max(...sens.map(s => s.morph));
const sat = sens.find(s => s.morph >= 0.95 * top);
console.log(`\n     saturation at eps ~ ${sat ? sat.eps : 'beyond the swept range'}` +
            ` (morph distance ${f(top)} at the top of the sweep)`);
console.log('     -> mutation step sizes at or above this destroy inheritance.');
