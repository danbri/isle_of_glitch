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
import { EvoDevoSim, diagnose, evolveFor } from '../lib/evodevo.js';

const args = parseArgs(process.argv.slice(2), {
  generations: 10, seed: 1, gain: 0.5, mutation: 0.10,
  steps: 600, restarts: 3, elites: 10, pop: 192,
  consume: 0.40, regrow: 0.09, epoch: 1450,
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
});

const log = (...m) => { if (!args.quiet) console.error(...m); };

const { pkg, backend } = await initBackend({ prefer: args.backend });
log(`[backend] ${pkg} → ${backend}`);

const sim = new EvoDevoSim({
  seed: args.seed,
  config: {
    POP: args.pop, ELITES: args.elites, EPOCH_STEPS: args.epoch,
    FOOD_CONSUME: args.consume, FOOD_REGROW: args.regrow,
    GAIN: args.gain, MUTATION: args.mutation,
    FOOD_CLUSTERS: args.clusters, FOOD_CLUSTER_SIGMA: args.clusterSigma,
    FOOD_SENSE_SIGMA2: args.senseSigma2, FOOD_RELOCATE_THRESH: args.relocateThresh,
  },
});
await sim.initialise();

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
await evolveFor(sim, args.generations, {
  onGeneration: ({ generation, best }) =>
    log(`[gen ${String(generation).padStart(3)}] best ${best.toFixed(3)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`),
  curriculum,
});

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
    `· ${result.runtimeSeconds}s` + (report.interpretable ? '' : ' · BELOW SIGNIFICANCE FLOOR'));

sim.dispose();
