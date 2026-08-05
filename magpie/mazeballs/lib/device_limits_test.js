/**
 * The world must fit inside limits a BROWSER actually offers.
 *
 * Run: deno test --allow-all lib/device_limits_test.js
 *
 * This exists because the same shader ran fine here and failed in Chrome with
 * "The number of storage buffers (11) in the Compute stage exceeds the maximum
 * per-stage limit (10)". The Deno adapter on this machine reports 31, so every
 * headless test passed while the page could not create its bind group layout at
 * all. The asymmetry is the bug: a limit that is generous locally is not a limit
 * that has been tested.
 *
 * WebGPU GUARANTEES only 8 storage buffers per stage. Chrome commonly allows 10.
 * We use 10 and pin it here, so adding an eleventh buffer fails in CI rather than
 * in front of whoever opened the page.
 */
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { buildBodies } from './bodies.js';
import { BrainArenaGPU, requestDeviceFor } from './brainarena_gpu.js';
import { WorldGPU } from './world_gpu.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());
const gpuTest = (name, fn) => Deno.test({ name, ignore: !HAS_GPU, fn });

/** What the world binds, counted from the source rather than from memory. */
function storageBufferCount(src) {
  return (src.match(/@group\(0\) @binding\(\d+\)\s+var<storage/g) ?? []).length;
}

Deno.test('the world binds no more storage buffers than a browser allows', async () => {
  const src = await Deno.readTextFile(new URL('./world_gpu.js', import.meta.url));
  const n = storageBufferCount(src);
  assert(n <= 10,
    `the world shader binds ${n} storage buffers; Chrome caps the compute stage ` +
    `at 10 and the WebGPU floor is 8. Pack two buffers together rather than ` +
    `raising this — the page cannot create its bind group layout otherwise.`);
});

gpuTest('a world builds on a device capped to browser limits', async () => {
  // Ask for exactly what a conservative browser gives, so a violation surfaces
  // here as a creation failure rather than on someone's phone.
  const adapter = await navigator.gpu.requestAdapter();
  const cap = (k, v) => Math.min(v, adapter.limits[k]);
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: cap('maxStorageBuffersPerShaderStage', 11),
    },
  });
  assertEquals(device.limits.maxStorageBuffersPerShaderStage, 11,
    'could not obtain a device capped at 11 storage buffers');

  const errors = [];
  device.addEventListener?.('uncapturederror', e => errors.push(String(e.error?.message ?? e.error)));

  const built = buildBodies({ beasts: 40, cells: 12, bound: 40, seed: 3, maxCells: 60 });
  const brains = await BrainArenaGPU.create(built.arena, device);
  const world = new WorldGPU(brains, built.cells, { bound: 40 });
  world.step(20);
  const { x } = await world.readPositions();
  assert(Number.isFinite(x[0]), 'world produced no finite positions under browser limits');

  assertEquals(errors, [], `WebGPU errors under browser-capped limits: ${errors.join('; ')}`);
  world.destroy(); brains.destroy();
});
