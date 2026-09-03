/**
 * WHAT DOES ONE STEP ACTUALLY COST?
 *
 * Display rate and simulation rate are different numbers with different targets.
 * A screen wants 60/s and a headset 90. Evolution wants thousands: multicellular
 * life took on the order of 10^9 generations to appear once, and this world is
 * currently managing tens of steps a second, which is not a budget in which
 * anything is going to be discovered.
 *
 * So this measures the kernel alone — no server, no frames, no readbacks — and
 * ablates the expensive parts one at a time to say where the time goes. It is
 * deliberately not a benchmark of the server: the server's costs (framing,
 * readback, HTTP) are already known and were fixed elsewhere. This is the floor
 * underneath all of that.
 *
 * Each ablation turns something OFF, so a large jump means that thing is
 * expensive. The world is rebuilt per configuration, from the same seed, so the
 * populations are identical at step 0.
 *
 *   deno run -A --unstable-webgpu tools/step-bench.js [--cells 25000] [--steps 400]
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';

const arg = (k, d) => {
  const i = Deno.args.indexOf(`--${k}`);
  return i >= 0 ? Number(Deno.args[i + 1]) : d;
};
const CELLS = arg('cells', 25000);
const STEPS = arg('steps', 400);
const BOUND = arg('bound', 132);

// Each entry disables one mechanism. `base` changes nothing.
const CASES = [
  ['base', {}],
  ['no terrain sense', { senseTerrain: 0 }],
  ['no creature sense', { senseCreature: 0 }],
  ['no gravity', { gravity: 0 }],
  ['no flow', { flowStr: 0 }],
  ['no motes', { nMotes: 0 }],
  ['no sensing at all', { senseTerrain: 0, senseCreature: 0, senseGain: 0 }],
  ['terrain+gravity off', { senseTerrain: 0, gravity: 0 }],
];

async function bench(patch) {
  const built = buildBodies({
    beasts: Math.max(64, Math.floor(CELLS / 12)), cells: 12,
    bound: BOUND, maxCells: 60, seed: 7,
  });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: BOUND });
  world.writeParams(patch);

  world.step(8);                            // warm the pipeline
  await world.readCells();                  // and drain it

  const t0 = performance.now();
  world.step(STEPS);
  await world.readCells();                  // forces completion of the batch
  const dt = (performance.now() - t0) / 1000;

  world.destroy?.(); brains.destroy?.();
  return STEPS / dt;
}

console.log(`${CELLS} cells, bound ${BOUND}, ${STEPS} steps per case\n`);
console.log('case                     steps/s    vs base');
let base = 0;
for (const [name, patch] of CASES) {
  let rate;
  try { rate = await bench(patch); }
  catch (e) { console.log(`${name.padEnd(22)}  FAILED  ${e.message.slice(0, 40)}`); continue; }
  if (!base) base = rate;
  const mult = rate / base;
  console.log(`${name.padEnd(22)} ${rate.toFixed(0).padStart(8)}` +
              `${(mult >= 1 ? '   ' + mult.toFixed(2) + 'x' : '   ' + mult.toFixed(2) + 'x').padStart(10)}`);
}
console.log('\nA large multiplier means the disabled mechanism is where the time goes.');
