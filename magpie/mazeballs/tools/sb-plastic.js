#!/usr/bin/env node
/**
 * Lifetime learning on the discrimination task — the Baldwin experiment.
 *
 *   node tools/sb-plastic.js --plastic true --toxinHarsh 3 --seed 1 --out run.json
 *
 * Six experiments established that this substrate does not evolve sensing even
 * when sensing is MANDATORY and rewarded: on the discrimination task (good vs
 * toxic food, indistinguishable except through a close-range quality sense,
 * re-randomised every episode, toxin harsh enough that sitting and covering both
 * lose in expectation) selection walks the population into a sit-and-refuse
 * attractor, selectivity never rises above chance, and blinding the quality sense
 * costs nothing. The diagnosis was a FINDABILITY VALLEY: the discriminating policy
 * provably wins and the map can wire it, but sitting is a one-mutation win that
 * pays immediately while sensing needs many coordinated mutations that pay nothing
 * until complete, so pure selection takes the cheap win and never crosses.
 *
 * This driver tests whether LIFETIME LEARNING crosses that valley. With --plastic
 * on, lib/softbody's reward-modulated Hebbian rule is live: within an episode a
 * body can DISCOVER "steer up the quality channel" ontogenetically even though the
 * genome never specified it, and selection then favours genomes that learn it
 * faster and eventually assimilates the predisposition into the developed weights
 * (Baldwin). The loop is otherwise identical to sb-evolve's discrimination path
 * (k=2 tournament, netintake fitness, displacement curriculum, the same task
 * calibration) so --plastic false reproduces the six-experiments baseline in this
 * same harness and the comparison is plastic vs non-plastic with nothing else
 * changed.
 *
 * THREE MEASUREMENTS, all on the evolved population:
 *   1. IS THE SENSE LOAD-BEARING?  Ablate the quality channel (mean-replacement)
 *      and measure the drop in net intake, and whether selectivity falls to ~0.5.
 *      This is the decisive measurement, unchanged across the whole project. It is
 *      trusted over the raw intake number, which can be heritable via kinematics
 *      with the sense still inert.
 *   2. IS LEARNING HAPPENING?  A within-life curve: does selectivity / net-rate
 *      IMPROVE across an episode as the weights adapt? A flat curve means the
 *      plasticity is inert and no learning was built.
 *   3. IS THERE ASSIMILATION (Baldwin)?  Over generations, does the FROZEN
 *      (learning-disabled, developed-weight) selectivity rise — the learned
 *      behaviour migrating into the genome's developed weights?
 *
 * Everything random comes from one seeded LCG, so a run reconstructs from --seed.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from './backend.js';
import {
  DEFAULTS, makeRng, randomGenome, perturbGenome, cloneGenome,
  develop, makeWorld, Colony,
} from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  pop: 48, gens: 20, elite: 2, eps: 0.08, steps: 500, seed: 1, evals: 6,
  // Plasticity master switch. false => the non-plastic control, byte-equivalent to
  // the sb-evolve discrimination baseline (genomes carry no plast block, the
  // Colony never learns). true => lifetime learning is live during evaluation and
  // selection acts on the LEARNED performance.
  plastic: true,
  // Curriculum: opening generations select on displacement, then netintake. The
  // discrimination task's fitness is good − H·toxic − starve.
  curriculum: 6, fitness: 'netintake',
  spawns: 1,
  // Discrimination task calibration (matches tools/sb-discrim-batch.js).
  toxicFrac: 0.5, toxinHarsh: 3.0, qualSigma2: -1, starve: 0.005,
  consume: 1.2, relocateThresh: 0.30, food: 42, clusters: 9,
  // Plasticity ranges (override DEFAULTS only if given; -1 = leave DEFAULT).
  etaMax: -1, modMax: -1, wBound: -1, winBound: -1,
  // Within-life learning curve: number of equal time windows.
  windows: 5, curveSpawns: 4,
  // Assimilation curve: run a frozen (no-learn) eval of the population every this
  // many generations to track developed-weight selectivity. 0 = only at the end.
  assimEvery: 2,
  out: '', quiet: false,
});

const cfgBase = {
  ...DEFAULTS,
  FOOD: a.food, FOOD_CLUSTERS: a.clusters,
  FOOD_CONSUME: a.consume, FOOD_RELOCATE_THRESH: a.relocateThresh,
  FOOD_TOXIC_FRAC: a.toxicFrac, FOOD_TOXIN_HARSH: a.toxinHarsh, FOOD_STARVE: a.starve,
  ...(a.qualSigma2 >= 0 ? { FOOD_QUAL_SIGMA2: a.qualSigma2 } : {}),
  ...(a.etaMax >= 0 ? { PLAST_ETA_MAX: a.etaMax } : {}),
  ...(a.modMax >= 0 ? { PLAST_MOD_MAX: a.modMax } : {}),
  ...(a.wBound >= 0 ? { PLAST_W_BOUND: a.wBound } : {}),
  ...(a.winBound >= 0 ? { PLAST_WIN_BOUND: a.winBound } : {}),
};
// The two configs that differ ONLY in whether learning is live. cfg drives
// development (so plast blocks are grown) and the plastic evaluation; cfgFrozen
// evaluates the SAME phenotypes with learning disabled, which reads out the
// developed-weight predisposition — the Baldwin assimilation quantity.
const cfg = Object.freeze({ ...cfgBase, PLASTIC: !!a.plastic });
const cfgFrozen = Object.freeze({ ...cfgBase, PLASTIC: false });

const log = (...m) => { if (!a.quiet) console.error(...m); };
const finite = (x) => (Number.isFinite(x) ? x : 0);
const mean = (v) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const median = (v) => { const s = [...v].sort((p, q) => p - q); return s[s.length >> 1]; };
const se = (v) => { const m = mean(v), n = v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1) / n); };
const f = x => x.toFixed(4);
const barOf = (s0, s1) => 2 * Math.sqrt(s0 ** 2 + s1 ** 2);

const ANOSMIA_GROSS = 0.01, SQUAT_PATH = 0.10, PATH_FLOOR = 0.04;

/* --------------------------------------------------------------- helpers */

const world = makeWorld(cfg, makeRng(7));
const devSeed = (id) => makeRng((0x51b0 ^ Math.imul(id, 2654435761)) >>> 0);
const spawnSeed = (gen) => (0x3000 ^ Math.imul(gen + 1, 40503)) >>> 0;

let nextId = 0;
function mkRandom(rng) { const g = randomGenome(rng, cfg); return { buf: g.buf, plast: g.plast, id: nextId++, pheno: null }; }
function pheno(g) { return g.pheno || (g.pheno = develop({ buf: g.buf, plast: g.plast }, cfg, devSeed(g.id))); }
// Mutation preserves the plast block (the whole inheritance channel for Baldwin).
function mutate(parent, rng) { return perturbGenome({ buf: parent.buf, plast: parent.plast }, a.eps, rng); }

/**
 * Run one shared episode of a population and return per-organism trait rows.
 * `useCfg` selects plastic vs frozen evaluation; `qualAbl` blinds the quality
 * channel. NaN-safe: isolates each organism on a throw so one non-finite body
 * cannot poison the shared food field.
 */
function runColony(phenos, seed, useCfg, qualAbl = null) {
  const col = new Colony(phenos, world, useCfg);
  col.qualAblate = qualAbl;
  col.spawn(makeRng(seed));
  try {
    for (let s = 0; s < a.steps; s++) { col.step(); if (s % 50 === 0) col.assertFinite(); }
    col.assertFinite('end');
    return col.traits();
  } catch (err) {
    log(`  [nan] shared episode threw (${String(err.message).slice(0, 50)}); isolating`);
    return phenos.map((p, i) => {
      const solo = new Colony([p], world, useCfg);
      solo.qualAblate = qualAbl;
      solo.spawn(makeRng((seed ^ Math.imul(i + 1, 2654435761)) >>> 0));
      try {
        for (let s = 0; s < a.steps; s++) { solo.step(); if (s % 50 === 0) solo.assertFinite(); }
        solo.assertFinite('end');
        return solo.traits()[0];
      } catch { return { displacement: 0, path: 0, intake: 0, netIntake: 0, gross: 0, selectivity: 0.5 }; }
    });
  }
}

function traitOf(t, mode) {
  if (mode === 'netintake') return finite(t.netIntake);
  if (mode === 'intake') return finite(t.intake);
  return finite(t.displacement);
}
const modeAt = (gen) => (gen < a.curriculum ? 'displacement' : a.fitness);

/** Evaluate a population under `mode`, averaging over `spawns` plastic episodes.
 *  Returns fitness plus spawn-mean selectivity/net for the trajectory log. */
function evalPop(phenos, gen, mode) {
  const K = Math.max(1, a.spawns), P = phenos.length;
  const fit = new Array(P).fill(0);
  const selv = new Array(P).fill(0), net = new Array(P).fill(0), disp = new Array(P).fill(0);
  for (let k = 0; k < K; k++) {
    const seed = k === 0 ? spawnSeed(gen) : ((spawnSeed(gen) ^ Math.imul(k + 1, 2654435761)) >>> 0);
    const tr = runColony(phenos, seed, cfg);
    for (let i = 0; i < P; i++) {
      fit[i] += traitOf(tr[i], mode);
      selv[i] += (tr[i].selectivity === undefined ? 0.5 : finite(tr[i].selectivity));
      net[i] += finite(tr[i].netIntake); disp[i] += finite(tr[i].displacement);
    }
  }
  for (let i = 0; i < P; i++) { fit[i] /= K; selv[i] /= K; net[i] /= K; disp[i] /= K; }
  return { fit, selv, net, disp };
}

/**
 * Held-out re-measure of a population: `evals` independent spawns under `useCfg`
 * (plastic or frozen) with optional quality ablation. Returns the population
 * descriptors the discrimination task reads — net intake, selectivity, gross, and
 * the degenerate census.
 */
function remeasure(genomes, useCfg, qualAbl = null) {
  const canon = genomes.map(pheno);
  const net = genomes.map(() => []), selv = genomes.map(() => []);
  const gross = genomes.map(() => []), path = genomes.map(() => []);
  for (let e = 0; e < a.evals; e++) {
    const tr = runColony(canon, 0x9000 + e * 7919, useCfg, qualAbl);
    for (let g = 0; g < genomes.length; g++) {
      net[g].push(finite(tr[g].netIntake));
      selv[g].push(tr[g].selectivity === undefined ? 0.5 : finite(tr[g].selectivity));
      gross[g].push(finite(tr[g].gross));
      path[g].push(finite(tr[g].path));
    }
  }
  const netMean = genomes.map((_, g) => mean(net[g]));
  const selvMean = genomes.map((_, g) => mean(selv[g]));
  const grossMean = genomes.map((_, g) => mean(gross[g]));
  const pathMean = genomes.map((_, g) => mean(path[g]));
  return {
    meanNet: mean(netMean), seNet: se(netMean),
    meanSelv: mean(selvMean), seSelv: se(selvMean),
    meanGross: mean(grossMean), seGross: se(grossMean),
    squatterFrac: pathMean.filter(p => p < SQUAT_PATH).length / genomes.length,
    anosmiaFrac: grossMean.filter(gm => gm < ANOSMIA_GROSS).length / genomes.length,
    netNegFrac: netMean.filter(nm => nm < 0).length / genomes.length,
  };
}

/**
 * Within-life learning curve. Runs plastic episodes and snapshots the cumulative
 * good/toxic/gross/intake at `windows` checkpoints, then differences them into
 * per-window selectivity and net-rate — averaged over the population and
 * `curveSpawns` spawns. If plasticity is learning to discriminate, selectivity and
 * net-rate rise from the first window to the last; a flat curve means the
 * plasticity is inert.
 */
function withinLifeCurve(genomes, useCfg) {
  const canon = genomes.map(pheno);
  const W = Math.max(2, a.windows), P = canon.length;
  const per = Math.max(1, Math.floor(a.steps / W));
  // accumulators[w] = { good, gross, net, dt } summed over spawns*organisms
  const acc = Array.from({ length: W }, () => ({ good: 0, gross: 0, net: 0 }));
  for (let s = 0; s < a.curveSpawns; s++) {
    const col = new Colony(canon, world, useCfg);
    col.spawn(makeRng(0xA000 + s * 6151));
    let pGood = new Float64Array(P), pGross = new Float64Array(P), pNet = new Float64Array(P);
    try {
      for (let w = 0; w < W; w++) {
        for (let st = 0; st < per; st++) { col.step(); if (col.steps % 50 === 0) col.assertFinite(); }
        for (let o = 0; o < P; o++) {
          const good = col.goodEaten[o], gross = col.gross[o], net = col.intake[o];
          acc[w].good += good - pGood[o];
          acc[w].gross += gross - pGross[o];
          acc[w].net += net - pNet[o];
          pGood[o] = good; pGross[o] = gross; pNet[o] = net;
        }
      }
    } catch { /* skip a non-finite spawn */ }
  }
  const dtWin = per * cfg.DT;
  return acc.map((wv, w) => ({
    window: w,
    selectivity: wv.gross > 1e-9 ? wv.good / wv.gross : 0.5,
    netRate: wv.net / (dtWin * a.curveSpawns * P),
    grossRate: wv.gross / (dtWin * a.curveSpawns * P),
  }));
}

/* ------------------------------------------------------------------- loop */

const rng = makeRng(a.seed);
let pop = Array.from({ length: a.pop }, () => mkRandom(rng));
const gen0 = pop.map(g => ({ buf: Float32Array.from(g.buf), plast: g.plast ? Float32Array.from(g.plast) : undefined, id: g.id, pheno: pheno(g) }));

log(`[sb-plastic] pop ${a.pop}, gens ${a.gens}, steps ${a.steps}, seed ${a.seed}, plastic ${!!a.plastic}` +
    `, H ${a.toxinHarsh}, toxicFrac ${a.toxicFrac}, starve ${a.starve}, consume ${a.consume}` +
    (a.plastic ? `\n           etaMax ${cfg.PLAST_ETA_MAX}, modMax ${cfg.PLAST_MOD_MAX}, trace ${cfg.PLAST_TRACE}, modTau ${cfg.PLAST_MODTAU}, wBound ${cfg.PLAST_W_BOUND}/${cfg.PLAST_WIN_BOUND}` : ''));

const traj = [];       // per-generation selection-time record
const assim = [];      // per-generation frozen vs plastic developed-weight readout

let ev = evalPop(pop.map(pheno), 0, modeAt(0));
let fit = ev.fit;

function assimPoint(gen, phenos) {
  // One held-out spawn each: plastic (learning) vs frozen (developed weights).
  const seed = 0xC000 ^ Math.imul(gen + 1, 2654435761);
  const trP = runColony(phenos, seed >>> 0, cfg);
  const trF = runColony(phenos, seed >>> 0, cfgFrozen);
  const sP = mean(trP.map(t => t.selectivity === undefined ? 0.5 : finite(t.selectivity)));
  const sF = mean(trF.map(t => t.selectivity === undefined ? 0.5 : finite(t.selectivity)));
  const nP = mean(trP.map(t => finite(t.netIntake)));
  const nF = mean(trF.map(t => finite(t.netIntake)));
  const row = { gen, selvPlastic: sP, selvFrozen: sF, netPlastic: nP, netFrozen: nF };
  assim.push(row);
  return row;
}

function record(gen, ev, mode) {
  const row = { gen, mode, best: Math.max(...ev.fit), median: median(ev.fit),
                meanSelv: mean(ev.selv), meanNet: mean(ev.net), meanDisp: mean(ev.disp) };
  traj.push(row);
  log(`  gen ${String(gen).padStart(2)} [${mode.slice(0, 4)}]  best ${row.best.toFixed(3)}  ` +
      `selv ${row.meanSelv.toFixed(3)}  net ${row.meanNet.toFixed(3)}  disp ${row.meanDisp.toFixed(3)}`);
  return row;
}
record(0, ev, modeAt(0));
if (a.assimEvery > 0) assimPoint(0, pop.map(pheno));

for (let gen = 1; gen <= a.gens; gen++) {
  const order = fit.map((f0, i) => i).sort((p, q) => fit[q] - fit[p]);
  const next = [];
  for (let e = 0; e < a.elite && e < order.length; e++) {
    const src = pop[order[e]];
    next.push({ buf: cloneGenome(src).buf, plast: src.plast ? Float32Array.from(src.plast) : undefined, id: src.id, pheno: src.pheno });
  }
  const pick = () => { const i = rng.int() % pop.length, j = rng.int() % pop.length; return fit[i] >= fit[j] ? i : j; };
  while (next.length < a.pop) {
    const child = mutate(pop[pick()], rng);
    next.push({ buf: child.buf, plast: child.plast, id: nextId++, pheno: null });
  }
  pop = next;
  const mode = modeAt(gen);
  ev = evalPop(pop.map(pheno), gen, mode);
  fit = ev.fit;
  record(gen, ev, mode);
  if (a.assimEvery > 0 && (gen % a.assimEvery === 0 || gen === a.gens)) assimPoint(gen, pop.map(pheno));
}

/* ------------------------------------------------- rigorous end comparison */

log('[remeasure] evolved population, plastic (learning) intact…');
const mP = remeasure(pop, cfg, null);
log('[remeasure] evolved population, plastic + QUALITY ablated…');
const mPQ = remeasure(pop, cfg, 'mean');
log('[remeasure] evolved population, FROZEN (developed weights, no learning)…');
const mF = remeasure(pop, cfgFrozen, null);
log('[remeasure] evolved population, FROZEN + QUALITY ablated…');
const mFQ = remeasure(pop, cfgFrozen, 'mean');
log('[remeasure] generation-0 population, frozen…');
const m0F = remeasure(gen0, cfgFrozen, null);
log('[within-life] learning curve on the evolved population (plastic vs frozen, same spawns)…');
const curve = a.plastic ? withinLifeCurve(pop, cfg) : null;
const curveFrozen = a.plastic ? withinLifeCurve(pop, cfgFrozen) : null;

// Evolved plasticity parameters, averaged over the population — did evolution
// KEEP the capacity to learn, or select it away? A near-zero mean eta means
// selection killed plasticity (learning did not pay); a retained eta with a
// load-bearing sense is the Baldwin signature.
function meanPlast(genomes) {
  const ps = genomes.map(pheno).map(p => p.plast).filter(Boolean);
  if (!ps.length) return null;
  const k = q => mean(ps.map(p => p[q]));
  return { etaSens: k('etaSens'), etaRec: k('etaRec'), modGain: k('modGain'), traceTau: k('traceTau'), modTau: k('modTau') };
}
const plastEvolved = a.plastic ? meanPlast(pop) : null;
const plastGen0 = a.plastic ? meanPlast(gen0) : null;

/* ------------------------------------------------------------------ report */

console.log(`\n=== soft-body plasticity : seed ${a.seed}  plastic ${!!a.plastic} ===`);
console.log(`pop ${a.pop}, gens ${a.gens}, steps ${a.steps}, H ${a.toxinHarsh}, toxicFrac ${a.toxicFrac}, starve ${a.starve}, consume ${a.consume}\n`);

console.log('selection-time trajectory:');
console.log('  gen  mode  best     selectivity  net       disp');
for (const r of traj)
  if (r.gen === 0 || r.gen === a.gens || r.gen % Math.max(1, Math.floor(a.gens / 10)) === 0)
    console.log(`  ${String(r.gen).padStart(3)}  ${r.mode.slice(0, 4)}  ${f(r.best)}  ${f(r.meanSelv)}       ${f(r.meanNet)}   ${f(r.meanDisp)}`);

console.log('\n1. IS THE SENSE LOAD-BEARING? — quality channel INTACT vs ABLATED on the evolved population');
console.log('   (plastic = learning live during the measurement):');
console.log(`   net intake   intact ${f(mP.meanNet)} ± ${f(mP.seNet)}   qual-ablated ${f(mPQ.meanNet)} ± ${f(mPQ.seNet)}`);
const qAblDrop = mP.meanNet - mPQ.meanNet, qAblBar = barOf(mP.seNet, mPQ.seNet);
console.log(`   selectivity  intact ${f(mP.meanSelv)}          qual-ablated ${f(mPQ.meanSelv)}   (should fall to ~0.5 if discriminating)`);
console.log(`   blinding QUALITY costs net intake ${qAblDrop >= 0 ? '+' : ''}${f(qAblDrop)} vs bar ${f(qAblBar)} -> ` +
  `${qAblDrop > qAblBar ? 'LOAD-BEARING (learning made the sense matter)' : 'incidental (sense still inert)'}`);

console.log('\n2. IS LEARNING HAPPENING? — within-life curve, PLASTIC vs FROZEN on the same spawns.');
console.log('   A rise that is present in plastic but NOT in frozen is genuine learning; a rise in');
console.log('   both is episode dynamics (food depletion), not learning.');
if (curve) {
  console.log('   window  selP     selFrozen  Δsel     netRateP  netRateFrz');
  for (let w = 0; w < curve.length; w++)
    console.log(`   ${String(w).padStart(6)}  ${f(curve[w].selectivity)}   ${f(curveFrozen[w].selectivity)}     ` +
      `${f(curve[w].selectivity - curveFrozen[w].selectivity)}   ${f(curve[w].netRate)}   ${f(curveFrozen[w].netRate)}`);
  const dSelP = curve[curve.length - 1].selectivity - curve[0].selectivity;
  const dSelF = curveFrozen[curveFrozen.length - 1].selectivity - curveFrozen[0].selectivity;
  const learnGain = dSelP - dSelF;
  console.log(`   Δselectivity within life: plastic ${dSelP >= 0 ? '+' : ''}${f(dSelP)}, frozen ${dSelF >= 0 ? '+' : ''}${f(dSelF)}, ` +
    `learning attributable ${learnGain >= 0 ? '+' : ''}${f(learnGain)}`);
  console.log(`   -> ${learnGain > 0.02 ? 'GENUINE within-life learning (plastic rises above frozen)' : 'no learning beyond episode dynamics'}`);
} else {
  console.log('   (plasticity off — no within-life learning to measure)');
}

console.log('\n3. ASSIMILATION (Baldwin) — FROZEN developed-weight readout on the evolved population,');
console.log('   and its trajectory across generations (rising frozen selectivity = assimilation):');
console.log(`   FROZEN evolved:  net ${f(mF.meanNet)} ± ${f(mF.seNet)}   selectivity ${f(mF.meanSelv)} ± ${f(mF.seSelv)}`);
console.log(`   FROZEN gen-0:    net ${f(m0F.meanNet)} ± ${f(m0F.seNet)}   selectivity ${f(m0F.meanSelv)} ± ${f(m0F.seSelv)}`);
const frSelvGain = mF.meanSelv - m0F.meanSelv, frSelvBar = barOf(mF.seSelv, m0F.seSelv);
console.log(`   frozen selectivity ascent ${frSelvGain >= 0 ? '+' : ''}${f(frSelvGain)} vs bar ${f(frSelvBar)} -> ` +
  `${frSelvGain > frSelvBar ? 'ASSIMILATED (developed weights discriminate without learning)' : 'no assimilation'}`);
console.log(`   FROZEN quality INTACT vs ABLATED: net ${f(mF.meanNet)} vs ${f(mFQ.meanNet)}  (Δ ${f(mF.meanNet - mFQ.meanNet)}, bar ${f(barOf(mF.seNet, mFQ.seNet))})`);
if (assim.length) {
  console.log('   gen   selvFrozen  selvPlastic  netFrozen  netPlastic');
  for (const r of assim)
    console.log(`   ${String(r.gen).padStart(3)}   ${f(r.selvFrozen)}      ${f(r.selvPlastic)}       ${f(r.netFrozen)}   ${f(r.netPlastic)}`);
}

console.log('\ndegenerate census on the evolved population (plastic remeasure):');
console.log(`   squatter (path < ${SQUAT_PATH}): ${(mP.squatterFrac * 100).toFixed(0)}%   ` +
  `anosmia (gross < ${ANOSMIA_GROSS}): ${(mP.anosmiaFrac * 100).toFixed(0)}%   net-negative: ${(mP.netNegFrac * 100).toFixed(0)}%`);

if (plastEvolved) {
  console.log('\nevolved plasticity parameters (mean over population) — did selection keep the capacity to learn?');
  console.log(`   etaSens  gen-0 ${f(plastGen0.etaSens)} -> evolved ${f(plastEvolved.etaSens)}   (max ${cfg.PLAST_ETA_MAX})`);
  console.log(`   etaRec   gen-0 ${f(plastGen0.etaRec)} -> evolved ${f(plastEvolved.etaRec)}`);
  console.log(`   modGain  gen-0 ${f(plastGen0.modGain)} -> evolved ${f(plastEvolved.modGain)}   (max ${cfg.PLAST_MOD_MAX})`);
  console.log(`   traceTau gen-0 ${f(plastGen0.traceTau)} -> evolved ${f(plastEvolved.traceTau)}   modTau ${f(plastGen0.modTau)} -> ${f(plastEvolved.modTau)}`);
}

if (a.out) {
  writeFileSync(a.out, JSON.stringify({
    seed: a.seed, plastic: !!a.plastic, pop: a.pop, gens: a.gens, steps: a.steps,
    task: { toxicFrac: a.toxicFrac, toxinHarsh: a.toxinHarsh, starve: a.starve, consume: a.consume, relocateThresh: a.relocateThresh },
    plast: a.plastic ? { etaMax: cfg.PLAST_ETA_MAX, modMax: cfg.PLAST_MOD_MAX, trace: cfg.PLAST_TRACE, modTau: cfg.PLAST_MODTAU, wBound: cfg.PLAST_W_BOUND, winBound: cfg.PLAST_WIN_BOUND } : null,
    traj, assim, curve, curveFrozen,
    plastEvolved, plastGen0,
    plasticIntact: mP, plasticQualAbl: mPQ, frozenIntact: mF, frozenQualAbl: mFQ, gen0Frozen: m0F,
    qualAblDrop: qAblDrop, qualAblBar: qAblBar,
    frozenSelvGain: frSelvGain, frozenSelvBar: frSelvBar,
    frozenSelvGen0: m0F.meanSelv, frozenSelvEvolved: mF.meanSelv,
  }, null, 2));
  log(`[out] ${a.out}`);
}
