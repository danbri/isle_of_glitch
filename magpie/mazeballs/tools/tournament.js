#!/usr/bin/env node
/**
 * Ancestral tournament for the two-species world.
 *
 * WHY THIS TOOL EXISTS, BEFORE ANY RESULT IT PRODUCES.
 *
 * `tools/score.js` measures a population against a fixed world. In a genuine
 * arms race both sides improve *relative to each other*, so absolute
 * performance against any fixed yardstick stays flat while both species are
 * getting better as fast as they can. score.js would report NO SIGNIFICANT
 * CHANGE through the entire interesting period, and that null would be an
 * artefact of the instrument, not a fact about the population.
 *
 * Progress in coevolution is only visible against *ancestors*. So:
 *
 *   1. Snapshot both populations every N generations (exportPopulation).
 *   2. Cross-evaluate every archived predator generation against every
 *      archived prey generation, on ONE fixed tournament world from ONE fixed
 *      set of spawn positions, so the only thing varying between cells is the
 *      pair of genomes.
 *   3. Report the whole matrix, and both marginals SEPARATELY.
 *
 * This is the CIAO / master-tournament construction (Cliff & Miller 1995;
 * Rosin & Belew 1997; Floreano & Nolfi 1997).
 *
 * WHY BOTH MARGINALS, SEPARATELY. A flat head-to-head series is consistent
 * with (prey improved, predators flat), (prey flat, predators degenerated),
 * (both improved equally) and (both degenerated equally). Only the two
 * cross-generational curves tell those apart, and two of them are opposite
 * results:
 *
 *   predator capability   C[i][*] — how much a generation-i predator catches
 *                         from FROZEN prey. Rising = predators improved.
 *   prey capability       C[*][j] — how much a generation-j prey is caught by
 *                         FROZEN predators. FALLING = prey improved.
 *
 * A frozen ancestor is an absolute yardstick the Red Queen cannot move, which
 * is exactly what the fixed-world score cannot supply here.
 *
 * The measured quantity, `contact`, is integrated contact-seconds between the
 * two species — one physical quantity read identically from both sides, which
 * is what puts a predator generation and a prey generation on a single axis.
 * Prey `forage` is carried alongside throughout, because "evaded the predator"
 * and "stopped eating altogether" produce the same contact number and are
 * opposite results.
 *
 *   node tools/tournament.js --generations 24 --snapEvery 4 --seed 1 \
 *        --archiveOut arch-s1.json --out tourn-s1.json
 *   node tools/tournament.js --archiveIn arch-s1.json --out tourn-s1.json
 */
import fs from 'node:fs/promises';
import { initBackend, parseArgs } from './backend.js';
import {
  EvoDevoSim, coevolveFor, coevoEpisode, coevoSyncWorld, makeWorld, makeRng, mean, sd,
  makeMods, disposeMods, keepAllBut, DEFAULTS,
} from '../lib/evodevo.js';

const args = parseArgs(process.argv.slice(2), {
  generations: 24, snapEvery: 4, seed: 1,
  pop: 192, predPop: 48, elites: 10, predElites: 6, gain: 0.5, mutation: 0.10, epoch: 1450,
  clusters: 9, clusterSigma: 0.12, senseSigma2: 0.050, relocateThresh: 0.15,
  food: 42, select: 'trunc',
  // Coevolution knobs, passed to both species.
  captureSigma2: 0.0040, coevoSenseSigma2: 0.050,
  predGain: 1.0, preyLoss: 1.5, predForage: 0,
  // Prey-side asymmetries. All are no-ops at their defaults, so the recorded
  // one-sided-arms-race configuration is reproduced by passing none of them.
  //
  //   preySpeed / predSpeed  top speed per species. The default .34 for both
  //         is the single-species value. Raising preySpeed alone is the
  //         bluntest possible way to make escape physically easy.
  //   preyIntake  multiplier on the prey's fitness return from food (energy
  //         untouched). Lowering it, or raising preyLoss, shifts prey fitness
  //         from "foraging minus predation at comparable magnitudes" toward
  //         "predation dominates" — the regime the coevolution verdict named
  //         as the reason prey never moved.
  //   preyReflex  SOLVABILITY CONTROL. Blends a hand-specified flee-the-
  //         nearest-predator policy into the prey's motor output. Run phase 2
  //         twice off ONE archive (--archiveIn), once at 0 and once at 1, and
  //         the prey marginal answers "do the physics permit escape at all"
  //         with the genomes held fixed.
  //   reflexSource  'nearest' (privileged: can this arena be escaped at all)
  //         or 'sensed' (restricted to the opponent channels the network reads:
  //         does the sense carry enough to escape by). Running both is what
  //         separates "the arena forbids evasion" from "the sensory channel is
  //         the bottleneck" from "evolution simply never finds it".
  preySpeed: 0.34, predSpeed: 0.34, preyIntake: 1,
  preyReflex: 0, reflexSigma2: 0.02, reflexSource: 'nearest', reflexMassK: 2.0,
  // Hall of fame: retain archived opponents as a fraction of each generation's
  // evaluation. A stabiliser against cycling, tested rather than assumed.
  hof: 0,
  // ---------------------------------------------------------- the search
  // Search-mechanism knobs, applied to the PREY ONLY. The predator side is
  // deliberately held at the incumbent truncation scheme in every arm: the
  // predator marginal is the thing that has always moved, so it doubles as a
  // within-run control that the arm is running at all, and varying both sides
  // at once would confound "the prey's search improved" with "the predator's
  // search got worse". All are no-ops at their defaults.
  // Evaluation noise. `--spawns k` evaluates every genome over k independent
  // episodes and selects on the mean, which divides the spawn-luck component of
  // every selected trait by k. Compute-matched comparisons want `--epoch`
  // divided by the same k, so the arm spends the same number of simulated steps
  // per generation and the only thing that changed is how they were spent.
  spawns: 1,
  preySelect: '', preyTournK: 4, preyElitism: true, preyCrossover: 0,
  preySelfAdapt: false, preyElites: 0,
  preyNoveltyK: 15, preyNoveltyWeight: 1.0,
  qdTurnBins: 4, qdOppBins: 4, qdForageBins: 3,
  // ABLATION, PHASE 2 ONLY. Blind the prey's predator channels (mean
  // replacement -- information removed, no misleading input injected) for the
  // whole tournament grid. Run off ONE archive with and without it and the
  // difference in the prey marginal is "how much of this population's contact
  // outcome is caused by its being able to see predators", measured on the
  // instrument that already carries seed-level statistics, on the same genomes,
  // the same world and the same spawns.
  //
  // Its scale comes for free: the `sensed` reference evader is computed from
  // the post-mask sensor vector, so blinding disables it. Running the ablation
  // on the reflex arm is therefore a POSITIVE CONTROL -- an arm in which
  // evasion is known to be present -- and running it on an evolved arm asks the
  // same question of a population whose answer is not known.
  //
  // `--preyBlind opponent` blinds the three predator channels; `all` blinds
  // every channel that exists in this configuration.
  preyBlind: '',
  // Tournament episode. Shorter than an evolution epoch: the contact statistic
  // saturates long before 1450 steps and the grid is O(snapshots^2).
  tsteps: 500, tseed: 90210,
  // CROSS-LINEAGE PHASE 2. `--predArchiveIn` takes the predator side of the
  // grid from a DIFFERENT archive than the prey side.
  //
  // Why it exists: an arm in which the prey's search changed is also an arm in
  // which the predators coevolved against different prey, so a fall in prey
  // vulnerability could in principle be the opponent getting worse rather than
  // the prey getting better. Holding the predator's own search fixed does not
  // settle that — its search rule is the same, but what it was trained against
  // is not. Scoring one arm's prey against the OTHER arm's predator lineage
  // measures prey quality against a fixed external standard, and running it
  // both ways round separates the two explanations completely.
  archiveIn: '', predArchiveIn: '', archiveOut: '', out: '', backend: 'auto', quiet: false, label: '',
});
const log = (...m) => { if (!args.quiet) console.error(...m); };

const { tf, pkg, backend } = await initBackend({ prefer: args.backend });
log(`[backend] ${pkg} -> ${backend}`);

const base = {
  POP: args.pop, ELITES: args.elites, EPOCH_STEPS: args.epoch, FOOD: args.food,
  GAIN: args.gain, MUTATION: args.mutation, SELECT: args.select,
  FOOD_CLUSTERS: args.clusters, FOOD_CLUSTER_SIGMA: args.clusterSigma,
  FOOD_SENSE_SIGMA2: args.senseSigma2, FOOD_RELOCATE_THRESH: args.relocateThresh,
  COEVO: true, COEVO_CAPTURE_SIGMA2: args.captureSigma2,
  COEVO_SENSE_SIGMA2: args.coevoSenseSigma2,
  COEVO_PRED_GAIN: args.predGain, COEVO_PREY_LOSS: args.preyLoss,
  COEVO_PRED_FORAGE: args.predForage,
};
// Predators are deliberately the rarer species. At equal densities every prey
// has a predator within the capture kernel by chance alone, contact saturates,
// and there is no gradient for either side to climb — a disengagement caused by
// geometry rather than by evolution, which the generation-0 pilot below
// measures directly.
const preyCfg = { ...base, COEVO_ROLE: 'prey', SPEED_MAX: args.preySpeed,
  COEVO_PREY_INTAKE: args.preyIntake,
  COEVO_PREY_REFLEX: args.preyReflex, COEVO_REFLEX_SIGMA2: args.reflexSigma2,
  COEVO_REFLEX_SOURCE: args.reflexSource, COEVO_REFLEX_MASS_K: args.reflexMassK,
  // Prey-side search variant. `--preySelect` empty leaves `SELECT` at whatever
  // `--select` gave both species, so the recorded configuration reproduces by
  // passing none of these.
  ...(args.preySelect ? { SELECT: args.preySelect } : {}),
  ...(args.preyElites ? { ELITES: args.preyElites } : {}),
  TOURN_K: args.preyTournK, ELITISM: args.preyElitism,
  CROSSOVER: args.preyCrossover, SELF_ADAPT: args.preySelfAdapt,
  NOVELTY_K: args.preyNoveltyK, NOVELTY_WEIGHT: args.preyNoveltyWeight,
  QD_TURN_BINS: args.qdTurnBins, QD_OPP_BINS: args.qdOppBins,
  QD_FORAGE_BINS: args.qdForageBins };
const predCfg = { ...base, POP: args.predPop, ELITES: args.predElites,
  COEVO_ROLE: 'predator', SPEED_MAX: args.predSpeed };

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(0);

/* --------------------------------------------------------------- phase 1 */

/** Strip the world so an imported population is scored on the tournament's
 *  layout rather than on whatever field it happened to evolve against. */
const strip = p => ({ ...p, world: undefined });

let archive, meta;
if (args.archiveIn) {
  const a = JSON.parse(await fs.readFile(args.archiveIn, 'utf8'));
  archive = a.archive; meta = a.meta;
  log(`[archive] loaded ${archive.length} snapshots from ${args.archiveIn}`);
} else {
  const prey = new EvoDevoSim({ seed: args.seed, config: preyCfg });
  const pred = new EvoDevoSim({ seed: args.seed ^ 0x5f1e, config: predCfg, world: undefined });
  await prey.initialise(); await pred.initialise();
  // One world: the prey own it (they are what depletes it), the predators are
  // synced to it every step.
  coevoSyncWorld(prey, pred);

  archive = [];
  const snap = async () => {
    archive.push({
      generation: prey.gen,
      prey: await prey.exportPopulation(), pred: await pred.exportPopulation(),
    });
  };
  await snap();                                   // generation 0: unevolved, the chance rate

  let hof = null;
  if (args.hof > 0) {
    const ghostPrey = new EvoDevoSim({ seed: 0x6110, config: preyCfg });
    const ghostPred = new EvoDevoSim({ seed: 0x6111, config: predCfg });
    await ghostPrey.initialise(); await ghostPred.initialise();
    // Draw uniformly from everything archived so far, so distant ancestors keep
    // exerting pressure instead of only the most recent one.
    const rng = makeRng(0x40F ^ args.seed);
    hof = { frac: args.hof, ghostPrey, ghostPred,
      pick: () => archive.length ? archive[Math.floor(rng.next() * archive.length)] : null };
  }

  const trace = [];
  await coevolveFor(prey, pred, args.generations, {
    hof, spawns: args.spawns,
    onGeneration: async ({ generation, prey: ps, pred: qs }) => {
      trace.push({ generation, preyContact: ps.contact, preyForage: ps.forageTop,
                   preyFit: ps.fitnessTop, predContact: qs.contact, predFit: qs.fitnessTop,
                   preyTouched: ps.touchedFrac, predTouched: qs.touchedFrac,
                   // Measured, not assumed: how much of prey fitness variance
                   // predation actually controls in this arm.
                   preyVariance: ps.varianceShare, predVariance: qs.varianceShare });
      const q = prey.qdStats();
      log(`[gen ${String(generation).padStart(3)}] contact ${ps.contact.toFixed(4)} ` +
          `preyForage ${ps.forageTop.toFixed(3)} preyFit ${ps.fitnessTop.toFixed(3)} ` +
          `predFit ${qs.fitnessTop.toFixed(3)} touched ${(ps.touchedFrac * 100).toFixed(0)}% ` +
          `predShare ${ps.varianceShare.predationShare.toFixed(2)}` +
          (q ? ` qd ${q.occupied}/${q.cells} ins ${q.inserts}` : '') + `  (${el()}s)`);
      if (generation % args.snapEvery === 0 || generation === args.generations) await snap();
    },
  });
  meta = { seed: args.seed, generations: args.generations, snapEvery: args.snapEvery,
           hof: args.hof, config: base, trace, evolveSeconds: +el(),
           search: { select: preyCfg.SELECT, elites: preyCfg.ELITES, tournK: args.preyTournK,
                     elitism: args.preyElitism, crossover: args.preyCrossover,
                     selfAdapt: args.preySelfAdapt },
           qd: prey.qdStats ? prey.qdStats() : null };
  prey.dispose(); pred.dispose();
  if (args.archiveOut) {
    await fs.writeFile(args.archiveOut, JSON.stringify({ meta, archive }));
    log(`[archive] ${archive.length} snapshots -> ${args.archiveOut} (${el()}s)`);
  }
}

/* --------------------------------------------------------------- phase 2 */

// The predator side of the grid, which is the same archive unless a
// cross-lineage run asked for another one. Snapshot generations must line up,
// or the marginals of the two runs would not be comparable row by row.
let predArchive = archive;
if (args.predArchiveIn) {
  const a = JSON.parse(await fs.readFile(args.predArchiveIn, 'utf8'));
  predArchive = a.archive;
  const g1 = archive.map(s => s.generation).join(','), g2 = predArchive.map(s => s.generation).join(',');
  if (g1 !== g2) throw new Error(`snapshot generations differ: prey [${g1}] vs pred [${g2}]`);
  log(`[archive] predator side from ${args.predArchiveIn} (${predArchive.length} snapshots)`);
}

log(`[tournament] ${archive.length}x${archive.length} grid, ${args.tsteps} steps per cell`);

// ONE world and ONE set of spawns for every cell in the grid, so a difference
// between cells is the pair of genomes and nothing else.
const tworld = makeWorld({ ...DEFAULTS, ...preyCfg }, makeRng(args.tseed ^ 0x51a7));
const preySim = new EvoDevoSim({ seed: args.tseed, config: preyCfg, world: tworld });
const predSim = new EvoDevoSim({ seed: args.tseed ^ 0x77, config: predCfg, world: tworld });
await preySim.initialise(); await predSim.initialise();
const preyInit = preySim.makeInit(), predInit = predSim.makeInit();
const foodHome = tf.tensor2d(tworld.food, [preyCfg.FOOD, 2]);

// Mean-replacement ablation of the prey's sensor vector, held fixed for every
// cell of the grid so it cannot be confounded with which pair of genomes ran.
let preyMods = null;
if (args.preyBlind) {
  const groups = args.preyBlind === 'all'
    ? ['food', 'toxin', 'wall', 'energy', 'opponent'] : [args.preyBlind];
  preyMods = makeMods(keepAllBut(groups, preySim.cfg), false, preySim.cfg,
                      makeRng(0xC0FFEE ^ args.tseed), true);
  log(`[ablate] prey ${groups.join('+')} -> population mean`);
}

const N = archive.length;
const grid = Array.from({ length: N }, () => new Array(N).fill(null));

for (let i = 0; i < N; i++) {          // predator generation
  for (let j = 0; j < N; j++) {        // prey generation
    await predSim.importPopulation(strip(predArchive[i].pred));
    await preySim.importPopulation(strip(archive[j].prey));
    // Food relocation draws from each sim's RNG during the episode; reseeding
    // here makes every cell see the identical food trajectory.
    preySim.rng = makeRng(args.tseed); predSim.rng = makeRng(args.tseed ^ 0x77);
    preySim.world = tworld; predSim.world = tworld;
    preySim.food.assign(foodHome);
    preySim.applyInit(preyInit); predSim.applyInit(predInit);
    coevoSyncWorld(preySim, predSim);
    preySim.mods = preyMods;
    await coevoEpisode(preySim, predSim, args.tsteps, 0);
    preySim.mods = null;
    const [ps, qs] = await Promise.all([preySim.coevoStats(), predSim.coevoStats()]);
    grid[i][j] = {
      predGen: predArchive[i].generation, preyGen: archive[j].generation,
      // The same physical quantity from both sides. predContact is per-predator
      // (prey caught), preyContact is per-prey (times caught); with equal
      // population sizes they carry the same total but different per-capita
      // normalisation, so both are kept.
      contact: qs.contact, preyContact: ps.contact,
      // Spread matters as much as the mean: selection can only act on contact
      // if prey differ in how much of it they suffer. A saturated cell (every
      // prey caught the same amount) is a disengagement, whatever its mean.
      preyContactSd: ps.contactSd, preyContactBest: ps.contactBottom,
      predContactSd: qs.contactSd, predContactTop: qs.contactTop,
      touched: ps.touchedFrac,
      preyForage: ps.forageTop, preyFit: ps.fitnessTop, predFit: qs.fitnessTop,
    };
  }
  log(`[tournament] predator gen ${predArchive[i].generation} done (${el()}s)`);
}
disposeMods(preyMods);
preySim.disposeInit(preyInit); predSim.disposeInit(predInit);
foodHome.dispose(); preySim.dispose(); predSim.dispose();

/* --------------------------------------------------------------- analysis */

const gens = archive.map(a => a.generation);
const cell = (i, j, k) => grid[i][j][k];

/**
 * Marginals. Each is a generation's mean performance against a FROZEN set of
 * opponents, so it is comparable across generations in a way the head-to-head
 * diagonal is not.
 *
 *   predator[i]  contact achieved by predator generation i.  Rising = better.
 *   prey[j]      contact suffered by prey generation j.      Falling = better.
 *
 * `vsAll` averages over every archived opponent; `vsAncestors` restricts to
 * opponents that existed at or before that generation, which is the strict
 * CIAO construction (no side is judged against opponents from its own future).
 */
const marg = (k, over) => {
  const out = [];
  for (let a = 0; a < N; a++) {
    const all = [], anc = [];
    for (let b = 0; b < N; b++) {
      const v = over === 'pred' ? cell(a, b, k) : cell(b, a, k);
      all.push(v);
      // Either way `a` is this side's generation and `b` the opponent's, so
      // 'ancestors' is b <= a in both directions.
      if (b <= a) anc.push(v);
    }
    out.push({ generation: gens[a], vsAll: mean(all), vsAllSd: sd(all),
               vsAncestors: mean(anc), n: all.length, nAnc: anc.length });
  }
  return out;
};

const predatorCapability = marg('contact', 'pred');
const preyVulnerability = marg('preyContact', 'prey');
const preyForageUnderThreat = marg('preyForage', 'prey');
const headToHead = gens.map((g, i) => ({ generation: g, contact: cell(i, i, 'contact'),
  preyForage: cell(i, i, 'preyForage'), preyFit: cell(i, i, 'preyFit'), predFit: cell(i, i, 'predFit') }));

/**
 * Cycling diagnostic. In a transitively improving race, a predator does BETTER
 * against older prey: contact should fall as the age gap k = i - j shrinks.
 * Rock-paper-scissors shows up as the opposite or as a non-monotone profile —
 * beating recent ancestors while losing to distant ones. Averaged over every
 * row at each age gap.
 */
const byAgeGap = [];
for (let k = 0; k < N; k++) {
  const pv = [], vv = [];
  for (let i = 0; i < N; i++) {
    if (i - k >= 0) pv.push(cell(i, i - k, 'contact'));   // predator i vs prey i-k
    if (i - k >= 0) vv.push(cell(i - k, i, 'preyContact')); // prey i vs predator i-k
  }
  byAgeGap.push({ ageGap: k, generationsBack: k * args.snapEvery,
    predatorVsOlderPrey: pv.length ? mean(pv) : null,
    preyVsOlderPredator: vv.length ? mean(vv) : null, n: pv.length });
}

/** Least-squares slope of y on generation, with the residual standard error. */
const slope = (xs, ys) => {
  const n = xs.length, mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  if (sxx < 1e-12) return { slope: 0, se: Infinity, z: 0 };
  const b = sxy / sxx;
  let sse = 0;
  for (let i = 0; i < n; i++) { const r = ys[i] - (my + b * (xs[i] - mx)); sse += r * r; }
  const se = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : Infinity;
  return { slope: b, se, z: se > 0 && Number.isFinite(se) ? b / se : 0 };
};

const trends = {
  predatorCapability: slope(gens, predatorCapability.map(r => r.vsAll)),
  preyVulnerability: slope(gens, preyVulnerability.map(r => r.vsAll)),
  preyForage: slope(gens, preyForageUnderThreat.map(r => r.vsAll)),
  headToHead: slope(gens, headToHead.map(r => r.contact)),
};

const result = {
  label: args.label || undefined,
  meta,
  // Phase-2 settings live here rather than in `meta`, because `meta` may have
  // been loaded from an archive built under a different arm — which is exactly
  // how the reflex control is run (one archive, two phase-2 passes).
  settings: { tsteps: args.tsteps, tseed: args.tseed, snapEvery: args.snapEvery,
              preySpeed: args.preySpeed, predSpeed: args.predSpeed,
              preyIntake: args.preyIntake, preyLoss: args.preyLoss,
              preyReflex: args.preyReflex, reflexSigma2: args.reflexSigma2,
              reflexSource: args.reflexSource, reflexMassK: args.reflexMassK,
              preyBlind: args.preyBlind, spawns: args.spawns,
              archiveIn: args.archiveIn || undefined,
              predArchiveIn: args.predArchiveIn || undefined,
              preySelect: preyCfg.SELECT, preyElites: preyCfg.ELITES,
              preyTournK: args.preyTournK, preyElitism: args.preyElitism,
              preyCrossover: args.preyCrossover, preySelfAdapt: args.preySelfAdapt },
  backend: `${pkg}/${backend}`, runtimeSeconds: +el(),
  generations: gens,
  matrix: grid,
  predatorCapability, preyVulnerability, preyForageUnderThreat, headToHead,
  byAgeGap, trends,
};

if (args.out) { await fs.writeFile(args.out, JSON.stringify(result, null, 2)); log(`[out] ${args.out}`); }
else process.stdout.write(JSON.stringify(result) + '\n');

const f4 = x => (x === null ? '  n/a ' : x.toFixed(4).padStart(7));
log('\n  gen | predCapability | preyVulnerability | preyForage | headToHead');
for (let a = 0; a < N; a++)
  log(`  ${String(gens[a]).padStart(3)} | ${f4(predatorCapability[a].vsAll)}        | ` +
      `${f4(preyVulnerability[a].vsAll)}           | ${f4(preyForageUnderThreat[a].vsAll)}    | ${f4(headToHead[a].contact)}`);
log(`\n  trend predatorCapability  ${trends.predatorCapability.slope.toExponential(2)} (z ${trends.predatorCapability.z.toFixed(2)})  [rising = predators improved]`);
log(`  trend preyVulnerability   ${trends.preyVulnerability.slope.toExponential(2)} (z ${trends.preyVulnerability.z.toFixed(2)})  [FALLING = prey improved]`);
log(`  trend preyForage          ${trends.preyForage.slope.toExponential(2)} (z ${trends.preyForage.z.toFixed(2)})`);
log(`  trend headToHead          ${trends.headToHead.slope.toExponential(2)} (z ${trends.headToHead.z.toFixed(2)})  [expected flat in a real race]`);
