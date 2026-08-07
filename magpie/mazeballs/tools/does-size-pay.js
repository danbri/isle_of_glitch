/**
 * DOES BEING BIG PAY, AND DOES COUNTING COMPETITORS INSTEAD OF MOUTHS CHANGE IT?
 *
 * The headline blocker in CAMBRIAN-PATH.md is that multicellularity is taxed:
 * energy per cell falls monotonically with body size, measured at
 * -0.4041 +- 0.0669 for big (>=15 cells) minus small (<=8). Differentiation
 * needs spare cells, so a world that taxes size cannot get division of labour,
 * and the Cambrian staircase never gets its second step.
 *
 * Codex proposed a mechanism, reading the design rather than the numbers:
 *
 *     To make movement pay, a patch must be punished for being worked.
 *     A body is a thing that works a patch.
 *     So the rule that makes movement pay also punishes being a body.
 *
 * The kernel already has the fix and has it switched off. moteOffer computes
 *
 *     rivals = sum_j bodySize_j ^ (-grazeBodyShare)
 *
 * and regrowth suppression is driven by `rivals` while the patch's yield is
 * shared among `demanders`, the raw cell count. At grazeBodyShare = 0 a rival IS
 * a mouth, so a twenty-cell body suppresses its own ground twenty times over. At
 * 1.0 a body of any size counts once for suppression while still sharing the
 * patch among its cells — exactly "count competitors, not mouths".
 *
 * THE COMPARISON. Paired worlds, identical seed and founders, differing only in
 * grazeBodyShare. The endpoint is the SIZE CONTRAST within each world, not
 * absolute energy per cell: the parameter changes total consumption as well as
 * its distribution, so a world could get uniformly richer without size paying any
 * better. A within-world contrast is scale-free and immune to that.
 *
 * Both horizons, because in this world five effects have cleared a first horizon
 * and failed at ten times it, and one horizon is not evidence.
 *
 *   deno run -A --unstable-webgpu tools/does-size-pay.js [--reps 4] [--first 8000]
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver } from '../lib/evolve.js';

const arg = (k, d) => {
  const i = Deno.args.indexOf(`--${k}`);
  return i >= 0 ? Number(Deno.args[i + 1]) : d;
};
const REPS = arg('reps', 4);
const FIRST = arg('first', 8000);
const DEEP = arg('deep', 10);
const BOUND = arg('bound', 66);
const CELLS = arg('cells', 5000);
const OUT = './runs/does-size-pay.jsonl';

const say = async (o) => {
  console.log(JSON.stringify(o));
  await Deno.writeTextFile(OUT, JSON.stringify(o) + '\n', { append: true });
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

/** Energy per cell by size class, and the big-minus-small contrast. */
function sizeContrast(built, energy) {
  const { arena, cells } = built;
  const small = [], big = [];
  for (let o = 0; o < arena.P; o++) {
    if (!arena.alive[o]) continue;
    const off = arena.off[o], n = arena.cnt[o];
    if (n <= 0) continue;
    let e = 0, live = 0;
    for (let k = 0; k < n; k++) {
      const i = off + k;
      if (cells.ctype[i] < 0) continue;
      e += energy[i]; live++;
    }
    if (live < 2) continue;
    const per = e / live;
    if (live <= 8) small.push(per);
    else if (live >= 15) big.push(per);
  }
  return {
    small: mean(small), big: mean(big), nSmall: small.length, nBig: big.length,
    contrast: mean(big) - mean(small),
  };
}

async function run(share, seed, steps) {
  const built = buildBodies({
    beasts: Math.max(64, Math.floor(CELLS / 12)), cells: 12,
    bound: BOUND, maxCells: 60, seed,
  });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: BOUND });
  world.writeParams({ grazeBodyShare: share });
  const evo = new Evolver({
    arena: built.arena, world, cells: built.cells,
    seed, maxAge: 25000, ageSpread: 0.35,
  });

  let done = 0;
  while (done < steps) {
    const chunk = Math.min(250, steps - done);
    world.step(chunk);
    done += chunk;
    try { await evo.tick(done); } catch { /* a failed tick is not a failed run */ }
  }
  const { energy } = await world.readCells();
  const r = sizeContrast(built, energy);
  world.destroy?.(); brains.destroy?.();
  return r;
}

await Deno.mkdir('./runs', { recursive: true }).catch(() => {});
console.log(`grazeBodyShare 0 vs 1, ${REPS} paired reps, horizons ${FIRST} and ${FIRST * DEEP}`);
console.log('The endpoint is the WITHIN-WORLD size contrast, so a uniformly richer');
console.log('world does not register as size paying better.\n');

for (const [label, steps] of [['first', FIRST], ['deep', FIRST * DEEP]]) {
  const c0 = [], c1 = [];
  for (let rep = 0; rep < REPS; rep++) {
    const seed = 90000 + rep * 41;           // independent of any earlier run's seeds
    const a = await run(0.0, seed, steps);
    const b = await run(1.0, seed, steps);
    c0.push(a.contrast); c1.push(b.contrast);
    await say({ kind: 'rep', horizon: label, rep, seed,
                share0: a, share1: b });
  }
  const m0 = mean(c0), m1 = mean(c1);
  const se0 = sd(c0) / Math.sqrt(c0.length), se1 = sd(c1) / Math.sqrt(c1.length);
  const diff = m1 - m0, seD = Math.sqrt(se0 ** 2 + se1 ** 2);
  await say({ kind: 'summary', horizon: label, steps,
              contrastShare0: +m0.toFixed(4), se0: +se0.toFixed(4),
              contrastShare1: +m1.toFixed(4), se1: +se1.toFixed(4),
              improvement: +diff.toFixed(4), seDiff: +seD.toFixed(4),
              clears2SE: Math.abs(diff) > 2 * seD });
  console.log(`\n${label}: share 0 contrast ${m0.toFixed(4)} +-${se0.toFixed(4)}` +
              `   share 1 ${m1.toFixed(4)} +-${se1.toFixed(4)}` +
              `   change ${diff >= 0 ? '+' : ''}${diff.toFixed(4)} +-${seD.toFixed(4)}` +
              `   ${Math.abs(diff) > 2 * seD ? 'CLEARS 2 SE' : 'inside 2 SE'}\n`);
}
