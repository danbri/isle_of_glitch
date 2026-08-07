/**
 * THE GATE EVERY AUTORESEARCH PROPOSAL HANGS OFF, AND NOBODY HAS RUN IT.
 *
 * AUTORESEARCH.md §8 is explicit about sequencing:
 *
 *     1. Stabilise the sim. The active drift/NaN bugs manufacture artifacts; a
 *        loop on them chases noise and banks nonsense. Green light = a config
 *        scored twice gives the same `net` within SE.
 *
 * That test has never been performed. This performs it, and it answers two
 * separate questions that are easy to confuse:
 *
 *   DETERMINISM — the same config with the same seed, run twice, should give
 *     bit-identical state. If it does not, no experiment in this project is
 *     reproducible and every measured difference is partly noise of unknown
 *     size. GPU floating point is deterministic for a fixed dispatch order, so
 *     a failure here means something is genuinely non-reproducible (atomics
 *     racing, readback ordering, uninitialised memory) rather than merely noisy.
 *
 *   NOISE FLOOR — the same config across DIFFERENT seeds. This is the variance
 *     any real effect has to beat, and it is the number that decides how many
 *     replicates an experiment needs. Every claim this project has made or
 *     retracted is a statement about an effect relative to this floor, and the
 *     floor has never been measured directly.
 *
 * A tool like hugoferreira/autoresearch computes bootstrap confidence intervals
 * and downgrades a verdict when they cross zero. That machinery is only as good
 * as the substrate: if the noise floor is large relative to the effects being
 * chased, the honest output is "inconclusive" forever, and it is better to know
 * that before automating.
 *
 *   deno run -A --unstable-webgpu tools/green-light.js [--seeds 6] [--steps 6000]
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver } from '../lib/evolve.js';

const arg = (k, d) => {
  const i = Deno.args.indexOf(`--${k}`);
  return i >= 0 ? Number(Deno.args[i + 1]) : d;
};
const SEEDS = arg('seeds', 6);
const STEPS = arg('steps', 6000);
const BOUND = arg('bound', 66);
const CELLS = arg('cells', 5000);

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

/**
 * One scored run. The summary is deliberately several numbers rather than one:
 * a single scalar can be stable while the world underneath it is not, and the
 * point of this test is to catch exactly that.
 */
async function score(seed, steps) {
  const built = buildBodies({
    beasts: Math.max(64, Math.floor(CELLS / 12)), cells: 12,
    bound: BOUND, maxCells: 60, seed,
  });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: BOUND });
  const evo = new Evolver({
    arena: built.arena, world, cells: built.cells,
    seed, maxAge: 25000, ageSpread: 0.35,
  });

  let done = 0, last = null;
  while (done < steps) {
    const chunk = Math.min(250, steps - done);
    world.step(chunk);
    done += chunk;
    try { last = await evo.tick(done); } catch { /* a failed tick is not a failed run */ }
  }
  const { pos, energy } = await world.readCells();

  // A checksum over live state. Sums rather than a hash: a hash tells you THAT
  // two runs differ, a sum tells you roughly by how much, which distinguishes
  // "one cell differs in the last bit" from "a different world".
  let eSum = 0, pSum = 0, live = 0, nan = 0;
  for (let i = 0; i < built.cells.ctype.length; i++) {
    if (built.cells.ctype[i] < 0) continue;
    live++;
    eSum += energy[i];
    pSum += pos[i * 2] + pos[i * 2 + 1];
    if (!Number.isFinite(energy[i]) || !Number.isFinite(pos[i * 2])) nan++;
  }
  world.destroy?.(); brains.destroy?.();
  return {
    alive: last?.alive ?? 0, births: last?.births ?? 0, deaths: last?.deaths ?? 0,
    lineages: last?.lineages ?? 0, meanEnergy: +(last?.meanEnergy ?? 0),
    liveCells: live, eSum: +eSum.toFixed(4), pSum: +pSum.toFixed(4), nan,
  };
}

console.log(`green light: ${CELLS} cells, bound ${BOUND}, ${STEPS} steps\n`);

/* ---------------------------------------------------------- determinism */
console.log('DETERMINISM — same config, same seed, twice');
const a = await score(4242, STEPS);
const b = await score(4242, STEPS);
const keys = ['alive', 'births', 'deaths', 'lineages', 'liveCells', 'eSum', 'pSum'];
let identical = true;
for (const k of keys) {
  const same = a[k] === b[k];
  if (!same) identical = false;
  console.log(`  ${k.padEnd(11)} ${String(a[k]).padStart(14)} ${String(b[k]).padStart(14)}` +
              `   ${same ? 'same' : 'DIFFER'}`);
}
console.log(`  non-finite values: ${a.nan} / ${b.nan}`);
console.log(identical
  ? '  -> reproducible: the same seed gives the same world.\n'
  : '  -> NOT REPRODUCIBLE. Every measured difference in this project contains\n' +
    '     an unknown amount of this. Fix before automating anything.\n');

/* ---------------------------------------------------------- noise floor */
console.log(`NOISE FLOOR — same config, ${SEEDS} different seeds`);
const runs = [];
for (let i = 0; i < SEEDS; i++) runs.push(await score(7000 + i * 13, STEPS));

const report = (name, vals) => {
  const m = mean(vals), s = sd(vals), se = s / Math.sqrt(vals.length);
  console.log(`  ${name.padEnd(11)} mean ${m.toFixed(3).padStart(10)}` +
              `   sd ${s.toFixed(3).padStart(9)}   SE ${se.toFixed(3).padStart(9)}` +
              `   cv ${(m ? Math.abs(s / m) * 100 : 0).toFixed(1).padStart(5)}%`);
  return { mean: m, sd: s, se };
};
const stats = {};
for (const k of ['alive', 'births', 'lineages', 'meanEnergy']) {
  stats[k] = report(k, runs.map(r => r[k]));
}

console.log('\nWHAT THIS MEANS FOR AN AUTORESEARCH LOOP');
const cv = Math.abs(stats.alive.sd / stats.alive.mean) * 100;
console.log(`  Population varies ${cv.toFixed(1)}% between seeds at a fixed config.`);
console.log(`  An effect must exceed about 2 SE to be visible; with ${SEEDS} seeds that is`);
console.log(`  ${(2 * stats.alive.se).toFixed(2)} bodies out of ${stats.alive.mean.toFixed(0)}` +
            ` (${(200 * stats.alive.se / stats.alive.mean).toFixed(1)}%).`);
console.log('  Smaller effects need more seeds, quadratically. That is the budget any');
console.log('  automated loop is really spending, and it is worth knowing before');
console.log('  committing to one.');
