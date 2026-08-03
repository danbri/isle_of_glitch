/**
 * World kernel tests. Run: deno test --allow-all lib/world_gpu_test.js
 *
 * These exist because the closed sense -> brain -> muscle -> move loop went
 * unstable in a way none of the parts showed on their own: brains alone were
 * fine, sensing alone was fine, muscles alone were fine, and the four together
 * drove 0.2% of bodies to NaN. The cause was a muscle contracting its own view
 * of a SHARED bond, so the pair's forces were not equal and opposite and every
 * step injected energy. The momentum test below is the direct check for that,
 * and it fails loudly if the third law is ever broken again.
 */
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { buildBodies } from './bodies.js';
import { BrainArenaGPU } from './brainarena_gpu.js';
import { WorldGPU } from './world_gpu.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());
const gpuTest = (name, fn) => Deno.test({ name, ignore: !HAS_GPU, fn });

const nonFinite = (a) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) n++;
  return n;
};

async function makeWorld(params = {}, opts = {}) {
  const built = buildBodies({ beasts: 300, cells: 12, bound: 30, seed: 5, ...opts });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: built.meta.bound, ...params });
  return { ...built, brains, world };
}

gpuTest('the shader compiles and every cell is wired into its island', async () => {
  const { arena, world, brains } = await makeWorld();
  assertEquals(arena.validate(), []);
  world.step(10);
  const { x } = await world.readPositions();
  assertEquals(nonFinite(x), 0);
  world.destroy(); brains.destroy();
});

gpuTest('bond forces conserve momentum — Newton\'s third law holds', async () => {
  // With no flow and no drag, bonds are the ONLY force, so total momentum must
  // not change no matter what the muscles do. An asymmetric bond force shows up
  // here immediately as momentum appearing from nowhere.
  const { world, brains, meta } = await makeWorld({
    flowStr: 0, drag: 0, damp: 1.0, contract: 0.45,
  });

  const readVel = async () => {
    const enc = world.device.createCommandEncoder();
    // vel is vec4 (xy = velocity, w = next-energy scratch), so the stride is 16
    // bytes. Reading it as vec2 summed energy values as if they were momentum.
    const staging = world.device.createBuffer({
      size: world.n * 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    enc.copyBufferToBuffer(world.bVel, 0, staging, 0, world.n * 16);
    world.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const v = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap(); staging.destroy();
    let px = 0, py = 0;
    for (let i = 0; i < world.n; i++) { px += v[i * 4]; py += v[i * 4 + 1]; }
    return Math.hypot(px, py);
  };

  const before = await readVel();
  world.step(300);
  const after = await readVel();

  // Everything starts at rest, so total momentum starts at 0 and must stay
  // there. A tolerance of 1 across 3600 cells is generous for f32 accumulation
  // while still being thousands of times tighter than the runaway it guards.
  assert(before < 1e-3, `initial momentum ${before} should be ~0`);
  assert(after < 1.0, `bond forces created momentum: |p| grew from ${before} to ${after}`);
  world.destroy(); brains.destroy();
});

gpuTest('the closed sense-brain-muscle-move loop stays finite', async () => {
  // The regression itself: all four kernels live, long enough for the old
  // energy injection to have blown up (it showed by ~step 200).
  const { world, brains } = await makeWorld();
  world.step(600);
  const { x, y } = await world.readPositions();
  const { state } = await brains.readState();
  assertEquals(nonFinite(x) + nonFinite(y), 0, 'positions went non-finite');
  assertEquals(nonFinite(state), 0, 'brain states went non-finite');
  world.destroy(); brains.destroy();
});

gpuTest('bodies stay bonded rather than tearing apart', async () => {
  const { world, brains, cells, meta } = await makeWorld();
  world.step(400);
  const { x, y } = await world.readPositions();

  const { bond, brest, bondK } = cells;
  const b = meta.bound;
  let worst = 0;
  for (let i = 0; i < x.length; i++) {
    for (let k = 0; k < bondK; k++) {
      const j = bond[i * bondK + k];
      if (j < 0) continue;
      let dx = x[j] - x[i], dy = y[j] - y[i];
      if (Math.abs(dx) > b) dx -= Math.sign(dx) * 2 * b;   // undo toroidal wrap
      if (Math.abs(dy) > b) dy -= Math.sign(dy) * 2 * b;
      worst = Math.max(worst, Math.abs(Math.hypot(dx, dy) - brest[i * bondK + k]));
    }
  }
  // Rest lengths are ~0.6 and muscles legitimately shorten them by up to 45%,
  // so some deviation is the mechanism working. Tearing looked like 60.
  assert(worst < 1.5, `bonds stretched to ${worst.toFixed(2)} — bodies are coming apart`);
  world.destroy(); brains.destroy();
});

gpuTest('cells stay inside the toroidal world', async () => {
  const { world, brains, meta } = await makeWorld();
  world.step(500);
  const { x, y } = await world.readPositions();
  let maxAbs = 0;
  for (let i = 0; i < x.length; i++) maxAbs = Math.max(maxAbs, Math.abs(x[i]), Math.abs(y[i]));
  assert(maxAbs <= meta.bound + 1e-3, `a cell escaped to ${maxAbs}, bound is ${meta.bound}`);
  world.destroy(); brains.destroy();
});

gpuTest('sensing actually drives the brains', async () => {
  // senseGain 0 vs live sensing must produce different brain states, or the
  // sensor kernel is writing nothing and the loop is not closed at all.
  const live = await makeWorld();
  const deaf = await makeWorld({ senseGain: 0 });
  live.world.step(200); deaf.world.step(200);
  const a = (await live.brains.readState()).state;
  const b = (await deaf.brains.readState()).state;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
  assert(diff > 1e-3, 'sensing changed nothing — sensor cells are not driving ext');
  live.world.destroy(); live.brains.destroy();
  deaf.world.destroy(); deaf.brains.destroy();
});
