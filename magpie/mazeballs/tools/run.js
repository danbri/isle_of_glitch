#!/usr/bin/env node
/**
 * One headless run: evolve a population, then run the full ablation suite.
 *
 *   node tools/run.js --generations 20 --gain 0.5 --seed 1
 *   node tools/run.js --generations 30 --gain 2.0 --seed 1 --out gain2.json
 *   node tools/run.js --import saved.json --generations 0     # diagnose a saved population
 *
 * Everything is seeded, so the same --seed and settings reproduce the same run.
 * Writes a JSON result to --out, and a one-line summary to stderr so it stays
 * out of the way when the JSON is being piped.
 */
import fs from 'node:fs/promises';
import { initBackend, parseArgs } from './backend.js';
import { EvoDevoSim, diagnose, evolveFor, coevolveFor, coevoSyncWorld } from '../lib/evodevo.js';

const args = parseArgs(process.argv.slice(2), {
  generations: 10, seed: 1, gain: 0.5, mutation: 0.10,
  steps: 600, restarts: 3, elites: 10, pop: 192,
  consume: 0.40, regrow: 0.09, epoch: 1450,
  select: 'trunc', niches: 10, spawns: 1, novk: 15, novweight: 1.0,
  out: '', import: '', backend: 'auto', quiet: false, label: '',
  // Environment-mandate knobs. Defaults match lib/evodevo.js DEFAULTS (the
  // accepted 9-cluster + relocate-on-depletion world); pass --clusters 0
  // --relocateThresh 0 to reproduce the original uniform, non-depleting-away
  // world for a side-by-side comparison.
  clusters: 9, clusterSigma: 0.12, senseSigma2: 0.050, relocateThresh: 0.15,
  // Difficulty ramp: reseeds the world every generation, linearly interpolating
  // FOOD_CLUSTERS from curClustersStart to curClustersEnd. 0 (default) disables
  // the ramp and uses the static `clusters` value for the whole run.
  curClustersStart: 0, curClustersEnd: 0,
  // Food source count. DEFAULTS.FOOD is fixed at 42 regardless of POP, so a
  // POP sweep that does not also touch this is silently changing food density
  // per agent (42/POP), not just population size — a POP-scale experiment
  // that wants to isolate "more genomes per selection event" from "more
  // mouths sharing the same food" needs this to scale with --pop.
  food: 42,
  // Central-place foraging (off at cpStrength 0, which is the default and is a
  // no-op). cpStrength is the dose: the fraction of intake that stops paying
  // where it is found and must be carried back to the nest at the origin.
  // cpNestSensor is the control arm — it hands the agent the bearing home, so
  // the return trip becomes taxis rather than path integration.
  cpStrength: 0, cpMult: 2.5, cpRadius: 0.14, cpDecay: 0.06, cpDeposit: 6.0,
  cpNestSensor: false,
  // Two-species world (off by default). With --coevo the run coevolves a prey
  // and a predator population and then diagnoses the PREY.
  //
  // Note what this measurement is and is not. diagnose() runs the prey against
  // a fixed world with no predators present, so the opponent channels read
  // zero throughout and the score is prey foraging capability measured against
  // a yardstick the arms race cannot move. That is deliberate: it is exactly
  // the measurement the coevolution design predicts will be flat while the
  // ancestral tournament (tools/tournament.js) detects change, and reporting
  // the two side by side is the point.
  coevo: false, predPop: 48, predElites: 6,
  captureSigma2: 0.0012, coevoSenseSigma2: 0.050,
  predGain: 1.0, preyLoss: 1.0, predForage: 0,
  // Prey-side asymmetries; all no-ops at their defaults. See tools/tournament.js
  // for what each is for — this is the same arm description, and the two tools
  // must be given identical values to be describing the same world.
  preySpeed: 0.34, predSpeed: 0.34, preyIntake: 1,
  preyReflex: 0, reflexSigma2: 0.02,
});

const log = (...m) => { if (!args.quiet) console.error(...m); };

const { pkg, backend } = await initBackend({ prefer: args.backend });
log(`[backend] ${pkg} → ${backend}`);

const sim = new EvoDevoSim({
  seed: args.seed,
  config: {
    POP: args.pop, ELITES: args.elites, EPOCH_STEPS: args.epoch,
    FOOD: args.food,
    FOOD_CONSUME: args.consume, FOOD_REGROW: args.regrow,
    GAIN: args.gain, MUTATION: args.mutation,
    FOOD_CLUSTERS: args.clusters, FOOD_CLUSTER_SIGMA: args.clusterSigma,
    FOOD_SENSE_SIGMA2: args.senseSigma2, FOOD_RELOCATE_THRESH: args.relocateThresh,
    SELECT: args.select, NICHES: args.niches, NOVELTY_K: args.novk, NOVELTY_WEIGHT: args.novweight,
    CP_STRENGTH: args.cpStrength, CP_NEST_MULT: args.cpMult, CP_NEST_RADIUS: args.cpRadius,
    CP_CARRY_DECAY: args.cpDecay, CP_DEPOSIT_RATE: args.cpDeposit,
    CP_NEST_SENSOR: args.cpNestSensor,
    ...(args.coevo ? {
      COEVO: true, COEVO_ROLE: 'prey',
      COEVO_CAPTURE_SIGMA2: args.captureSigma2, COEVO_SENSE_SIGMA2: args.coevoSenseSigma2,
      COEVO_PRED_GAIN: args.predGain, COEVO_PREY_LOSS: args.preyLoss,
      COEVO_PRED_FORAGE: args.predForage,
      SPEED_MAX: args.preySpeed, COEVO_PREY_INTAKE: args.preyIntake,
      COEVO_PREY_REFLEX: args.preyReflex, COEVO_REFLEX_SIGMA2: args.reflexSigma2,
    } : {}),
  },
});
await sim.initialise();

const predator = args.coevo
  ? new EvoDevoSim({
      seed: args.seed ^ 0x5f1e,
      config: {
        POP: args.predPop, ELITES: args.predElites, EPOCH_STEPS: args.epoch, FOOD: args.food,
        FOOD_CONSUME: args.consume, FOOD_REGROW: args.regrow,
        GAIN: args.gain, MUTATION: args.mutation,
        FOOD_CLUSTERS: args.clusters, FOOD_CLUSTER_SIGMA: args.clusterSigma,
        FOOD_SENSE_SIGMA2: args.senseSigma2, FOOD_RELOCATE_THRESH: args.relocateThresh,
        SELECT: args.select, NICHES: args.niches,
        COEVO: true, COEVO_ROLE: 'predator',
        COEVO_CAPTURE_SIGMA2: args.captureSigma2, COEVO_SENSE_SIGMA2: args.coevoSenseSigma2,
        COEVO_PRED_GAIN: args.predGain, COEVO_PREY_LOSS: args.preyLoss,
        COEVO_PRED_FORAGE: args.predForage, SPEED_MAX: args.predSpeed,
      },
    })
  : null;
if (predator) { await predator.initialise(); coevoSyncWorld(sim, predator); }

if (args.import) {
  const p = JSON.parse(await fs.readFile(args.import, 'utf8'));
  const r = await sim.importPopulation(p);
  log(`[import] generation ${r.generation}, gain ${r.gain}` + (r.worldRestored ? ', field layout restored' : ''));
  // An imported file carries its own gain; a explicit --gain still wins.
  if (process.argv.some(a => a.startsWith('--gain'))) { sim.gain = args.gain; await sim.develop(); }
}

const curriculum = args.curClustersStart > 0 || args.curClustersEnd > 0
  ? (g, gens) => ({
      FOOD_CLUSTERS: Math.round(args.curClustersStart +
        (args.curClustersEnd - args.curClustersStart) * (gens > 1 ? g / (gens - 1) : 1)),
    })
  : null;

const t0 = Date.now();
if (args.coevo) {
  await coevolveFor(sim, predator, args.generations, {
    onGeneration: ({ generation, prey: ps, pred: qs }) =>
      log(`[gen ${String(generation).padStart(3)}] contact ${ps.contact.toFixed(4)} ` +
          `preyForage ${ps.forageTop.toFixed(3)} preyFit ${ps.fitnessTop.toFixed(3)} ` +
          `predFit ${qs.fitnessTop.toFixed(3)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`),
  });
} else {
  await evolveFor(sim, args.generations, {
    spawns: args.spawns,
    onGeneration: ({ generation, best }) =>
      log(`[gen ${String(generation).padStart(3)}] best ${best.toFixed(3)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`),
    curriculum,
  });
}

log(`[diagnose] ${args.restarts} restarts x ${args.steps} steps x 7 conditions…`);
const report = await diagnose(sim, { steps: args.steps, restarts: args.restarts, yieldEvery: 0 });

const result = {
  label: args.label || undefined,
  settings: {
    seed: args.seed, generations: args.generations, gain: args.gain, mutation: args.mutation,
    pop: args.pop, elites: args.elites, epoch: args.epoch,
    consume: args.consume, regrow: args.regrow, steps: args.steps, restarts: args.restarts,
    clusters: args.clusters, clusterSigma: args.clusterSigma, senseSigma2: args.senseSigma2,
    relocateThresh: args.relocateThresh,
    curClustersStart: args.curClustersStart, curClustersEnd: args.curClustersEnd,
    select: args.select, niches: args.niches, spawns: args.spawns,
    cpStrength: args.cpStrength, cpMult: args.cpMult, cpRadius: args.cpRadius,
    cpDecay: args.cpDecay, cpDeposit: args.cpDeposit, cpNestSensor: args.cpNestSensor,
    coevo: args.coevo, predPop: args.predPop, captureSigma2: args.captureSigma2,
    predGain: args.predGain, preyLoss: args.preyLoss, predForage: args.predForage,
  },
  runtimeSeconds: +((Date.now() - t0) / 1000).toFixed(1),
  backend: `${pkg}/${backend}`,
  report,
};

if (args.out) { await fs.writeFile(args.out, JSON.stringify(result, null, 2)); log(`[out] ${args.out}`); }
else process.stdout.write(JSON.stringify(result) + '\n');

const t = report.table.find(r => r.key === 'baseline');
log(`[done] gen ${report.generation} · top25 ${t.top.toFixed(3)} · railed ${(report.network.saturation * 100).toFixed(1)}% ` +
    `· blind Δ ${(report.drops.blind * -100).toFixed(1)}% · founders ${report.population.founders} ` +
    (report.central ? `· nestShare ${(report.central.nestShare * 100).toFixed(1)}% ` +
                      `· visited ${(report.central.visitedFrac * 100).toFixed(0)}% ` : '') +
    `· ${result.runtimeSeconds}s` + (report.interpretable ? '' : ' · BELOW SIGNIFICANCE FLOOR'));

sim.dispose();
if (predator) predator.dispose();
