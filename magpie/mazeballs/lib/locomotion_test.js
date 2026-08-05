/**
 * The locomotion primitive. Run: deno test --allow-all lib/locomotion_test.js
 *
 * This is the capability the project spent its whole history not having, and it
 * was retracted once already — the "displacement" turned out to be bodies tearing
 * apart and their cells scattering, which moves a centroid beautifully while
 * nothing swims. So the controls are not optional decoration here; they ARE the
 * test, and each one fails in a different, diagnostic way:
 *
 *   muscle OFF        must be at the noise floor. Measured at 1e-4, which is four
 *                     orders of magnitude below the swimming signal — NOT exactly
 *                     zero, and worth stating rather than rounding away. The
 *                     retracted result had this control at 28 units, the same as
 *                     the measurement.
 *   isotropic drag    must be ~zero. Undulation against isotropic drag cancels
 *                     exactly — the scallop theorem. If this moves, the movement
 *                     is not coming from the gait.
 *   no grabbiness     must be ~zero, for the same reason by a different route:
 *                     the anisotropy is conditional on the cell gripping.
 *
 * Bodies are placed far apart with no flow and no food, so nothing external can
 * push them and nothing is born or dies. Whatever a body does here, it did.
 */
import { assert } from 'jsr:@std/assert@1';
import { buildBodies } from './bodies.js';
import { BrainArenaGPU } from './brainarena_gpu.js';
import { WorldGPU } from './world_gpu.js';
import { Evolver } from './evolve.js';
import { randomGenome } from './devo.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());
const gpuTest = (name, fn) => Deno.test({ name, ignore: !HAS_GPU, fn });

function genomes(n, seed = 11) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, () => randomGenome(rnd));
}

/**
 * Mean centroid displacement of isolated bodies over a fixed window.
 * Bodies that come apart are dropped rather than allowed to dominate the mean —
 * a scattered corpse is not a swimmer.
 */
async function displacement(gs, params = {}) {
  const n = gs.length;
  const side = Math.ceil(Math.sqrt(n));
  const gap = 60;                                  // ~10 body lengths of clearance
  const bound = Math.max(80, side * gap / 2);

  const built = buildBodies({ beasts: n + 8, cells: 12, bound, seed: 5, maxCells: 60 });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, {
    bound, flowStr: 0, drag: 0, nMotes: 0, ...params,
  });
  const evo = new Evolver({
    arena: built.arena, world, cells: built.cells, seed: 2,
    birthEnergy: 1e9, deathEnergy: -1e9, maxCells: 60, devo: true,
  });
  for (let o = 1; o < n + 8; o++) evo.cull(o);
  evo.lastEnergy = new Float32Array(built.arena.P).fill(45);

  const born = [];
  for (let k = 0; k < n; k++) {
    evo.genome[0] = gs[k];
    evo.lastEnergy[0] = 45;
    const saved = evo.mutRate; evo.mutRate = 0;    // measure the genome we were given
    const c = evo.divide(0,
      -bound + gap * (0.5 + (k % side)),
      -bound + gap * (0.5 + Math.floor(k / side)), 0);
    evo.mutRate = saved;
    if (c >= 0) born.push(c);
  }
  evo.cull(0);

  const A = built.arena;
  const centres = async () => {
    const f = await world.readPositions();
    const m = new Map();
    for (const o of born) {
      if (!A.alive[o]) continue;
      let sx = 0, sy = 0;
      const cnt = A.cnt[o], off = A.off[o];
      for (let i = 0; i < cnt; i++) { sx += f.x[off + i]; sy += f.y[off + i]; }
      m.set(o, [sx / cnt, sy / cnt]);
    }
    return m;
  };

  world.step(3000);                                 // settle
  const a = await centres();
  world.step(30000);
  const b = await centres();

  let sum = 0, count = 0;
  for (const [o, p] of a) {
    const q = b.get(o);
    if (!q) continue;
    let dx = q[0] - p[0], dy = q[1] - p[1];
    if (dx > bound) dx -= 2 * bound; if (dx < -bound) dx += 2 * bound;
    if (dy > bound) dy -= 2 * bound; if (dy < -bound) dy += 2 * bound;
    const d = Math.hypot(dx, dy);
    if (Number.isFinite(d) && d < bound * 0.4) { sum += d; count++; }
  }
  world.destroy(); brains.destroy();
  return { mean: count ? sum / count : 0, n: count };
}

gpuTest('bodies swim, and only because grip makes drag anisotropic', async () => {
  const gs = genomes(48);

  const swim = await displacement(gs, {});
  const iso = await displacement(gs, { gripAniso: 0 });
  const dead = await displacement(gs, { contract: 0 });
  const slick = await displacement(gs, { gripBase: 0, gripAnchor: 0 });

  assert(swim.n > 30, `too few intact bodies to judge (${swim.n})`);

  // A body with no muscles has nothing to drive it. Not exactly zero — f32
  // integration over 30,000 steps leaves ~1e-4 of residue — so what is asserted
  // is that it sits at the noise floor AND that the signal clears it by orders of
  // magnitude. This is the control that caught the retracted result, where every
  // condition (muscles off, flow off) gave the same 28 units of "movement".
  assert(dead.mean < 1e-3,
    `muscle-off bodies moved ${dead.mean.toFixed(5)} — that is drift, not locomotion`);
  assert(swim.mean > 100 * Math.max(dead.mean, 1e-9),
    `signal ${swim.mean.toFixed(3)} is not clear of the muscle-off floor ${dead.mean.toFixed(5)}`);

  // Undulation against isotropic drag cancels exactly.
  assert(swim.mean > 20 * Math.max(iso.mean, 1e-6),
    `no anisotropic advantage: ${swim.mean.toFixed(3)} vs isotropic ${iso.mean.toFixed(3)}`);

  // And the anisotropy has to be earned by gripping, not granted by the world.
  assert(swim.mean > 20 * Math.max(slick.mean, 1e-6),
    `movement survived losing grabbiness: ${swim.mean.toFixed(3)} vs ${slick.mean.toFixed(3)}`);
});

gpuTest('traction only ever removes energy', async () => {
  // The friction law: a coupling to the terrain may resist motion and may not
  // inject it. Exponential decay cannot add energy for any coefficient, but the
  // claim is worth holding onto — a future grain/stick term could break it.
  const gs = genomes(24, 3);
  const still = await displacement(gs, { contract: 0, gripAniso: 40, gripBase: 3 });
  // Cranking traction hard with no muscle must not produce motion. At the noise
  // floor, not exactly zero — see above.
  assert(still.mean < 1e-3,
    `traction moved bodies with no muscle activity: ${still.mean.toFixed(5)} — it is ` +
    `injecting energy rather than dissipating it`);
});
