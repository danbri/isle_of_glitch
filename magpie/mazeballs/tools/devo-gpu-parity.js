/**
 * Does the GPU GRN step agree with devo2.js?
 *
 * The step is a pure function of the previous state, which is exactly why it is
 * the first thing to port: for identical inputs the two must produce identical
 * outputs, and any disagreement is a bug rather than a different-but-valid
 * trajectory. Once division is involved that stops being true — allocation
 * order can differ legitimately — so this is the last point at which an exact
 * check is available, and it is worth spending.
 *
 *   deno run -A --unstable-webgpu tools/devo-gpu-parity.js
 */
import * as D from '../lib/devo2.js';
import { DevoGPU } from '../lib/devo-gpu.js';

const { NGENE, K, GENE_STRIDE, N_MATERNAL, OFF_SRC, OFF_W, OFF_BIAS, OFF_DECAY, OFF_DIFF } = D;
const seeded = (s) => { let v = s >>> 0; return () => ((v = (Math.imul(v, 1664525) + 1013904223) >>> 0) / 4294967296); };

const NB = 12;                       // neighbours kept per cell
const CAP = 64;                      // cell slots per embryo
const EMB = 8;                       // embryos in the batch
const STEPS = Number(Deno.env.get('STEPS') ?? 40);
const DT = 0.04;

// A CPU reference for one step, written straight from devo2's inner loop so the
// comparison is against the equation rather than against my memory of it.
const decayOf = (g) => 0.6 * Math.pow(10, Math.max(-1.2, Math.min(1.2, g)));
const diffOf = (g) => 0.02 * Math.pow(10, Math.max(-1, Math.min(2, g)));
const srcOf = (v) => {
  if (!Number.isFinite(v) || v < 0) return -1;
  const s = Math.floor(v) % NGENE;
  return s < 0 ? -1 : s;
};
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
function cpuStep(conc, next, genome, live, nbrI, nbrW, total) {
  for (let slot = 0; slot < total; slot++) {
    if (!live[slot]) continue;
    const e = (slot / CAP) | 0;
    const gBase = e * NGENE * GENE_STRIDE, cBase = slot * NGENE, nBase = slot * NB;
    for (let g = N_MATERNAL; g < NGENE; g++) {
      const gb = gBase + g * GENE_STRIDE;
      let net = genome[gb + OFF_BIAS];
      for (let k = 0; k < K; k++) {
        const sg = srcOf(genome[gb + OFF_SRC + k]);
        if (sg >= 0) net += genome[gb + OFF_W + k] * conc[cBase + sg];
      }
      let lap = 0;
      const df = diffOf(genome[gb + OFF_DIFF]);
      if (df > 0) {
        let acc = 0, cnt = 0;
        for (let q = 0; q < NB; q++) {
          const ni = nbrI[nBase + q];
          if (ni < 0) continue;
          const wgt = nbrW[nBase + q];
          acc += conc[ni * NGENE + g] * wgt; cnt += wgt;
        }
        if (cnt > 0) lap = df * (acc / cnt - conc[cBase + g]);
      }
      const c = conc[cBase + g] + DT * (sigmoid(net) - decayOf(genome[gb + OFF_DECAY]) * conc[cBase + g] + lap);
      next[cBase + g] = c > 0 ? (c < 40 ? c : 40) : 0;
    }
    for (let g = 0; g < N_MATERNAL; g++) next[cBase + g] = conc[cBase + g];
  }
}

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) { console.error('no WebGPU adapter'); Deno.exit(1); }
const device = await adapter.requestDevice();

const total = EMB * CAP;
const conc = new Float32Array(total * NGENE);
const genome = new Float32Array(EMB * NGENE * GENE_STRIDE);
const xy = new Float32Array(total * 2);
const live = new Uint32Array(total);
const nbrI = new Int32Array(total * NB).fill(-1);
const nbrW = new Float32Array(total * NB);

// Each embryo gets a real genome and a scatter of cells, so the test exercises
// the same numbers development does rather than a tidy synthetic case.
const rnd = seeded(20260810);
for (let e = 0; e < EMB; e++) {
  // randomGenome returns the GRN block followed by the synapse block; only the
  // GRN part is the regulatory network the step reads.
  const g0 = D.randomGenome(seeded(900 + e));
  genome.set(g0.subarray(0, NGENE * GENE_STRIDE), e * NGENE * GENE_STRIDE);
  if (Deno.env.get('NOW')) {          // bisect: silence every regulator edge
    for (let g = 0; g < NGENE; g++)
      for (let k = 0; k < K; k++) genome[e * NGENE * GENE_STRIDE + g * GENE_STRIDE + OFF_W + k] = 0;
  }
  if (Deno.env.get('NODIFF')) {       // bisect: no neighbours, so no diffusion
    for (let i = 0; i < nbrI.length; i++) nbrI[i] = -1;
  }
  const n = 20 + ((rnd() * 40) | 0);
  for (let i = 0; i < n; i++) {
    const slot = e * CAP + i;
    live[slot] = 1;
    xy[slot * 2] = (rnd() * 2 - 1) * 6;
    xy[slot * 2 + 1] = (rnd() * 2 - 1) * 6;
    for (let g = 0; g < NGENE; g++) conc[slot * NGENE + g] = rnd() * 0.8;
  }
  // Neighbour lists, by distance, within the embryo only.
  for (let i = 0; i < n; i++) {
    const a = e * CAP + i;
    const near = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const b = e * CAP + j;
      const dx = xy[a * 2] - xy[b * 2], dy = xy[a * 2 + 1] - xy[b * 2 + 1];
      near.push([Math.hypot(dx, dy), b]);
    }
    near.sort((p, q) => p[0] - q[0]);
    for (let q = 0; q < Math.min(NB, near.length); q++) {
      nbrI[a * NB + q] = near[q][1];
      nbrW[a * NB + q] = 1 / (1 + near[q][0]);
    }
  }
}

const gpu = await DevoGPU.create(device, { nEmbryo: EMB, cap: CAP, nbrK: NB });
gpu.setUniform(DT);
gpu.upload({ conc, genome, live, nbrI, nbrW });
// Prove the dispatch is valid before comparing anything. An invalid dispatch is
// a silent no-op and every number below would be the input echoed back.
await gpu.verify();
gpu.upload({ conc });
gpu.step(STEPS);
const got = await gpu.readConc();

let a = conc.slice(), b = new Float32Array(conc.length);
for (let s = 0; s < STEPS; s++) { b.set(a); cpuStep(a, b, genome, live, nbrI, nbrW, total); const t = a; a = b; b = t; }

// SPLIT THE COMPARISON. Maternal genes are copied across untouched by both
// implementations, so a disagreement there is indexing or plumbing and cannot
// be the equation. Regulated genes are the equation. Reporting one number for
// both hides which.
let matRel = 0, regRel = 0;
let maxAbs = 0, maxRel = 0, n = 0, nan = 0;
for (let slot = 0; slot < total; slot++) {
  if (!live[slot]) continue;
  for (let g = 0; g < NGENE; g++) {
    const i = slot * NGENE + g;
    const x = a[i], y = got[i];
    if (!Number.isFinite(y)) { nan++; continue; }
    const d = Math.abs(x - y);
    if (d > maxAbs) maxAbs = d;
    const r = d / Math.max(1e-6, Math.abs(x));
    if (r > maxRel) maxRel = r;
    if (g < N_MATERNAL) { if (r > matRel) matRel = r; }
    else if (r > regRel) regRel = r;
    n++;
  }
}
console.log(`${EMB} embryos, ${live.reduce((s, v) => s + v, 0)} live cells, ${NGENE} genes, ${STEPS} steps`);
console.log(`  compared ${n.toLocaleString()} concentrations`);
console.log(`  max absolute difference ${maxAbs.toExponential(3)}`);
console.log(`  max relative difference ${maxRel.toExponential(3)}`);
console.log(`    maternal genes (a pure copy)  ${matRel.toExponential(3)}` +
            (matRel > 1e-5 ? '   <- INDEXING or plumbing, not the equation' : '   ok'));
console.log(`    regulated genes (the equation) ${regRel.toExponential(3)}`);
console.log(`  non-finite on GPU: ${nan}`);
// f32 accumulation order differs between a scalar JS loop and a GPU lane, so
// bit-identity is not the bar; drift far below the noise the world adds each
// step is. 1e-4 relative over 40 steps of feedback is agreement.
console.log(maxRel < 1e-4 && !nan
  ? '  -> AGREES: the GPU step reproduces devo2 within f32 accumulation order.'
  : '  -> DIFFERS. The kernel is not computing the same equation.');
gpu.destroy();
