/**
 * Standing crop must be conserved. Run: deno test --allow-all lib/motes_test.js
 *
 * The whole reason motes exist is that the analytic resource field was infinite
 * free energy — sampled without depletion, everywhere, forever. Replacing it is
 * only worth anything if grazing is a genuine TRANSFER, so these tests close the
 * system (sun off, no tax, no predation, no clamps) and assert that the total
 * of mote stock plus tissue energy does not move.
 *
 * That is a property no amount of reading the shader establishes. The first
 * version of this code passed every other test while quietly creating 1.5% of
 * the world's energy out of nothing in its first five hundred steps, because a
 * mote counted its demanders inside one hash bucket while cells could graze from
 * further away: the mote went overdrawn, and the `max(0.0, ...)` that keeps
 * stock non-negative silently absorbed the debt. Nothing else in the suite could
 * have noticed, because every individual number stayed plausible.
 */
import { assert } from 'jsr:@std/assert@1';
import { buildBodies } from './bodies.js';
import { BrainArenaGPU } from './brainarena_gpu.js';
import { WorldGPU } from './world_gpu.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());
const gpuTest = (name, fn) => Deno.test({ name, ignore: !HAS_GPU, fn });

/** A closed world: sun off, nothing taxed, nothing clamped. */
async function closedWorld(params = {}) {
  const B = 40;
  const built = buildBodies({ beasts: 200, cells: 12, maxCells: 40, bound: B, seed: 7 });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, {
    bound: B, nMotes: 3000, moteRegrow: 0,
    brainTax: 0, muscleCost: 0, predRate: 0, eCap: 1e9, eFloor: -1e9,
    ...params,
  });
  return { built, brains, world };
}

async function totals(world, built) {
  const m = await world.readMotes();
  const c = await world.readCells();
  let stock = 0;
  for (const v of m.stock) stock += v;
  let tissue = 0;
  for (let i = 0; i < built.cells.ctype.length; i++) {
    if (built.cells.ctype[i] >= 0) tissue += c.energy[i];
  }
  return { stock, tissue, total: stock + tissue };
}

gpuTest('grazing moves energy rather than creating it', async () => {
  const { built, brains, world } = await closedWorld();
  const before = await totals(world, built);
  world.step(2000);
  const after = await totals(world, built);

  // Grazing must actually have happened, or this proves nothing.
  assert(after.stock < before.stock * 0.95,
    `no grazing occurred: stock ${before.stock} -> ${after.stock}`);
  assert(after.tissue > before.tissue * 1.05,
    `cells gained nothing: tissue ${before.tissue} -> ${after.tissue}`);

  // 0.1% covers f32 accumulation over 2000 steps and millions of transfers.
  // The bug this guards against was 15x that and one-directional.
  const drift = Math.abs(after.total - before.total) / before.total;
  assert(drift < 1e-3,
    `energy was created or destroyed: total ${before.total.toFixed(1)} -> ` +
    `${after.total.toFixed(1)} (${(drift * 100).toFixed(3)}%)`);

  world.destroy(); brains.destroy();
});

gpuTest('a mote cannot be grazed below zero', async () => {
  // Crank the draw rate far past what any mote holds. If the offer protocol is
  // wrong this is where stock goes negative and gets clamped, minting energy.
  const { built, brains, world } = await closedWorld({ grazeRate: 500 });
  const before = await totals(world, built);
  world.step(600);
  const after = await totals(world, built);
  const m = await world.readMotes();

  let negative = 0;
  for (const v of m.stock) if (v < 0) negative++;
  assert(negative === 0, `${negative} motes hold negative stock`);

  const drift = Math.abs(after.total - before.total) / before.total;
  assert(drift < 1e-3,
    `overdrawing motes minted energy: ${(drift * 100).toFixed(3)}% at grazeRate 500`);
  world.destroy(); brains.destroy();
});

gpuTest('the sun is the only thing that adds energy, and it is bounded', async () => {
  const { built, brains, world } = await closedWorld({ moteRegrow: 4.0 });
  const before = await totals(world, built);
  world.step(1500);
  const after = await totals(world, built);

  assert(after.total > before.total, 'the sun added nothing');

  // Inflow can never exceed nMotes * moteRegrow * dt per step even at full
  // fertility and empty stock — that is what makes it a boundary condition
  // rather than a subsidy that scales with how many mouths are waiting.
  const ceiling = 3000 * 4.0 * world.params.dt * 1500;
  assert(after.total - before.total <= ceiling,
    `inflow ${(after.total - before.total).toFixed(1)} exceeded its ceiling ${ceiling.toFixed(1)}`);
  world.destroy(); brains.destroy();
});

gpuTest('a mote reach wider than the hash refuses to run', async () => {
  // The geometry that minted 1.5% is now a startup error rather than a silent
  // leak, because it is not detectable from any single number at runtime.
  let threw = false;
  try {
    await closedWorld({ moteR: 4.0, hashCell: 1.2 });
  } catch (e) {
    threw = /moteR .* exceeds hashCell/.test(e.message);
  }
  assert(threw, 'a mote reach wider than the hash was accepted');
});
