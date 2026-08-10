/**
 * Does the same genome grow the same body, every time?
 *
 * This is the property the world does not currently have. green-light.js has
 * shown since the start that the same seed run twice gives different results,
 * and the suspected cause is order-dependent bookkeeping - atomics in the
 * spatial hash, allocation order at birth. Development is where a genome
 * becomes a phenotype, so if anything must be reproducible it is this.
 *
 * The division kernel uses a prefix scan rather than an atomic counter for
 * exactly this reason: a daughter's slot is fixed by the mother's INDEX, not by
 * which lane the hardware happened to schedule first. This checks that the
 * claim is true rather than merely intended.
 *
 *   deno run -A --unstable-webgpu tools/devo-gpu-determinism.js
 */
import * as D from '../lib/devo2.js';
import { DevoGPU } from '../lib/devo-gpu.js';

const { NGENE, GENE_STRIDE } = D;
const seeded = (s) => { let v = s >>> 0; return () => ((v = (Math.imul(v, 1664525) + 1013904223) >>> 0) / 4294967296); };

const EMB = 6, CAP = 256, NB = 12, DT = 0.04;
const TICKS = Number(Deno.env.get('TICKS') ?? 400);

async function grow(device) {
  const total = EMB * CAP;
  const conc = new Float32Array(total * NGENE);
  const genome = new Float32Array(EMB * NGENE * GENE_STRIDE);
  const live = new Uint32Array(total);
  const ready = new Float32Array(total);
  const xy = new Float32Array(total * 2);
  const count = new Uint32Array(EMB);
  const noise = new Float32Array(total);
  const nbrI = new Int32Array(total * NB).fill(-1);
  const nbrW = new Float32Array(total * NB);

  // One zygote per embryo, and a genome from a fixed seed. Identical inputs
  // every run: any difference in the output is the hardware, not the setup.
  for (let e = 0; e < EMB; e++) {
    genome.set(D.randomGenome(seeded(4000 + e)).subarray(0, NGENE * GENE_STRIDE), e * NGENE * GENE_STRIDE);
    const slot = e * CAP;
    live[slot] = 1; count[e] = 1;
    const r = seeded(7000 + e);
    for (let g = 0; g < NGENE; g++) conc[slot * NGENE + g] = 0.4 + 0.4 * r();
    for (let i = 0; i < CAP; i++) noise[e * CAP + i] = r();
  }

  const gpu = await DevoGPU.create(device, { nEmbryo: EMB, cap: CAP, nbrK: NB });
  gpu.divRate = 1.6;
  gpu.setUniform(DT);
  gpu.upload({ conc, genome, live, nbrI, nbrW, ready, xy, count, noise });
  await gpu.verify();
  // verify() consumed a step; reset so both runs see identical state.
  gpu.upload({ conc, live, ready, xy, count });

  for (let t = 0; t < TICKS; t++) { gpu.step(1); gpu.divide(); }
  const counts = await gpu.readCounts();
  const pos = await gpu.readXY();
  gpu.destroy();
  return { counts, pos };
}

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) { console.error('no WebGPU adapter'); Deno.exit(1); }
const device = await adapter.requestDevice();

const a = await grow(device);
const b = await grow(device);

const sameCounts = a.counts.every((v, i) => v === b.counts[i]);
let posDiff = 0, checked = 0;
for (let e = 0; e < EMB; e++) {
  for (let i = 0; i < a.counts[e]; i++) {
    const s = e * CAP + i;
    posDiff = Math.max(posDiff, Math.abs(a.pos[s * 2] - b.pos[s * 2]),
                                 Math.abs(a.pos[s * 2 + 1] - b.pos[s * 2 + 1]));
    checked++;
  }
}
console.log(`${EMB} embryos from one zygote each, ${TICKS} ticks of step+divide`);
console.log(`  cells grown : ${Array.from(a.counts).join(', ')}`);
console.log(`  run 2       : ${Array.from(b.counts).join(', ')}`);
console.log(`  identical counts   : ${sameCounts}`);
console.log(`  max position diff  : ${posDiff} over ${checked} cells`);
console.log(sameCounts && posDiff === 0
  ? '  -> DETERMINISTIC: the same genome grew the same body, bit for bit.'
  : '  -> NOT DETERMINISTIC. Allocation order is leaking into the phenotype.');
