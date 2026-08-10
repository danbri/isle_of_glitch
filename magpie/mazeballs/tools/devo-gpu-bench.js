/**
 * Does moving development to the GPU actually pay?
 *
 *   deno run -A --unstable-webgpu tools/devo-gpu-bench.js
 *   BATCH=1024 CAP=64 deno run -A --unstable-webgpu tools/devo-gpu-bench.js
 *
 * Read the numbers carefully, because two things make an unfair comparison easy
 * to produce by accident.
 *
 * CAP IS DISPATCH WIDTH, not body size. Every slot gets a thread whether it
 * holds a cell or not, so CAP=256 with embryos of a dozen cells spends 95% of
 * the GPU on threads that return immediately, while the CPU only ever touches
 * cells that exist. Matching CAP to the cap develop() is given is the honest
 * comparison; not matching it made the GPU look 1.1x when it is 2.7x.
 *
 * THE TWO GROW DIFFERENT AMOUNTS. The GPU run reports more cells because it is
 * not bound by the same yolk budget, so per-egg time flatters it slightly. The
 * per-cell figure is the conservative one.
 */
import * as D from '../lib/devo2.js';
import { DevoGPU } from '../lib/devo-gpu.js';
const { NGENE, GENE_STRIDE } = D;
const seeded = (s) => { let v = s >>> 0; return () => ((v = (Math.imul(v, 1664525) + 1013904223) >>> 0) / 4294967296); };

const BATCH = Number(Deno.env.get('BATCH') ?? 64), CAP = Number(Deno.env.get('CAP') ?? 64), NB = 12, TICKS = 400, DT = 0.04;

// CPU: what the world does today, one egg at a time.
let t0 = performance.now(), cells = 0;
for (let i = 0; i < BATCH; i++) {
  const r = D.develop(D.randomGenome(seeded(4000 + i)), { extent: 12, yolk: 400, maxCells: 60, condense: 0 });
  cells += r.cells.length;
}
const cpuMs = performance.now() - t0;

const ad = await navigator.gpu.requestAdapter();
const dev = await ad.requestDevice();
const total = BATCH * CAP;
const conc = new Float32Array(total * NGENE), genome = new Float32Array(BATCH * NGENE * GENE_STRIDE);
const live = new Uint32Array(total), ready = new Float32Array(total);
const xy = new Float32Array(total * 2), count = new Uint32Array(BATCH), noise = new Float32Array(total);
const nbrI = new Int32Array(total * NB).fill(-1), nbrW = new Float32Array(total * NB);
for (let e = 0; e < BATCH; e++) {
  genome.set(D.randomGenome(seeded(4000 + e)).subarray(0, NGENE * GENE_STRIDE), e * NGENE * GENE_STRIDE);
  const slot = e * CAP; live[slot] = 1; count[e] = 1;
  const r = seeded(7000 + e);
  for (let g = 0; g < NGENE; g++) conc[slot * NGENE + g] = 0.4 + 0.4 * r();
  for (let i = 0; i < CAP; i++) noise[e * CAP + i] = r();
}
const gpu = await DevoGPU.create(dev, { nEmbryo: BATCH, cap: CAP, nbrK: NB });
gpu.divRate = 1.6; gpu.setUniform(DT);
gpu.upload({ conc, genome, live, nbrI, nbrW, ready, xy, count, noise });
await gpu.verify();
gpu.upload({ conc, live, ready, xy, count });
t0 = performance.now();
gpu.run(TICKS);
const counts = await gpu.readCounts();          // forces completion
const gpuMs = performance.now() - t0;
const grown = Array.from(counts).reduce((a, b) => a + b, 0);
console.log(`  CPU develop(): ${BATCH} eggs in ${cpuMs.toFixed(0)} ms = ${(cpuMs / BATCH).toFixed(2)} ms/egg (${cells} cells)`);
console.log(`  GPU batch    : ${BATCH} eggs in ${gpuMs.toFixed(0)} ms = ${(gpuMs / BATCH).toFixed(2)} ms/egg (${grown} cells, ${TICKS} ticks)`);
console.log(`  speedup      : ${(cpuMs / gpuMs).toFixed(1)}x`);
gpu.destroy();
