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
  develop, makeWorld, Colony, GENES, regOff,
} from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  pop: 64, gens: 30, elite: 2, eps: 0.08, steps: 600,
  seed: 1, evals: 6, crossover: false, out: '', quiet: false,
  // Which trait selection acts on. 'displacement' is the first-evolution result
  // and stays the default so that run reproduces untouched. 'intake' rewards food
  // eaten over the episode (measured: reproduces locomotion, feeding incidental).
  // 'efficiency' rewards intake per unit path (measured: selects immobile
  // patch-sitters — the degenerate solution). 'directed' pairs an intact and a
  // food-ablated episode on the SAME spawn and rewards intake_intact −
  // intake_ablated: the sensory loop's own contribution to feeding, which a body
  // that blunders into food (or sits on a patch) cannot score.
  fitness: 'displacement',
  // Curriculum: this many opening generations select on displacement, then the
  // loop switches to `fitness`. 0 = select on `fitness` from generation 1. Tests
  // "locomotion first, then intake" against direct intake selection.
  curriculum: 0,
  // Spawns averaged per genome at selection time. Food-outcome traits (intake,
  // efficiency) have ~0.03 repeatability on one episode — mostly spawn luck — so
  // selection sorts noise. Averaging K independent spawns is the research's one
  // reliable lever for raising the signal selection acts on. 1 = one episode per
  // generation, which keeps the displacement result byte-identical.
  spawns: 1,
  // Food-density overrides (default -1 = use DEFAULTS untouched). These change the
  // ARENA only, never development — food count/geometry/sensing do not enter
  // develop(), so morphology, the gate and turing are unaffected. Sparsening the
  // food is the measured lever for making directed feeding worth more than
  // incidental drift: at the 42-source default an undirected gait finds food
  // nearly as well as a directed one, so the sense has ~0 marginal intake value.
  food: -1, clusters: -1, senseSigma2: -1, eatSigma2: -1,
  // Full width of the box cluster centres are drawn from (default -1 = DEFAULTS
  // untouched = 1.72, the trunk layout). Shrinking it (e.g. 0.8) packs the few
  // sparse clusters into the arena INTERIOR so an empty-region body has a real
  // distant-food gradient to smell — the sense-range experiment's target.
  clusterSpan: -1,
  // Resource-dynamics overrides (arena only; -1 = DEFAULTS untouched). These are
  // the "punish sitting" half of the cost experiment. A held patch settles at
  // stock s* = REGROW/(REGROW+CONSUME) ≈ 0.184 on the trunk, ABOVE the default
  // relocate threshold 0.15 — so a stationary body holds a patch forever and
  // sitting is a stable free lunch that a movement cost only reinforces. Raising
  // relocateThresh above s* makes a fed-on patch deplete and relocate AWAY, so a
  // body must travel to keep eating; crossed with a movement cost, that is the
  // regime where covering blindly is expensive and aiming pays.
  relocateThresh: -1, consume: -1, regrow: -1,
  // Metabolic cost (default 0 = trunk, byte-identical). moveCost charges energy
  // per world-unit of centroid path travelled — the direct "wandering is
  // expensive" lever; cellCost charges per cell per episode-second — bigger
  // bodies cost more. With `--fitness netintake` the selected quantity is
  // intake − metabolic, so a body that eats efficiently beats one that eats by
  // covering ground. Both 0 leaves cfg identical to DEFAULTS.
  moveCost: 0, cellCost: 0,
  // Discrimination task (default off; toxicFrac 0 = trunk, byte-identical). Good
  // and toxic patches intermixed and re-randomised every spawn, distinguishable
  // only through a close-range QUALITY channel. Eating good adds, toxic subtracts
  // toxinHarsh×; a flat starve drain makes eating nothing lose to selective
  // eating. With `--fitness netintake` the selected quantity is good − H·toxic −
  // starve, so sit (eats 50/50), cover (eats everything) and anosmia (eats
  // nothing) all lose and only sense-and-select wins. toxinHarsh is the
  // calibration axis — swept to find the band where the task has a gradient
  // toward sensing rather than mass extinction or a surviving degenerate.
  toxicFrac: 0, toxinHarsh: 1.0, qualSigma2: -1, starve: 0,
  // Mutation operator. 'gaussian' is perturbGenome, the 17× baseline, and the
  // default so a trunk run reproduces byte-identical. 'signflip' is that Gaussian
  // PLUS a per-regulatory-locus sign flip at --signRate — the sign-aware operator
  // from sb-op.js, brought here to test whether a mandatory-sensing task is the
  // sign-limited regime where it finally pays. Same loop, only the operator swaps.
  op: 'gaussian', signRate: 0.01,
});
// Build the working config from DEFAULTS plus any food overrides. DEFAULTS itself
// is never mutated, so every other tool that imports it sees the trunk values.
const cfg = Object.freeze({
  ...DEFAULTS,
  ...(a.food >= 0 ? { FOOD: a.food } : {}),
  ...(a.clusters >= 0 ? { FOOD_CLUSTERS: a.clusters } : {}),
  ...(a.clusterSpan >= 0 ? { FOOD_CLUSTER_SPAN: a.clusterSpan } : {}),
  ...(a.senseSigma2 >= 0 ? { FOOD_SENSE_SIGMA2: a.senseSigma2 } : {}),
  ...(a.eatSigma2 >= 0 ? { FOOD_EAT_SIGMA2: a.eatSigma2 } : {}),
  ...(a.moveCost > 0 ? { META_MOVE_COST: a.moveCost } : {}),
  ...(a.cellCost > 0 ? { META_CELL_COST: a.cellCost } : {}),
  ...(a.relocateThresh >= 0 ? { FOOD_RELOCATE_THRESH: a.relocateThresh } : {}),
  ...(a.consume >= 0 ? { FOOD_CONSUME: a.consume } : {}),
  ...(a.regrow >= 0 ? { FOOD_REGROW: a.regrow } : {}),
  ...(a.toxicFrac > 0 ? { FOOD_TOXIC_FRAC: a.toxicFrac, FOOD_TOXIN_HARSH: a.toxinHarsh, FOOD_STARVE: a.starve } : {}),
  ...(a.qualSigma2 >= 0 ? { FOOD_QUAL_SIGMA2: a.qualSigma2 } : {}),
});
// Whether a metabolic cost is live. Off => cfg === DEFAULTS and every report
// line below is byte-identical to the trunk; on => the net-intake and squatter
// diagnostics are printed and serialised.
const hasCost = a.moveCost > 0 || a.cellCost > 0;
// Whether the discrimination task is live. Off => cfg unchanged and the
// discrimination diagnostics are neither printed nor serialised.
const hasDiscrim = a.toxicFrac > 0;
// Sign-aware operator: the regulatory (gene<-gene) loci where the flatness
// analysis measured the functional structure lives. Built exactly as sb-op.js
// builds it, through the exported regOff, so lib/softbody.js is untouched.
const REG_LOCI = (() => {
  const idx = [];
  for (let k = 0; k < GENES; k++) { const ro = regOff(k); for (let m = 0; m < GENES; m++) idx.push(ro + m); }
  return idx;
})();
if (a.op !== 'gaussian' && a.op !== 'signflip') {
  console.error(`unknown --op ${a.op}; choose gaussian|signflip`); process.exit(2);
}
// Reproduction operator. gaussian === perturbGenome (the byte-identical default);
// signflip === the same Gaussian first, then flip regulatory signs at signRate.
// A child is always a fresh buffer, drawn from the same rng, so gaussian's draw
// sequence is untouched and signflip only consumes EXTRA draws for the flips.
function mutate(childBuf, rng) {
  const buf = perturbGenome({ buf: childBuf }, a.eps, rng).buf;
  if (a.op === 'signflip') for (const i of REG_LOCI) if (rng.next() < a.signRate) buf[i] = -buf[i];
  return buf;
}
// Anosmia: a body that answers the toxin by eating almost nothing (gross intake
// below this floor) — the "refuse all food" escape property 4 must defeat.
const ANOSMIA_GROSS = 0.01;
// A "squatter" is a body that answers the movement cost by sitting still — the
// original degenerate optimum this project's first build evolved. Measured as
// mean episode path below this floor (~2.5 body diameters of total travel).
const SQUAT_PATH = 0.10;
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
function runColony(phenos, seed, steps, ablate = null, qualAbl = null) {
  const col = new Colony(phenos, world, cfg);
  col.foodAblate = ablate;
  col.qualAblate = qualAbl;
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
      solo.foodAblate = ablate;
      solo.qualAblate = qualAbl;
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

// Path floor for the efficiency fitness: a body that never moves has path ~0 and
// would otherwise score infinite efficiency for eating whatever it spawned on.
// One body-diameter of travel (~0.04) is the scale below which "efficiency" is
// really "spawned on a patch", so it is the right denominator floor.
const PATH_FLOOR = 0.04;

/** Map a full trait row to the scalar the given mode selects on. */
function traitOf(t, mode) {
  if (mode === 'intake') return finite(t.intake);
  // Net intake = intake − metabolic cost. This is the fitness the "wandering is
  // free" fix needs: a coverer pays its whole path in energy, a body that aims
  // reaches the same food for less, so the sense finally has marginal value.
  if (mode === 'netintake') return finite(t.netIntake);
  if (mode === 'efficiency') return finite(t.intake) / (finite(t.path) + PATH_FLOOR);
  return finite(t.displacement);
}

/** Run a shared episode and return full per-organism trait rows (NaN-safe). */
function rowsOf(phenos, seed) { return runColony(phenos, seed, a.steps); }

/**
 * Evaluate a population at generation `gen` under `mode`, averaging the selected
 * trait (and the diagnostic traits) over `spawns` independent spawns. The k=0
 * spawn uses spawnSeed(gen) exactly, so spawns=1 reproduces the single-episode
 * loop. Fitness for efficiency is the mean of per-spawn ratios, which is what a
 * ratio trait should average as. Returns { fit, rows } where rows are spawn-mean
 * trait rows for logging.
 */
function evalPop(phenos, gen, mode) {
  const K = Math.max(1, a.spawns), P = phenos.length;
  const fit = new Array(P).fill(0);
  const rows = Array.from({ length: P }, () => ({ displacement: 0, path: 0, occupancy: 0, intake: 0 }));
  for (let k = 0; k < K; k++) {
    const seed = k === 0 ? spawnSeed(gen) : ((spawnSeed(gen) ^ Math.imul(k + 1, 2654435761)) >>> 0);
    const tr = rowsOf(phenos, seed);
    // 'directed' needs the paired blinded episode on the same spawn: fitness is
    // how much intake the food sense is worth to this body, intact minus blind.
    const trA = mode === 'directed' ? runColony(phenos, seed, a.steps, 'mean') : null;
    for (let i = 0; i < P; i++) {
      fit[i] += mode === 'directed'
        ? Math.max(0, finite(tr[i].intake) - finite(trA[i].intake))
        : traitOf(tr[i], mode);
      rows[i].displacement += finite(tr[i].displacement);
      rows[i].path += finite(tr[i].path);
      rows[i].occupancy += finite(tr[i].occupancy);
      rows[i].intake += finite(tr[i].intake);
    }
  }
  for (let i = 0; i < P; i++) {
    fit[i] /= K;
    rows[i].displacement /= K; rows[i].path /= K; rows[i].occupancy /= K; rows[i].intake /= K;
  }
  return { fit, rows };
}

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
function remeasure(genomes, ablate = null, qualAbl = null) {
  const canon = genomes.map(pheno);
  const keys = ['displacement', 'path', 'occupancy', 'intake'];
  const obs = Object.fromEntries(keys.map(k => [k, genomes.map(() => [])]));
  // Intake-per-path (efficiency) is accumulated per spawn, then averaged: a
  // measure of directed feeding that a body cannot raise merely by crawling
  // further, because the path it crawls is the denominator.
  const eff = genomes.map(() => []);
  // Net intake (intake − metabolic cost) per spawn, the quantity a cost run
  // selects on and the one whose ablation delta is decisive. With no cost it
  // equals intake exactly.
  const net = genomes.map(() => []);
  // Discrimination readouts: gross (type-blind total eaten — anosmia when ~0)
  // and selectivity (fraction of eaten that was good — 0.5 indiscriminate).
  const gross = genomes.map(() => []);
  const selv = genomes.map(() => []);
  for (let e = 0; e < a.evals; e++) {
    const tr = runColony(canon, 0x9000 + e * 7919, a.steps, ablate, qualAbl);
    for (let g = 0; g < genomes.length; g++) {
      for (const k of keys) obs[k][g].push(finite(tr[g][k]));
      eff[g].push(finite(tr[g].intake) / (finite(tr[g].path) + PATH_FLOOR));
      net[g].push(finite(tr[g].netIntake));
      gross[g].push(finite(tr[g].gross));
      selv[g].push(tr[g].selectivity === undefined ? 0.5 : finite(tr[g].selectivity));
    }
  }
  const R = Object.fromEntries(keys.map(k => [k, repeatability(obs[k])]));
  R.efficiency = repeatability(eff);
  // Per-genome means, for the population-level descriptors.
  const dispMean = genomes.map((_, g) => mean(obs.displacement[g]));
  const intakeMean = genomes.map((_, g) => mean(obs.intake[g]));
  const effMean = genomes.map((_, g) => mean(eff[g]));
  const netMean = genomes.map((_, g) => mean(net[g]));
  const grossMean = genomes.map((_, g) => mean(gross[g]));
  const selvMean = genomes.map((_, g) => mean(selv[g]));
  const pathMean = genomes.map((_, g) => mean(obs.path[g]));
  const base = {
    R,
    moveFrac: dispMean.filter(d => d > 0.02).length / genomes.length,
    meanDisp: mean(dispMean), seDisp: se(dispMean),
    meanIntake: mean(intakeMean), seIntake: se(intakeMean),
    meanEff: mean(effMean), seEff: se(effMean),
    forageFrac: intakeMean.filter(v => v > 0.01).length / genomes.length,
  };
  // Cost-only fields, added exactly when a metabolic cost is live so a
  // trunk (no-cost) run keeps the old return shape and serialises byte-identical.
  //   squatterFrac : bodies that answer the cost by sitting — the sit-still
  //                  revival the synthesis warns about. Measured on total path,
  //                  not displacement, so a body pacing on one patch counts too.
  //   meanNet/seNet: intake net of the metabolic cost, the selected quantity.
  if (hasCost) {
    base.squatterFrac = pathMean.filter(p => p < SQUAT_PATH).length / genomes.length;
    base.meanNet = mean(netMean); base.seNet = se(netMean);
  }
  // Discrimination-only fields, added exactly when the task is live. netIntake is
  // the fitness quantity (good − H·toxic − starve); its ablation delta (quality
  // channel blinded) is THE decisive measurement. squatter/anosmia/net-negative
  // fractions are the degenerate census the sweep watches; selectivity is the
  // direct "does it discriminate" readout (0.5 indiscriminate, →1 perfect).
  if (hasDiscrim) {
    base.meanNet = mean(netMean); base.seNet = se(netMean);
    base.meanGross = mean(grossMean); base.seGross = se(grossMean);
    base.meanSelv = mean(selvMean); base.seSelv = se(selvMean);
    base.squatterFrac = pathMean.filter(p => p < SQUAT_PATH).length / genomes.length;
    base.anosmiaFrac = grossMean.filter(gm => gm < ANOSMIA_GROSS).length / genomes.length;
    base.netNegFrac = netMean.filter(nm => nm < 0).length / genomes.length;
  }
  return base;
}

/* ------------------------------------------------------------------- loop */

const rng = makeRng(a.seed);
let pop = Array.from({ length: a.pop }, () => mkRandom(rng));
const gen0 = pop.map(g => ({ buf: Float32Array.from(g.buf), id: g.id, pheno: pheno(g) }));

// Mode selection acts under at generation `gen`. A curriculum runs the opening
// `curriculum` generations on displacement, then switches to `fitness`.
const modeAt = (gen) => (gen < a.curriculum ? 'displacement' : a.fitness);

log(`[sb-evolve] pop ${a.pop}, gens ${a.gens}, elite ${a.elite}, eps ${a.eps}, steps ${a.steps}, seed ${a.seed}` +
    `, fitness ${a.fitness}, spawns ${a.spawns}${a.curriculum ? ` (curriculum: displacement for ${a.curriculum} gens)` : ''}` +
    `${a.crossover ? ', +blockCrossover' : ''}` +
    `\n           food ${cfg.FOOD} in ${cfg.FOOD_CLUSTERS} clusters, senseSigma2 ${cfg.FOOD_SENSE_SIGMA2}, eatSigma2 ${cfg.FOOD_EAT_SIGMA2}`);

const traj = [];
let ev = evalPop(pop.map(pheno), 0, modeAt(0));
let rows = ev.rows, fit = ev.fit;
function record(gen, rows, fit, mode) {
  const disp = rows.map(t => finite(t.displacement));
  const intake = rows.map(t => finite(t.intake));
  const row = { gen, mode, best: Math.max(...fit), median: median(fit), mean: mean(fit),
                meanDisp: mean(disp), meanIntake: mean(intake),
                moveFrac: disp.filter(d => d > 0.02).length / disp.length,
                forageFrac: intake.filter(v => v > 0.01).length / intake.length };
  traj.push(row);
  log(`  gen ${String(gen).padStart(2)} [${mode.slice(0, 4)}]  best ${row.best.toFixed(3)}  ` +
      `median ${row.median.toFixed(3)}  disp ${row.meanDisp.toFixed(3)}  intake ${row.meanIntake.toFixed(3)}  ` +
      `moving ${(row.moveFrac * 100).toFixed(0)}%  forage ${(row.forageFrac * 100).toFixed(0)}%`);
  return row;
}
record(0, rows, fit, modeAt(0));

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
    const child = mutate(childBuf, rng);
    next.push({ buf: child, id: nextId++, pheno: null });
  }
  pop = next;
  const mode = modeAt(gen);
  ev = evalPop(pop.map(pheno), gen, mode);
  rows = ev.rows; fit = ev.fit;
  record(gen, rows, fit, mode);
}

/* ------------------------------------------------- rigorous end comparison */
// Spawn-noise-averaged traits and honest repeatability, gen-0 vs evolved, plus
// the food-ablated re-measure of the evolved population that separates DIRECTED
// feeding from feeding that is an incidental by-product of locomotion.
log('[remeasure] generation-0 population…');
const m0 = remeasure(gen0);
log('[remeasure] evolved population, food sense intact…');
const mE = remeasure(pop);
log('[remeasure] evolved population, food sense ablated (mean-replaced)…');
const mA = remeasure(pop, 'mean');
// The decisive discrimination instrument: blind the QUALITY channel only (food
// mass intact, so the body can still find food — it just cannot tell good from
// toxic). If the intact population discriminated, this collapses net intake.
log(hasDiscrim ? '[remeasure] evolved population, QUALITY sense ablated (mean-replaced)…' : '');
const mQ = hasDiscrim ? remeasure(pop, null, 'mean') : null;

/* ------------------------------------------------------------------ report */
const f = x => x.toFixed(4);
const barOf = (s0, s1) => 2 * Math.sqrt(s0 ** 2 + s1 ** 2);
console.log(`\n=== soft-body evolution : seed ${a.seed} ===`);
console.log(`pop ${a.pop}, gens ${a.gens}, elite ${a.elite}, eps ${a.eps}, steps ${a.steps}, ` +
            `fitness ${a.fitness}, spawns ${a.spawns}${a.curriculum ? ` (curriculum ${a.curriculum})` : ''}` +
            `${a.crossover ? ', +blockCrossover' : ''}\n`);
console.log('selection-time trajectory (fresh spawn each gen):');
console.log('  gen  mode  best     median   meanDisp meanIntk moving forage');
for (const r of traj)
  if (r.gen === 0 || r.gen === a.gens || r.gen % Math.max(1, Math.floor(a.gens / 10)) === 0)
    console.log(`  ${String(r.gen).padStart(3)}  ${r.mode.slice(0, 4)}  ${f(r.best)}  ${f(r.median)}  ` +
      `${f(r.meanDisp)}  ${f(r.meanIntake)}  ${(r.moveFrac * 100).toFixed(0).padStart(4)}% ${(r.forageFrac * 100).toFixed(0).padStart(4)}%`);

console.log('\nrigorous end comparison (mean over ' + a.evals + ' held-out spawns):');
console.log(`               gen-0                 evolved`);
console.log(`  displacement ${f(m0.meanDisp)} ± ${f(m0.seDisp)}      ${f(mE.meanDisp)} ± ${f(mE.seDisp)}`);
console.log(`  intake       ${f(m0.meanIntake)} ± ${f(m0.seIntake)}      ${f(mE.meanIntake)} ± ${f(mE.seIntake)}`);
console.log(`  efficiency   ${f(m0.meanEff)} ± ${f(m0.seEff)}      ${f(mE.meanEff)} ± ${f(mE.seEff)}   (intake / (path+${PATH_FLOOR}))`);
const dispGain = mE.meanDisp - m0.meanDisp, dispBar = barOf(m0.seDisp, mE.seDisp);
const intakeGain = mE.meanIntake - m0.meanIntake, intakeBar = barOf(m0.seIntake, mE.seIntake);
const effGain = mE.meanEff - m0.meanEff, effBar = barOf(m0.seEff, mE.seEff);
console.log(`  displacement ascent ${dispGain >= 0 ? '+' : ''}${f(dispGain)} vs bar ${f(dispBar)} -> ${dispGain > dispBar ? 'ASCENDS' : 'flat'}`);
console.log(`  intake ascent       ${intakeGain >= 0 ? '+' : ''}${f(intakeGain)} vs bar ${f(intakeBar)} -> ${intakeGain > intakeBar ? 'ASCENDS' : 'flat'}`);
console.log(`  efficiency ascent   ${effGain >= 0 ? '+' : ''}${f(effGain)} vs bar ${f(effBar)} -> ${effGain > effBar ? 'ASCENDS' : 'flat'}`);

console.log('\ndirectedness — food sense INTACT vs ABLATED (mean-replaced) on the evolved population:');
console.log(`  intake       intact ${f(mE.meanIntake)} ± ${f(mE.seIntake)}   ablated ${f(mA.meanIntake)} ± ${f(mA.seIntake)}`);
const ablDrop = mE.meanIntake - mA.meanIntake, ablBar = barOf(mE.seIntake, mA.seIntake);
console.log(`  ablation costs intake ${ablDrop >= 0 ? '+' : ''}${f(ablDrop)} vs bar ${f(ablBar)} -> ${ablDrop > ablBar ? 'DIRECTED (sense is load-bearing for feeding)' : 'incidental (feeding survives blinding)'}`);
console.log(`  displacement intact ${f(mE.meanDisp)}   ablated ${f(mA.meanDisp)}   (locomotion should survive blinding)`);
console.log(`  efficiency   intact ${f(mE.meanEff)}   ablated ${f(mA.meanEff)}`);

// --- metabolic-cost diagnostics: only when a cost is live, so a displacement or
// intake run on the trunk prints byte-identically to before. ---
let netAblDrop = null, netAblBar = null;
if (hasCost) {
  console.log('\nmetabolic cost active:' +
    `  moveCost ${f(cfg.META_MOVE_COST)} (per unit path)   cellCost ${f(cfg.META_CELL_COST)} (per cell-second)`);
  console.log(`  squatter fraction (mean path < ${SQUAT_PATH}):  gen-0 ${(m0.squatterFrac * 100).toFixed(0)}%   evolved ${(mE.squatterFrac * 100).toFixed(0)}%` +
    `   [a high evolved value = the sit-still revival]`);
  console.log('\nnet intake (intake − metabolic), the quantity a cost run selects on:');
  console.log(`  net intake   gen-0 ${f(m0.meanNet)} ± ${f(m0.seNet)}      evolved ${f(mE.meanNet)} ± ${f(mE.seNet)}`);
  const netGain = mE.meanNet - m0.meanNet, netBar = barOf(m0.seNet, mE.seNet);
  console.log(`  net-intake ascent   ${netGain >= 0 ? '+' : ''}${f(netGain)} vs bar ${f(netBar)} -> ${netGain > netBar ? 'ASCENDS' : 'flat'}`);
  // THE decisive dose-response point: does blinding the food sense finally cost
  // net intake once movement is priced? intact vs mean-ablated on the evolved pop.
  netAblDrop = mE.meanNet - mA.meanNet; netAblBar = barOf(mE.seNet, mA.seNet);
  console.log('\n  DECISIVE — food sense INTACT vs ABLATED, on NET intake (the priced quantity):');
  console.log(`  net intake   intact ${f(mE.meanNet)} ± ${f(mE.seNet)}   ablated ${f(mA.meanNet)} ± ${f(mA.seNet)}`);
  console.log(`  blinding costs net intake ${netAblDrop >= 0 ? '+' : ''}${f(netAblDrop)} vs bar ${f(netAblBar)} -> ` +
    `${netAblDrop > netAblBar ? 'LOAD-BEARING (the cost cracked the wall)' : 'incidental (wall holds under this cost)'}`);
}

// --- discrimination diagnostics: only when the task is live. ---
let qAblDrop = null, qAblBar = null;
if (hasDiscrim) {
  console.log('\ndiscrimination task active:' +
    `  toxicFrac ${f(cfg.FOOD_TOXIC_FRAC)}  toxinHarsh ${f(cfg.FOOD_TOXIN_HARSH)}  ` +
    `qualSigma2 ${f(cfg.FOOD_QUAL_SIGMA2)}  starve ${f(cfg.FOOD_STARVE)}  op ${a.op}` +
    (a.op === 'signflip' ? ` signRate ${a.signRate}` : ''));
  console.log('  degenerate census on the evolved population:');
  console.log(`    squatter fraction (path < ${SQUAT_PATH}):     ${(mE.squatterFrac * 100).toFixed(0)}%`);
  console.log(`    anosmia fraction (gross < ${ANOSMIA_GROSS}):     ${(mE.anosmiaFrac * 100).toFixed(0)}%   [refuse-all-food escape]`);
  console.log(`    net-negative fraction (netIntake < 0):    ${(mE.netNegFrac * 100).toFixed(0)}%   [poisoned / not surviving]`);
  console.log(`  gross eaten (type-blind):  gen-0 ${f(m0.meanGross)} ± ${f(m0.seGross)}   evolved ${f(mE.meanGross)} ± ${f(mE.seGross)}`);
  console.log(`  selectivity (good/gross, 0.5=indiscriminate):  gen-0 ${f(m0.meanSelv)} ± ${f(m0.seSelv)}   evolved ${f(mE.meanSelv)} ± ${f(mE.seSelv)}`);
  const selvGain = mE.meanSelv - m0.meanSelv, selvBar = barOf(m0.seSelv, mE.seSelv);
  console.log(`  selectivity ascent  ${selvGain >= 0 ? '+' : ''}${f(selvGain)} vs bar ${f(selvBar)} -> ${selvGain > selvBar ? 'DISCRIMINATES' : 'flat (no discrimination)'}`);
  console.log('\nnet intake (good − H·toxic − starve), the fitness quantity:');
  console.log(`  net intake   gen-0 ${f(m0.meanNet)} ± ${f(m0.seNet)}      evolved ${f(mE.meanNet)} ± ${f(mE.seNet)}`);
  const netGain = mE.meanNet - m0.meanNet, netBar = barOf(m0.seNet, mE.seNet);
  console.log(`  net-intake ascent   ${netGain >= 0 ? '+' : ''}${f(netGain)} vs bar ${f(netBar)} -> ${netGain > netBar ? 'ASCENDS' : 'flat'}`);
  qAblDrop = mE.meanNet - mQ.meanNet; qAblBar = barOf(mE.seNet, mQ.seNet);
  console.log('\n  DECISIVE — QUALITY sense INTACT vs ABLATED, on NET intake:');
  console.log(`  net intake     intact ${f(mE.meanNet)} ± ${f(mE.seNet)}   qual-ablated ${f(mQ.meanNet)} ± ${f(mQ.seNet)}`);
  console.log(`  selectivity    intact ${f(mE.meanSelv)}   qual-ablated ${f(mQ.meanSelv)}   (should fall to ~0.5 if it was discriminating)`);
  console.log(`  blinding QUALITY costs net intake ${qAblDrop >= 0 ? '+' : ''}${f(qAblDrop)} vs bar ${f(qAblBar)} -> ` +
    `${qAblDrop > qAblBar ? 'LOAD-BEARING (sensing evolved because it had to)' : 'incidental (substrate resists sensing even when mandatory)'}`);
}

console.log('\nbehavioural repeatability (same body, different spawn), honest re-measure:');
console.log('  trait          gen-0     evolved');
for (const k of ['displacement', 'path', 'occupancy', 'intake', 'efficiency'])
  console.log(`  ${k.padEnd(13)}  ${f(m0.R[k])}    ${f(mE.R[k])}`);
console.log(`  (0.034 is the intake-repeatability baseline from the displacement-evolved population to beat.)`);
console.log(`  forage-expressing fraction: gen-0 ${(m0.forageFrac * 100).toFixed(0)}%  evolved ${(mE.forageFrac * 100).toFixed(0)}%`);

if (a.out) {
  writeFileSync(a.out, JSON.stringify({
    seed: a.seed, pop: a.pop, gens: a.gens, elite: a.elite, eps: a.eps, steps: a.steps,
    fitness: a.fitness, curriculum: a.curriculum, spawns: a.spawns, crossover: !!a.crossover,
    food: { FOOD: cfg.FOOD, FOOD_CLUSTERS: cfg.FOOD_CLUSTERS, FOOD_CLUSTER_SPAN: cfg.FOOD_CLUSTER_SPAN, FOOD_SENSE_SIGMA2: cfg.FOOD_SENSE_SIGMA2, FOOD_EAT_SIGMA2: cfg.FOOD_EAT_SIGMA2, FOOD_RELOCATE_THRESH: cfg.FOOD_RELOCATE_THRESH }, traj,
    gen0: m0, evolved: mE, ablated: mA,
    dispGain, dispBar, intakeGain, intakeBar, effGain, effBar, ablDrop, ablBar,
    // Cost fields only when a cost is live, so a trunk run's JSON is byte-identical.
    ...(hasCost ? {
      cost: { moveCost: cfg.META_MOVE_COST, cellCost: cfg.META_CELL_COST },
      squatterGen0: m0.squatterFrac, squatterEvolved: mE.squatterFrac,
      netGain: mE.meanNet - m0.meanNet, netBar: barOf(m0.seNet, mE.seNet),
      netAblDrop, netAblBar,
    } : {}),
    // Discrimination fields only when the task is live, so a trunk run's JSON is
    // byte-identical. The decisive quantity is qualAblDrop / qualAblBar.
    ...(hasDiscrim ? {
      op: a.op, signRate: a.signRate,
      discrim: { toxicFrac: cfg.FOOD_TOXIC_FRAC, toxinHarsh: cfg.FOOD_TOXIN_HARSH, qualSigma2: cfg.FOOD_QUAL_SIGMA2, starve: cfg.FOOD_STARVE },
      qualAblated: mQ,
      squatterEvolved: mE.squatterFrac, anosmiaEvolved: mE.anosmiaFrac, netNegEvolved: mE.netNegFrac,
      meanGrossEvolved: mE.meanGross, meanSelvGen0: m0.meanSelv, meanSelvEvolved: mE.meanSelv,
      meanNetGen0: m0.meanNet, meanNetEvolved: mE.meanNet, seNetGen0: m0.seNet, seNetEvolved: mE.seNet,
      qualAblDrop: qAblDrop, qualAblBar: qAblBar,
    } : {}),
  }, null, 2));
  log(`[out] ${a.out}`);
}
