#!/usr/bin/env node
/**
 * Coevolution on the soft-body substrate, with the ancestral tournament.
 *
 *   node tools/sb-coevolve.js --preyPop 24 --predPop 24 --gens 24 --snapEvery 4 \
 *        --seed 1 --steps 500 --archiveOut arch.json --out tourn.json
 *   node tools/sb-coevolve.js --archiveIn arch.json --out tourn.json          # phase 2 only
 *
 * WHY THIS TOOL, BEFORE ANY RESULT. `sb-evolve.js` selects one soft-body species
 * on a fixed objective (displacement) and it saturates — a single objective has a
 * ceiling. An open-ended ascent needs a SECOND species whose improvement raises
 * the bar continuously. Coevolution has been run on the OLD incumbent body (a
 * one-sided race) and NEVER on the new soft body. This is that experiment.
 *
 * The instrument that makes it MEASURABLE is the ancestral tournament, ported from
 * tools/tournament.js. During a genuine arms race absolute fitness is FLAT by
 * construction (both sides improve relative to each other), so a fixed yardstick
 * reports nothing. Progress is only visible against FROZEN ancestors:
 *
 *   1. Snapshot both populations every N generations.
 *   2. Cross-evaluate every archived predator generation against every archived
 *      prey generation, on ONE fixed world from ONE fixed spawn seed.
 *   3. Report BOTH marginals SEPARATELY:
 *        predatorCapability[i] — contact a gen-i predator gets from frozen prey.
 *                                RISING = predators improved.
 *        preyVulnerability[j]  — contact a gen-j prey suffers from frozen predators.
 *                                FALLING = prey improved.
 *      A flat head-to-head diagonal is consistent with (prey improved, predators
 *      flat), (both improved), (both degenerated) — only the two cross-generational
 *      curves tell them apart, and two of them are opposite results.
 *
 * THE DECISIVE MEASUREMENT is the opponent-channel ablation (`--blindPred` /
 * `--blindPrey`, mean-replacement): blind a side's opponent sense across the whole
 * grid and read the change in its marginal. If pursuit/evasion is real, blinding
 * hurts; if contact is incidental (coverage, or a wall refuge), blinding does
 * nothing. Same blind-vs-intact logic that carried the incumbent analysis.
 *
 * NUMERICS: assertFinite stays live inside every episode; a shared episode that
 * throws NaN is caught, and that pairing is scored from whatever finite traits
 * survive (finite() maps NaN to 0) rather than poisoning a whole generation.
 * REPRODUCIBILITY: every draw comes from one seeded LCG; a run reconstructs from
 * --seed. Development is seeded from each genome's stable id, so re-developing an
 * archived genome yields the same body.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { parseArgs } from './backend.js';
import {
  DEFAULTS, makeRng, randomGenome, perturbGenome, cloneGenome,
  develop, makeWorld, Colony, sbCoevoEpisode,
} from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  preyPop: 24, predPop: 24, gens: 24, snapEvery: 4,
  elite: 2, eps: 0.08, steps: 500, seed: 1,
  // Coevolution knobs. Defaults mirror the incumbent's coevolution where they
  // have an analogue; predForage 0 makes predators pure carnivores, preyLoss >
  // predGain so predation can dominate prey fitness (the balance the incumbent
  // found decisive).
  captureSigma2: -1, senseSigma2: -1, predGain: 1.0, preyLoss: 1.5,
  predForage: 0, preyIntake: 1.0,
  // Arena food (prey forage). -1 = DEFAULTS untouched.
  food: -1, clusters: -1,
  // Tournament (phase 2).
  tsteps: 500, tseed: 90210, evals: 4,
  // Ablation of the opponent channel across the whole grid (mean/const/'').
  blindPred: '', blindPrey: '',
  archiveIn: '', archiveOut: '', out: '', quiet: false,
});

const cfgBase = {
  ...DEFAULTS,
  COEVO: true,
  ...(a.captureSigma2 >= 0 ? { COEVO_CAPTURE_SIGMA2: a.captureSigma2 } : {}),
  ...(a.senseSigma2 >= 0 ? { COEVO_SENSE_SIGMA2: a.senseSigma2 } : {}),
  COEVO_PRED_GAIN: a.predGain, COEVO_PREY_LOSS: a.preyLoss,
  COEVO_PRED_FORAGE: a.predForage, COEVO_PREY_INTAKE: a.preyIntake,
  ...(a.food >= 0 ? { FOOD: a.food } : {}),
  ...(a.clusters >= 0 ? { FOOD_CLUSTERS: a.clusters } : {}),
};
const preyCfg = Object.freeze({ ...cfgBase, COEVO_ROLE: 'prey' });
const predCfg = Object.freeze({ ...cfgBase, COEVO_ROLE: 'predator' });
const log = (...m) => { if (!a.quiet) console.error(...m); };

/* --------------------------------------------------------------- helpers */

const world = makeWorld(preyCfg, makeRng(7));                // fixed, shared arena
const devSeed = (id) => makeRng((0x51b0 ^ Math.imul(id, 2654435761)) >>> 0);
const preySpawnSeed = (gen) => (0x3000 ^ Math.imul(gen + 1, 40503)) >>> 0;
const predSpawnSeed = (gen) => (0x7a00 ^ Math.imul(gen + 1, 2246822519)) >>> 0;

let nextId = 0;
const finite = (x) => (Number.isFinite(x) ? x : 0);
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const sd = (v) => { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
const se = (v) => sd(v) / Math.sqrt(Math.max(1, v.length));

function mkRandom(rng, cfg) { return { buf: randomGenome(rng, cfg).buf, id: nextId++, pheno: null }; }
function pheno(g, cfg) { return g.pheno || (g.pheno = develop({ buf: g.buf }, cfg, devSeed(g.id))); }

/**
 * One coevolutionary episode of two developed populations in the shared world.
 * Returns { preyTraits, predTraits }. NaN-safe: on a throw the traits are read
 * from whatever finite state survives rather than losing the whole evaluation.
 */
function runPair(preyPh, predPh, preySeed, predSeed, steps, { blindPrey = null, blindPred = null } = {}) {
  const prey = new Colony(preyPh, world, preyCfg);
  const pred = new Colony(predPh, world, predCfg);
  prey.oppAblate = blindPrey; pred.oppAblate = blindPred;
  prey.spawn(makeRng(preySeed));
  pred.spawn(makeRng(predSeed));
  try {
    sbCoevoEpisode(prey, pred, steps);
  } catch (err) {
    log(`  [nan] coevo episode threw (${String(err.message).slice(0, 60)})`);
  }
  return { preyTraits: prey.traits(), predTraits: pred.traits() };
}

/** Prey fitness: forage minus predation. Predator fitness: contact (prey caught). */
const preyFitOf = (t) => a.preyIntake * finite(t.intake) - a.preyLoss * finite(t.contact);
const predFitOf = (t) => finite(t.contact);

/* ------------------------------------------------------------- phase 1 */

function evolve() {
  const rng = makeRng(a.seed);
  let prey = Array.from({ length: a.preyPop }, () => mkRandom(rng, preyCfg));
  let pred = Array.from({ length: a.predPop }, () => mkRandom(rng, predCfg));

  const archive = [];
  const trace = [];

  const snapshot = (gen) => ({
    generation: gen,
    prey: prey.map(g => ({ buf: Array.from(g.buf), id: g.id })),
    pred: pred.map(g => ({ buf: Array.from(g.buf), id: g.id })),
  });

  const evalGen = (gen) => {
    const preyPh = prey.map(g => pheno(g, preyCfg));
    const predPh = pred.map(g => pheno(g, predCfg));
    const { preyTraits, predTraits } = runPair(preyPh, predPh, preySpawnSeed(gen), predSpawnSeed(gen), a.steps);
    const preyFit = preyTraits.map(preyFitOf);
    const predFit = predTraits.map(predFitOf);
    const preyContact = preyTraits.map(t => finite(t.contact));
    const predContact = predTraits.map(t => finite(t.contact));
    const preyIntakeV = preyTraits.map(t => finite(t.intake));
    const preyTouched = preyContact.filter(c => c > 1e-4).length / preyContact.length;
    const predTouched = predContact.filter(c => c > 1e-4).length / predContact.length;
    return { preyFit, predFit, preyContact, predContact, preyIntakeV,
             preyContactSd: sd(preyContact), predContactSd: sd(predContact),
             preyTouched, predTouched };
  };

  const nextGen = (popArr, fit, cfg) => {
    const order = fit.map((f, i) => i).sort((p, q) => fit[q] - fit[p]);
    const next = [];
    for (let e = 0; e < a.elite && e < order.length; e++) {
      const src = popArr[order[e]];
      next.push({ buf: cloneGenome(src).buf, id: src.id, pheno: src.pheno });
    }
    const pick = () => { const i = rng.int() % popArr.length, j = rng.int() % popArr.length; return fit[i] >= fit[j] ? i : j; };
    while (next.length < popArr.length) {
      const parent = popArr[pick()];
      const child = perturbGenome({ buf: parent.buf }, a.eps, rng);
      next.push({ buf: child.buf, id: nextId++, pheno: null });
    }
    return next;
  };

  for (let gen = 0; gen <= a.gens; gen++) {
    const ev = evalGen(gen);
    trace.push({ gen, preyContact: mean(ev.preyContact), predContact: mean(ev.predContact),
                 preyIntake: mean(ev.preyIntakeV), preyTouched: ev.preyTouched, predTouched: ev.predTouched,
                 preyContactSd: ev.preyContactSd, predContactSd: ev.predContactSd });
    if (gen % a.snapEvery === 0 || gen === a.gens) archive.push(snapshot(gen));
    log(`  gen ${String(gen).padStart(2)}  predContact ${mean(ev.predContact).toFixed(4)} ` +
        `preyContact ${mean(ev.preyContact).toFixed(4)} preyIntake ${mean(ev.preyIntakeV).toFixed(3)} ` +
        `touched pred ${(ev.predTouched * 100).toFixed(0)}%/prey ${(ev.preyTouched * 100).toFixed(0)}%`);
    if (gen === a.gens) break;
    prey = nextGen(prey, ev.preyFit, preyCfg);
    pred = nextGen(pred, ev.predFit, predCfg);
  }
  return { archive, meta: { seed: a.seed, gens: a.gens, snapEvery: a.snapEvery,
    preyPop: a.preyPop, predPop: a.predPop, eps: a.eps, elite: a.elite, steps: a.steps,
    coevo: { captureSigma2: preyCfg.COEVO_CAPTURE_SIGMA2, senseSigma2: preyCfg.COEVO_SENSE_SIGMA2,
             predGain: a.predGain, preyLoss: a.preyLoss, predForage: a.predForage, preyIntake: a.preyIntake,
             food: preyCfg.FOOD, clusters: preyCfg.FOOD_CLUSTERS }, trace } };
}

/* ------------------------------------------------------------- phase 2 */

/** Develop an archived population (array of {buf,id}) under cfg. */
function developArchived(pop, cfg) {
  return pop.map(g => develop({ buf: Float32Array.from(g.buf) }, cfg, devSeed(g.id)));
}

/**
 * The N x N grid. Each cell runs one fixed-seed episode of predator-gen-i vs
 * prey-gen-j and records the contact each side accrues. Ablation, if set, blinds
 * the named side's opponent channel for EVERY cell, so a difference between the
 * ablated grid and the intact one is caused only by the sense being removed.
 */
function tournament(archive, opts = {}) {
  const N = archive.length;
  const gens = archive.map(s => s.generation);
  const preyPh = archive.map(s => developArchived(s.prey, preyCfg));
  const predPh = archive.map(s => developArchived(s.pred, predCfg));
  const grid = Array.from({ length: N }, () => new Array(N).fill(null));
  for (let i = 0; i < N; i++) {           // predator generation
    for (let j = 0; j < N; j++) {         // prey generation
      // Average over `evals` fixed spawns so a cell is not one lucky layout.
      const pc = [], vc = [], fg = [];
      for (let e = 0; e < a.evals; e++) {
        const ps = (a.tseed ^ Math.imul(e + 1, 2654435761)) >>> 0;
        const qs = (a.tseed ^ 0x77 ^ Math.imul(e + 1, 40503)) >>> 0;
        const { preyTraits, predTraits } = runPair(preyPh[j], predPh[i], ps, qs, a.tsteps, opts);
        pc.push(mean(predTraits.map(t => finite(t.contact))));
        vc.push(mean(preyTraits.map(t => finite(t.contact))));
        fg.push(mean(preyTraits.map(t => finite(t.intake))));
      }
      grid[i][j] = { predGen: gens[i], preyGen: gens[j],
        predContact: mean(pc), preyContact: mean(vc), preyForage: mean(fg) };
    }
    log(`  [tournament] predator gen ${gens[i]} done`);
  }
  return { N, gens, grid };
}

/** Marginals: each generation's mean against every FROZEN opponent (vsAll) and
 *  against ancestors only (b<=a, strict CIAO). `over`='pred' rows are predator
 *  generations, 'prey' rows are prey generations. */
function marginal(grid, N, gens, key, over) {
  const out = [];
  for (let x = 0; x < N; x++) {
    const all = [], anc = [];
    for (let y = 0; y < N; y++) {
      const v = over === 'pred' ? grid[x][y][key] : grid[y][x][key];
      all.push(v);
      if (y <= x) anc.push(v);
    }
    out.push({ generation: gens[x], vsAll: mean(all), vsAllSd: sd(all), vsAncestors: mean(anc) });
  }
  return out;
}

/** Least-squares slope of y on x with residual SE and z. */
function slope(xs, ys) {
  const n = xs.length, mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  if (sxx < 1e-12) return { slope: 0, se: Infinity, z: 0 };
  const b = sxy / sxx;
  let sse = 0;
  for (let i = 0; i < n; i++) { const r = ys[i] - (my + b * (xs[i] - mx)); sse += r * r; }
  const s = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : Infinity;
  return { slope: b, se: s, z: s > 0 && Number.isFinite(s) ? b / s : 0 };
}

/** Age-gap (cycling) diagnostic: predator i vs prey i-k, averaged over rows. */
function byAgeGap(grid, N, gens) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const pv = [], vv = [];
    for (let i = 0; i < N; i++) if (i - k >= 0) {
      pv.push(grid[i][i - k].predContact);      // predator i vs older prey i-k
      vv.push(grid[i - k][i].preyContact);       // prey i vs older predator i-k
    }
    out.push({ ageGap: k, generationsBack: k * a.snapEvery,
      predatorVsOlderPrey: pv.length ? mean(pv) : null,
      preyVsOlderPredator: vv.length ? mean(vv) : null, n: pv.length });
  }
  return out;
}

function analyse(t, label) {
  const { N, gens, grid } = t;
  const predatorCapability = marginal(grid, N, gens, 'predContact', 'pred');
  const preyVulnerability = marginal(grid, N, gens, 'preyContact', 'prey');
  const preyForageUnderThreat = marginal(grid, N, gens, 'preyForage', 'prey');
  const headToHead = gens.map((g, i) => ({ generation: g, predContact: grid[i][i].predContact,
    preyContact: grid[i][i].preyContact, preyForage: grid[i][i].preyForage }));
  const trends = {
    predatorCapability: slope(gens, predatorCapability.map(r => r.vsAll)),
    preyVulnerability: slope(gens, preyVulnerability.map(r => r.vsAll)),
    preyForage: slope(gens, preyForageUnderThreat.map(r => r.vsAll)),
    headToHead: slope(gens, headToHead.map(r => r.predContact)),
  };
  return { label, generations: gens, matrix: grid, predatorCapability, preyVulnerability,
           preyForageUnderThreat, headToHead, byAgeGap: byAgeGap(grid, N, gens), trends };
}

/* ------------------------------------------------------------------ run */

let archive, meta;
if (a.archiveIn) {
  const loaded = JSON.parse(readFileSync(a.archiveIn, 'utf8'));
  archive = loaded.archive; meta = loaded.meta;
  log(`[archive] loaded ${archive.length} snapshots from ${a.archiveIn}`);
} else {
  log(`[sb-coevolve] prey ${a.preyPop}, pred ${a.predPop}, gens ${a.gens}, snapEvery ${a.snapEvery}, ` +
      `eps ${a.eps}, steps ${a.steps}, seed ${a.seed}`);
  log(`             captureSigma2 ${preyCfg.COEVO_CAPTURE_SIGMA2}, senseSigma2 ${preyCfg.COEVO_SENSE_SIGMA2}, ` +
      `predGain ${a.predGain}, preyLoss ${a.preyLoss}, predForage ${a.predForage}, food ${preyCfg.FOOD}`);
  const r = evolve();
  archive = r.archive; meta = r.meta;
  if (a.archiveOut) { writeFileSync(a.archiveOut, JSON.stringify({ meta, archive })); log(`[archive] ${archive.length} snapshots -> ${a.archiveOut}`); }
}

log(`[tournament] ${archive.length}x${archive.length} grid, ${a.tsteps} steps, ${a.evals} spawns per cell`);
const intact = analyse(tournament(archive), 'intact');

// Decisive ablation passes, off the SAME archive, if requested.
let predBlind = null, preyBlind = null;
if (a.blindPred) { log(`[ablate] predator opponent channel -> ${a.blindPred}`); predBlind = analyse(tournament(archive, { blindPred: a.blindPred }), `blindPred:${a.blindPred}`); }
if (a.blindPrey) { log(`[ablate] prey opponent channel -> ${a.blindPrey}`); preyBlind = analyse(tournament(archive, { blindPrey: a.blindPrey }), `blindPrey:${a.blindPrey}`); }

/* --------------------------------------------------------------- report */
const f4 = (x) => (x === null || x === undefined ? '  n/a ' : x.toFixed(4).padStart(7));
log('\n  gen | predCapability | preyVulnerability | preyForage | h2h predC');
for (let i = 0; i < intact.generations.length; i++)
  log(`  ${String(intact.generations[i]).padStart(3)} | ${f4(intact.predatorCapability[i].vsAll)}        | ` +
      `${f4(intact.preyVulnerability[i].vsAll)}           | ${f4(intact.preyForageUnderThreat[i].vsAll)}    | ${f4(intact.headToHead[i].predContact)}`);
log(`\n  trend predatorCapability  ${intact.trends.predatorCapability.slope.toExponential(2)} (z ${intact.trends.predatorCapability.z.toFixed(2)})  [RISING = predators improved]`);
log(`  trend preyVulnerability   ${intact.trends.preyVulnerability.slope.toExponential(2)} (z ${intact.trends.preyVulnerability.z.toFixed(2)})  [FALLING = prey improved]`);
log(`  trend preyForage          ${intact.trends.preyForage.slope.toExponential(2)} (z ${intact.trends.preyForage.z.toFixed(2)})`);
log(`  trend headToHead          ${intact.trends.headToHead.slope.toExponential(2)} (z ${intact.trends.headToHead.z.toFixed(2)})  [expected flat in a real race]`);

const lastPredCap = (r) => r.predatorCapability[r.predatorCapability.length - 1].vsAll;
const lastPreyVuln = (r) => r.preyVulnerability[r.preyVulnerability.length - 1].vsAll;
if (predBlind) {
  const di = lastPredCap(intact), db = lastPredCap(predBlind);
  log(`\n  [ablation] final-gen predatorCapability  intact ${di.toFixed(4)}  blinded ${db.toFixed(4)}  ` +
      `drop ${(di - db).toFixed(4)} -> ${di - db > 0 ? 'PURSUIT load-bearing' : 'incidental'}`);
}
if (preyBlind) {
  const vi = lastPreyVuln(intact), vb = lastPreyVuln(preyBlind);
  log(`  [ablation] final-gen preyVulnerability    intact ${vi.toFixed(4)}  blinded ${vb.toFixed(4)}  ` +
      `rise ${(vb - vi).toFixed(4)} -> ${vb - vi > 0 ? 'EVASION load-bearing (blinding makes prey more caught)' : 'incidental'}`);
}

const result = { meta, settings: { tsteps: a.tsteps, tseed: a.tseed, evals: a.evals,
  blindPred: a.blindPred || undefined, blindPrey: a.blindPrey || undefined },
  intact, predBlind, preyBlind };
if (a.out) { writeFileSync(a.out, JSON.stringify(result, null, 2)); log(`[out] ${a.out}`); }
