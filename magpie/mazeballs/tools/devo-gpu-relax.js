/**
 * Does GPU relaxation fuse anything, conserve area, and give the same answer
 * twice?
 *
 * Mutual-best pairing has no ordering in it: a pair fuses only if each cell is
 * the other's highest-scoring partner, which is a property of the scores alone.
 * That should make it identical run to run and device to device, unlike the
 * CPU's greedy walk where creation order decides who gets first pick.
 *
 * Area is the invariant worth checking. A merged cell has radius
 * sqrt(r1^2 + r2^2), so the sum of r^2 across a body must not move. If it
 * grows, cells are being created; if it shrinks, they are being lost.
 *
 *   deno run -A --unstable-webgpu tools/devo-gpu-relax.js
 */
import * as D from '../lib/devo2.js';
import { DevoGPU } from '../lib/devo-gpu.js';

const { NGENE, GENE_STRIDE } = D;
const seeded = (s) => { let v = s >>> 0; return () => ((v = (Math.imul(v, 1664525) + 1013904223) >>> 0) / 4294967296); };
const EMB = 8, CAP = 64, NB = 12;

async function run(device, passes) {
  const total = EMB * CAP;
  const live = new Uint32Array(total), rad = new Float32Array(total);
  const xy = new Float32Array(total * 2), mat = new Float32Array(total * 4);
  const count = new Uint32Array(EMB);
  for (let e = 0; e < EMB; e++) {
    const r = seeded(5100 + e);
    const n = 30 + ((r() * 30) | 0);
    count[e] = n;
    for (let i = 0; i < n; i++) {
      const s = e * CAP + i;
      live[s] = 1; rad[s] = 0.34;
      xy[s * 2] = (r() * 2 - 1) * 3;
      xy[s * 2 + 1] = (r() * 2 - 1) * 3;
      // density, toughness, stiffness, willingness — clustered so some regions
      // are genuinely alike and others are not.
      const band = (i / n) < 0.5 ? 0.2 : 0.8;
      mat[s * 4] = band + r() * 0.1;
      mat[s * 4 + 1] = band + r() * 0.1;
      mat[s * 4 + 2] = band + r() * 0.1;
      mat[s * 4 + 3] = 0.9;
    }
  }
  const gpu = await DevoGPU.create(device, { nEmbryo: EMB, cap: CAP, nbrK: NB });
  gpu.setUniform(0.04);
  gpu.upload({ live, rad, xy, mat, count, conc: new Float32Array(total * NGENE),
               genome: new Float32Array(EMB * NGENE * GENE_STRIDE) });
  const areaBefore = Array.from(rad).reduce((a, r, i) => a + (live[i] ? r * r : 0), 0);
  // Prove the dispatch is valid before believing any number it produces.
  await gpu.verifyRelax();
  gpu.upload({ live, rad, xy, mat, count });
  gpu.relax(passes);
  const l2 = await gpu.readLive(), r2 = await gpu.readRad();
  const areaAfter = l2.reduce((a, v, i) => a + (v ? r2[i] * r2[i] : 0), 0);
  const aliveBefore = live.reduce((a, v) => a + v, 0);
  const aliveAfter = l2.reduce((a, v) => a + v, 0);
  const fused = Array.from(r2).filter((r, i) => l2[i] && r > 0.38).length;
  gpu.destroy();
  return { aliveBefore, aliveAfter, fused, areaBefore, areaAfter, live: l2, rad: r2 };
}

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) { console.error('no WebGPU adapter'); Deno.exit(1); }
const device = await adapter.requestDevice();

for (const passes of [1, 3, 6]) {
  const a = await run(device, passes);
  console.log(`${passes} pass${passes > 1 ? 'es' : ''}: ${a.aliveBefore} cells -> ${a.aliveAfter}` +
    `  (${a.aliveBefore - a.aliveAfter} fused away, ${a.fused} larger than base)` +
    `   area ${a.areaBefore.toFixed(4)} -> ${a.areaAfter.toFixed(4)}` +
    `  ${Math.abs(a.areaAfter - a.areaBefore) < 1e-3 ? 'CONSERVED' : 'NOT CONSERVED'}`);
}

const x = await run(device, 3);
const y = await run(device, 3);
const same = x.live.every((v, i) => v === y.live[i]) && x.rad.every((v, i) => Math.abs(v - y.rad[i]) === 0);
console.log(same
  ? '  -> DETERMINISTIC: mutual-best gave the same fusion twice, bit for bit.'
  : '  -> NOT DETERMINISTIC.');
