/**
 * The decisive run: same replicated design, an order of magnitude longer.
 *
 * The 2100-tick replicated ladder showed a margin of 0.568 +/- 0.020 after the
 * initial transient, with a slope 1.31 SE from zero — significantly positive,
 * and not distinguishable from flat. Five rungs cannot exclude a slow decline.
 * This runs 18000 ticks with the replicate count kept, which is the only way the
 * question gets a different answer than "not enough data".
 *
 * Replicates are the point. A longer run at one tournament per rung would give
 * another clean-looking trend that means nothing — that mistake has been made
 * three times in this wave already.
 *
 * Writes each rung as it completes, so partial results are usable if this is
 * stopped early.
 */
import { buildBodies } from '/Users/danbri/working/mazeballs/isle_of_glitch/magpie/mazeballs/lib/bodies.js';
import { BrainArenaGPU } from '/Users/danbri/working/mazeballs/isle_of_glitch/magpie/mazeballs/lib/brainarena_gpu.js';
import { WorldGPU } from '/Users/danbri/working/mazeballs/isle_of_glitch/magpie/mazeballs/lib/world_gpu.js';
import { Evolver } from '/Users/danbri/working/mazeballs/isle_of_glitch/magpie/mazeballs/lib/evolve.js';
import { archive, tournament } from '/Users/danbri/working/mazeballs/isle_of_glitch/magpie/mazeballs/lib/tournament.js';

const CAP = 3000, START = 600, CELLS = 12, BOUND = 70;
const CHECKPOINT_EVERY = 600;
const CHECKPOINTS = 30;                 // 18000 ticks
const REPLICATES = 5;
const DRIFT = { driftX: 0.06, driftY: 0.037, morphRate: 0.0075 };
const OUT = Deno.env.get('OUT') ?? './runs/ascent-ladder.jsonl';

const say = async (o) => {
  console.log(JSON.stringify(o));
  await Deno.writeTextFile(OUT, JSON.stringify(o) + '\n', { append: true });
};

const built = buildBodies({ beasts: CAP, cells: CELLS, bound: BOUND, seed: 11 });
const brains = await BrainArenaGPU.create(built.arena);
const world = new WorldGPU(brains, built.cells, { bound: BOUND, ...DRIFT });
const evo = new Evolver({
  arena: built.arena, world, cells: built.cells, seed: 3,
  birthEnergy: 18, deathEnergy: 0,
});
for (let o = START; o < CAP; o++) evo.cull(o);
evo.founders = evo.alive();

await say({ kind: 'start', ticks: CHECKPOINTS * CHECKPOINT_EVERY, every: CHECKPOINT_EVERY, replicates: REPLICATES });

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };

const shots = [];
for (let c = 0; c < CHECKPOINTS; c++) {
  for (let t = 0; t < CHECKPOINT_EVERY; t++) {
    world.step(250);
    await evo.tick((c * CHECKPOINT_EVERY + t) * 250);
  }
  const label = `T${(c + 1) * CHECKPOINT_EVERY}`;
  const snap = archive(built.arena, built.cells, label);
  shots.push(snap);
  let size = 0; for (const g of snap.pool) size += g.n;
  await say({
    kind: 'checkpoint', label, genomes: snap.pool.length,
    meanSize: +(size / Math.max(1, snap.pool.length)).toFixed(2),
    generation: evo.maxGeneration(), lineages: evo.countLineages(),
    alive: evo.alive(), births: evo.births,
  });

  // Measure each rung as soon as its far end exists, so results accrue.
  if (shots.length >= 2) {
    const a = shots[shots.length - 2], b = shots[shots.length - 1];
    const draws = [];
    for (let r = 0; r < REPLICATES; r++) {
      const res = await tournament(a, b, {
        perSide: 110, steps: 10000,
        seed: 2000 + c * 131 + r * 977, worldParams: DRIFT,
      });
      draws.push(res.shareB);
    }
    await say({
      kind: 'rung', from: a.label, to: b.label,
      mean: +mean(draws).toFixed(4), se: +(sd(draws) / Math.sqrt(draws.length)).toFixed(4),
      draws: draws.map(d => +d.toFixed(3)),
    });
  }
}

// Longest baseline available.
const far = await tournament(shots[0], shots[shots.length - 1], {
  perSide: 110, steps: 10000, seed: 31337, worldParams: DRIFT,
});
await say({
  kind: 'far', from: shots[0].label, to: shots[shots.length - 1].label,
  descendantsA: far.descendantsA, descendantsB: far.descendantsB, shareB: far.shareB,
});
world.destroy(); brains.destroy();
