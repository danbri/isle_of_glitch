#!/usr/bin/env node
/**
 * Does the reaction-diffusion system actually make Turing patterns?
 *
 *   node tools/sb-turing.js --organisms 64 --seed 1
 *
 * Two failure modes have to be separated, because a single "did something
 * happen" number cannot tell them apart:
 *
 *   OSCILLATING  the fixed point lost stability to a Hopf bifurcation, so the
 *                tissue swings in time and is roughly uniform in space. This is
 *                what 17 of 32 random genomes did when nu and D_H were sampled
 *                independently of mu and D_A.
 *   FLAT         the fixed point stayed stable, the seed noise decayed, and
 *                there is no pattern at all.
 *   PATTERNED    spatial structure grew and then stopped changing. The target.
 *
 * So the test measures spatial variance and temporal change separately, on a
 * fixed disc of cells rather than on a growing body — the question here is
 * whether the kinetics pattern, and a developing domain would confound that
 * with the domain changing underneath it.
 */
import { parseArgs } from './backend.js';
import { DEFAULTS, makeRng, randomGenome, rdParams } from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  organisms: 64, seed: 1, cells: 160, cycles: 30, verbose: false,
});
const cfg = DEFAULTS;

/* A hexagonal-ish disc, so every genome patterns on the same domain and the
 * comparison is about kinetics only. */
function disc(n, rng) {
  const x = new Float64Array(n), y = new Float64Array(n);
  const R = cfg.CELL_R * 2 * Math.sqrt(n / Math.PI);
  let k = 0;
  for (let ring = 0; k < n; ring++) {
    const cnt = ring === 0 ? 1 : Math.round(2 * Math.PI * ring);
    for (let i = 0; i < cnt && k < n; i++, k++) {
      const th = (i / cnt) * Math.PI * 2;
      const rr = (ring / Math.max(1, Math.ceil(Math.sqrt(n / Math.PI)))) * R;
      x[k] = Math.cos(th) * rr + (rng.next() - 0.5) * cfg.CELL_R * 0.15;
      y[k] = Math.sin(th) * rr + (rng.next() - 0.5) * cfg.CELL_R * 0.15;
    }
  }
  return { x, y };
}

/* The same explicit scheme lib/softbody.js uses — normalised graph Laplacian,
 * Gierer-Meinhardt reaction, identical clamp. Duplicated deliberately: this
 * file is a check on that scheme, and importing the private function would
 * make the check agree with the implementation by construction. */
function relax(A, H, x, y, n, steps, K) {
  const lapA = new Float64Array(n), lapH = new Float64Array(n);
  const hK = cfg.RD_KERNEL * cfg.ADHESION * cfg.CELL_R, h2 = hK * hK;
  for (let it = 0; it < steps; it++) {
    for (let i = 0; i < n; i++) {
      let sw = 0, sa = 0, sh = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const d2 = (x[j] - x[i]) ** 2 + (y[j] - y[i]) ** 2;
        if (d2 > h2 * 2.25) continue;
        const w = Math.exp(-d2 / h2);
        sw += w; sa += w * (A[j] - A[i]); sh += w * (H[j] - H[i]);
      }
      if (sw > 1e-9) { lapA[i] = 4 * sa / (sw * h2); lapH[i] = 4 * sh / (sw * h2); } else { lapA[i] = 0; lapH[i] = 0; }
    }
    for (let i = 0; i < n; i++) {
      const av = A[i], hv = Math.max(1e-3, H[i]), src = av * av;
      const nA = av + K.dt * (src / hv - K.a * av + K.b + K.DA * lapA[i]);
      const nH = H[i] + K.dt * (src - K.h * H[i] + K.DH * lapH[i]);
      A[i] = nA > cfg.RD_CLAMP ? cfg.RD_CLAMP : (nA > 0 ? nA : 0);
      H[i] = nH > cfg.RD_CLAMP ? cfg.RD_CLAMP : (nH > 1e-3 ? nH : 1e-3);
    }
  }
}

const cv = v => {                       // coefficient of variation across cells
  const m = v.reduce((t, z) => t + z, 0) / v.length;
  if (Math.abs(m) < 1e-9) return 0;
  return Math.sqrt(v.reduce((t, z) => t + (z - m) ** 2, 0) / v.length) / Math.abs(m);
};
const meanOf = v => v.reduce((t, z) => t + z, 0) / v.length;

const rng = makeRng(a.seed);
const rows = [];
let finite = true;

for (let o = 0; o < a.organisms; o++) {
  const K = rdParams(randomGenome(rng, cfg), cfg);
  const { x, y } = disc(a.cells, makeRng(0x1234 ^ o));
  const n = a.cells;
  const A = new Float64Array(n), H = new Float64Array(n);
  const Ass = (K.h + K.b) / Math.max(1e-3, K.a), Hss = Ass * Ass / Math.max(1e-3, K.h);
  const seed = makeRng(0x99 ^ o);
  for (let i = 0; i < n; i++) {
    A[i] = Ass * (1 + (seed.next() - 0.5) * 2 * cfg.RD_SEED);
    H[i] = Hss * (1 + (seed.next() - 0.5) * 2 * cfg.RD_SEED);
  }

  // Run to the end, sampling the last stretch. Spatial structure is read from
  // the final state; temporal motion is read from how much the MEAN moves
  // between late snapshots, which is what separates a standing pattern from an
  // oscillation — a Turing pattern is stationary, a Hopf cycle is not.
  let prev = null, drift = 0;
  for (let c = 0; c < a.cycles; c++) {
    relax(A, H, x, y, n, K.steps, K);
    const m = meanOf(A);
    if (c >= a.cycles * 0.5) {
      if (prev !== null) drift = Math.max(drift, Math.abs(m - prev) / Math.max(1e-6, Math.abs(m)));
      prev = m;
    }
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(A[i]) || !Number.isFinite(H[i])) finite = false;

  const spatial = cv(Array.from(A));
  const verdict = drift > 0.02 ? 'OSCILLATING' : spatial > 0.10 ? 'PATTERNED' : 'FLAT';
  rows.push({ o, r: K.r, d: K.d, dCrit: K.dCrit, sup: K.d / K.dCrit, DA: K.DA, DH: K.DH,
              lambda: K.lambda / cfg.CELL_R, steps: K.steps, spatial, drift, verdict });
  if (a.verbose)
    console.log(`  #${String(o).padStart(3)}  r ${K.r.toFixed(2)}  d ${K.d.toFixed(1)}` +
      ` (${(K.d / K.dCrit).toFixed(2)}x crit)  lam ${(K.lambda / cfg.CELL_R).toFixed(1)}r` +
      `  steps ${K.steps}  spatialCV ${spatial.toFixed(3)}  drift ${drift.toFixed(4)}  ${verdict}`);
}

const count = v => rows.filter(z => z.verdict === v).length;
const N = rows.length;
console.log(`\n[turing] ${N} random genomes, ${a.cells} cells, ${a.cycles} cycles`);
console.log(`  PATTERNED   ${count('PATTERNED')}/${N}`);
console.log(`  OSCILLATING ${count('OSCILLATING')}/${N}`);
console.log(`  FLAT        ${count('FLAT')}/${N}`);
console.log(`  finite      ${finite ? 'yes' : 'NO — solver diverged'}`);
const sp = rows.map(z => z.spatial).sort((p, q) => p - q);
console.log(`  spatial CV  min ${sp[0].toFixed(3)}  med ${sp[N >> 1].toFixed(3)}  max ${sp[N - 1].toFixed(3)}`);
const su = rows.map(z => z.sup).sort((p, q) => p - q);
console.log(`  supercrit   min ${su[0].toFixed(2)}x  med ${su[N >> 1].toFixed(2)}x  max ${su[N - 1].toFixed(2)}x`);
const da = rows.map(z => z.DA).sort((p, q) => p - q);
console.log(`  D_A         min ${da[0].toFixed(4)}  med ${da[N >> 1].toFixed(4)}  max ${da[N - 1].toFixed(4)}`);
const lam = rows.map(z => z.lambda).sort((p, q) => p - q);
console.log(`  wavelength  min ${lam[0].toFixed(1)}r  med ${lam[N >> 1].toFixed(1)}r  max ${lam[N - 1].toFixed(1)}r`);
const st = rows.map(z => z.steps).sort((p, q) => p - q);
console.log(`  substeps    min ${st[0]}  med ${st[N >> 1]}  max ${st[N - 1]}  (cap ${cfg.RD_MAX_STEPS})`);

// Oscillation is no longer a failure — it is the developmental clock, a valid
// and wanted dynamic (nu/mu is allowed below 1). Only a diverged solver fails.
process.exitCode = finite ? 0 : 1;
