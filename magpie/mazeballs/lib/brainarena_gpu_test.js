/**
 * GPU kernel tests. Run: deno test --allow-all lib/brainarena_gpu_test.js
 *
 * These skip cleanly when no adapter is present, so the suite still passes on a
 * machine without a GPU rather than failing for the wrong reason.
 */
import { assert, assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';
import { BrainArena } from './brainarena.js';
import { BrainArenaGPU } from './brainarena_gpu.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());
const gpuTest = (name, fn) => Deno.test({ name, ignore: !HAS_GPU, fn });

function populated(beasts = [6, 40, 12], N = 256, K = 8) {
  const a = new BrainArena({ neurons: N, degree: K, organisms: 16, dt: 0.015 });
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const n of beasts) {
    const o = a.birth(n);
    for (let i = 0; i < n; i++)
      a.setNeuron(o, i, { tau: 0.24 + rnd() * 1.65, bias: rnd() * 2 - 1 });
    for (let to = 0; to < n; to++)
      for (let k = 0; k < K; k++)
        if (rnd() < 0.6) a.connect(o, (rnd() * n) | 0, to, rnd() * 2 - 1, k);
    a.state[a.off[o]] = 0.5;
  }
  return a;
}

/** Largest absolute difference between two float arrays. */
const maxDiff = (x, y) => {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - y[i]));
  return m;
};

gpuTest('one GPU step matches the CPU reference to f32 precision', async () => {
  const cpu = populated();
  const gpu = await BrainArenaGPU.create(cpu);
  cpu.step(null);
  gpu.step(1);
  const { state, act } = await gpu.readState();
  // f64 intermediates on CPU vs f32 throughout on GPU: agreement is to f32
  // epsilon, not exact. See the module header.
  assert(maxDiff(state, cpu.state) < 1e-6, `state diverged by ${maxDiff(state, cpu.state)}`);
  assert(maxDiff(act, cpu.act) < 1e-6, `act diverged by ${maxDiff(act, cpu.act)}`);
  gpu.destroy();
});

gpuTest('a batch of GPU steps tracks the CPU over a short horizon', async () => {
  const cpu = populated();
  const gpu = await BrainArenaGPU.create(cpu);
  for (let i = 0; i < 100; i++) cpu.step(null);
  gpu.step(100);                                    // one submit, 200 dispatches
  const { state } = await gpu.readState();
  assert(maxDiff(state, cpu.state) < 1e-4, `diverged by ${maxDiff(state, cpu.state)} over 100 steps`);
  gpu.destroy();
});

gpuTest('external drive is applied', async () => {
  const cpu = populated();
  const gpu = await BrainArenaGPU.create(cpu);
  const ext = new Float32Array(cpu.N);
  for (let i = 0; i < cpu.N; i++) ext[i] = Math.sin(i) * 0.5;
  gpu.setExternal(ext);
  for (let i = 0; i < 50; i++) cpu.step(ext);
  gpu.step(50);
  const { state } = await gpu.readState();
  assert(maxDiff(state, cpu.state) < 1e-4, `diverged by ${maxDiff(state, cpu.state)}`);
  gpu.destroy();
});

gpuTest('islands stay isolated on the GPU too', async () => {
  // The kernel is index-blind, so island isolation is an invariant of the edge
  // table rather than of the code — worth asserting it survives the port.
  const cpu = populated();
  const gpu = await BrainArenaGPU.create(cpu);
  const ext = new Float32Array(cpu.N);
  for (let i = 0; i < cpu.cnt[0]; i++) ext[cpu.off[0] + i] = 50;
  gpu.setExternal(ext);
  gpu.step(30);
  const driven = (await gpu.readState()).state;

  const quiet = await BrainArenaGPU.create(populated());
  quiet.step(30);
  const undriven = (await quiet.readState()).state;

  const o2 = cpu.off[2], n2 = cpu.cnt[2];
  assertEquals(
    Array.from(driven.subarray(o2, o2 + n2)),
    Array.from(undriven.subarray(o2, o2 + n2)));
  gpu.destroy(); quiet.destroy();
});

gpuTest('GPU state can be pulled into a CPU arena and snapshotted', async () => {
  const cpu = populated();
  const gpu = await BrainArenaGPU.create(cpu);
  gpu.step(40);
  await gpu.readState(cpu);                        // write back in place
  assertEquals(cpu.steps, 40);

  // The pulled state must survive the normal snapshot path unchanged — this is
  // the headless-GPU-run -> browser-watcher path end to end.
  const watcher = BrainArena.restore(cpu.snapshot());
  assertEquals(Array.from(watcher.state), Array.from(cpu.state));
  assertEquals(watcher.validate(), []);
  gpu.destroy();
});

gpuTest('a GPU run resumes from a CPU snapshot', async () => {
  const cpu = populated();
  const gpu = await BrainArenaGPU.create(cpu);
  gpu.step(25);
  await gpu.readState(cpu);

  const resumed = BrainArena.restore(cpu.snapshot());
  const gpu2 = await BrainArenaGPU.create(resumed);
  gpu2.step(25); gpu.step(25);
  const a = (await gpu.readState()).state, b = (await gpu2.readState()).state;
  // Same engine both sides, so this one IS exact.
  assertEquals(Array.from(b), Array.from(a));
  gpu.destroy(); gpu2.destroy();
});

gpuTest('a neuron relaxes toward its input at the rate tau sets', async () => {
  const cpu = new BrainArena({ neurons: 4, degree: 2, organisms: 2, dt: 0.015 });
  const o = cpu.birth(1);
  cpu.setNeuron(o, 0, { tau: 0.5, bias: 0 });
  const gpu = await BrainArenaGPU.create(cpu);
  const ext = new Float32Array(cpu.N); ext[cpu.off[o]] = 1;
  gpu.setExternal(ext);
  gpu.step(200);
  const { state } = await gpu.readState();
  assertAlmostEquals(state[cpu.off[o]], 1, 1e-2);
  gpu.destroy();
});
