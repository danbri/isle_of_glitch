#!/usr/bin/env node
/**
 * The gate, run on the INCUMBENT substrate.
 *
 *   node tools/incumbent-sensitivity.js --steps 500 --seed 1
 *
 * tools/sb-gate.js asked of the soft body: perturb the genome by eps, how far
 * does behaviour move? It found a curve that rises steeply and saturates. This
 * asks the identical question of `lib/evodevo.js`'s develop() — the twelve-cell
 * line with the hardcoded expression-to-parameter readout — WITHOUT modifying
 * it. If that map is flat where the soft body's rises, then evolution here had
 * nothing to select on regardless of the selection rule or the evaluation
 * noise, and the whole run of organism-side nulls has a single mechanistic
 * cause that has nothing to do with heritability of the evaluation.
 *
 * The incumbent develops the WHOLE population at once, so the POP=192 slots are
 * 192 independent random genomes (genR ~ N(0,0.38), genM ~ N(0,0.75)) in one
 * shot — a larger genome sample than the gate's 24. develop() is deterministic
 * given the genome (a pure tensor relaxation from g=0), so there is no
 * developmental-noise axis to hold fixed; the soft body needed devSeed, this
 * does not. Spawns are matched exactly by capturing one sim.makeInit() and
 * re-applying it (applyInit) before every run, so any behavioural difference is
 * the genome's doing.
 *
 * Perturbation matches sb-gate's perturbGenome exactly: additive N(0,eps^2) on
 * every locus of genR and genM, seeded from a seeded RNG. eps sweeps the same
 * 0.02,0.05,0.12,0.30,0.75,1.6.
 *
 * Behavioural readouts, all per-organism, all already produced by the sim:
 *   displacement  ||final pos - spawn pos||           (matches sb-gate exactly)
 *   turnRMS       sqrt(sum turn^2 / n)  from acc[7]    (klinokinesis: turn magnitude)
 *   thrustRMS     sqrt(sum thrust^2 / n) from acc[10]  (the other motor channel)
 * and one developed-phenotype readout to locate WHERE any flatness lives:
 *   expr          the developed expression tensor [CELLS,GENES] (analogous to
 *                 the gate's `morph`: the genotype->developed-network map).
 *
 * Distance estimator, in the gate's style: for each trait, the perturbed twin's
 * per-organism value minus the base twin's, absolute, averaged over organisms,
 * divided by the base population's own spread so the number is dimensionless and
 * directly comparable with the gate. Also reported: Pearson r between base and
 * perturbed across organisms (1 = ordering preserved, 0 = destroyed) — scale
 * free, so it needs no normalising constant to sit beside the gate.
 *
 * Decomposition of magnitude versus sign structure (RESEARCH.md, "the flatness
 * hypothesis"): three further perturbation modes on the regulatory matrix,
 *   full   x = base + gauss*eps                        (the main curve)
 *   mag    x = sign(base)*|base + gauss*eps|           (magnitudes jittered, signs preserved)
 *   flip   sign of a fraction f of loci flipped, magnitudes exact
 * plus two swap genomes and a random reference,
 *   signOnly  sign(base) * mean|base|   (all magnitude information erased)
 *   magOnly   |base| * random sign      (all sign information erased)
 *   random    a fresh N(0,0.38)/N(0,0.75) genome (the maximally-different scale)
 * If the mag curve is flat where full rises, and magOnly goes as far as random
 * while signOnly stays near base, then the incumbent's Gaussian-jitter-on-dense-
 * weights operator has been perturbing mostly the wrong thing all along.
 */
import { initBackend, parseArgs } from './backend.js';
import { EvoDevoSim, makeRng, mean, sd } from '../lib/evodevo.js';

const a = parseArgs(process.argv.slice(2), {
  steps: 500, seed: 1, pop: 192, evals: 6,
  eps: '0.02,0.05,0.12,0.30,0.75,1.6',
  flips: '0.02,0.05,0.10,0.20,0.35,0.50',
  randRefs: 3, quiet: false, out: '',
});
const EPS = String(a.eps).split(',').map(Number);
const FLIPS = String(a.flips).split(',').map(Number);
const log = (...m) => { if (!a.quiet) console.error(...m); };

const { tf, pkg, backend } = await initBackend({});
log(`[backend] ${pkg} -> ${backend}`);

const sim = new EvoDevoSim({ seed: a.seed, config: { POP: a.pop } });
await sim.initialise();
const C = sim.cfg, POP = C.POP, G = C.GENES, CELLS = C.CELLS;
const LR = G * G, LM = 3 * G, LE = CELLS * G;

/* Base genome snapshot. The 192 slots are 192 independent random genomes. */
const baseR = Float32Array.from(await sim.genR.data());
const baseM = Float32Array.from(await sim.genM.data());

/* Matched spawns. `init` (spawn 0) is applied before every sensitivity run so
 * only the genome varies; the extra spawns drive the repeatability/noise-floor
 * measurement — the same base genome, different spawn, which is exactly what
 * selection sees between evaluations. All drawn from the seeded sim.rng. */
const inits = Array.from({ length: a.evals }, () => sim.makeInit());
const initPositions = await Promise.all(inits.map(i => i.pos.data().then(d => Float32Array.from(d))));
const init = inits[0];

/* Box-Muller off the seeded RNG, so the whole run is reproducible. */
function gaussStream(seed) {
  const r = makeRng(seed); let spare = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0; while (u < 1e-12) u = r.next(); v = r.next();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
}

/** Assign a genome, develop, run at spawn `s` (default 0), read per-organism traits. */
async function runTraits(newR, newM, s = 0) {
  tf.tidy(() => {
    sim.genR.assign(tf.tensor3d(newR, [POP, G, G]));
    sim.genM.assign(tf.tensor3d(newM, [POP, 3, G]));
  });
  await sim.develop();
  await sim.evaluate({ steps: a.steps, init: inits[s], record: true, yieldEvery: 0 });
  const [pos, acc, expr] = await Promise.all([
    sim.pos.data(), sim.acc.data(), sim.expr.data()]);
  const n = sim.accSteps, ip = initPositions[s];
  const disp = new Float64Array(POP), turnR = new Float64Array(POP), thrustR = new Float64Array(POP);
  for (let o = 0; o < POP; o++) {
    const dx = pos[o * 2] - ip[o * 2], dy = pos[o * 2 + 1] - ip[o * 2 + 1];
    disp[o] = Math.hypot(dx, dy);
    turnR[o] = Math.sqrt(Math.max(0, acc[o * C.ACC_COLS + 7]) / n);
    thrustR[o] = Math.sqrt(Math.max(0, acc[o * C.ACC_COLS + 10]) / n);
  }
  return { disp, turnR, thrustR, expr: Float32Array.from(expr) };
}

/* Repeatability, the estimator tools/repeatability.js and sb-gate.js use:
 * R = var(genotype means) / var(all obs), between term bias-corrected by
 * var(within)/E. obs[g][e] = organism g's trait at spawn e. */
function repeatability(obs) {
  const Gn = obs.length, E = obs[0].length, N = Gn * E;
  const means = obs.map(r => r.reduce((s, v) => s + v, 0) / E);
  const grand = means.reduce((s, v) => s + v, 0) / Gn;
  let sw = 0;
  for (let g = 0; g < Gn; g++) for (let e = 0; e < E; e++) sw += (obs[g][e] - means[g]) ** 2;
  const varW = sw / Math.max(1, N - Gn);
  const varMeans = means.reduce((s, v) => s + (v - grand) ** 2, 0) / Math.max(1, Gn - 1);
  const varB = Math.max(0, varMeans - varW / E);
  const total = varB + varW;
  return total > 1e-12 ? varB / total : 0;
}

/* -------- distance estimators, gate style, comparable and scale-free -------- */
const popSD = v => { const m = mean(v); let s = 0; for (const x of v) s += (x - m) ** 2; return Math.sqrt(s / Math.max(1, v.length - 1)); };
function normDist(base, pert) {           // mean|Δ| over organisms, in base-SD units
  const s = Math.max(popSD(base), 1e-9);
  let t = 0; for (let o = 0; o < base.length; o++) t += Math.abs(pert[o] - base[o]);
  return (t / base.length) / s;
}
function pearson(x, y) {
  const mx = mean(x), my = mean(y);
  let cxy = 0, cxx = 0, cyy = 0;
  for (let i = 0; i < x.length; i++) { const p = x[i] - mx, q = y[i] - my; cxy += p * q; cxx += p * p; cyy += q * q; }
  return (cxx <= 1e-12 || cyy <= 1e-12) ? 0 : cxy / Math.sqrt(cxx * cyy);
}
// expr is a [POP, CELLS*GENES] block; per-organism L2 change, normalised by the
// base population RMS of expr — the incumbent analogue of the gate's `morph`.
function exprDist(base, pert) {
  let rms = 0; for (const x of base) rms += x * x; rms = Math.sqrt(rms / base.length) || 1e-9;
  let t = 0;
  for (let o = 0; o < POP; o++) {
    let d = 0; for (let k = 0; k < LE; k++) { const e = pert[o * LE + k] - base[o * LE + k]; d += e * e; }
    t += Math.sqrt(d / LE);
  }
  return (t / POP) / rms;
}
function summarise(base, pert) {
  return {
    exprDist: exprDist(base.expr, pert.expr),
    disp: normDist(base.disp, pert.disp), dispR: pearson(base.disp, pert.disp),
    turn: normDist(base.turnR, pert.turnR), turnRr: pearson(base.turnR, pert.turnR),
    thrust: normDist(base.thrustR, pert.thrustR),
  };
}

/* -------- perturbation constructors, all off seeded gauss streams -------- */
const addGauss = (base, eps, g) => { const o = Float32Array.from(base); for (let i = 0; i < o.length; i++) o[i] += g() * eps; return o; };
const magJitter = (base, eps, g) => { const o = Float32Array.from(base); for (let i = 0; i < o.length; i++) { const s = base[i] < 0 ? -1 : 1; o[i] = s * Math.abs(base[i] + g() * eps); } return o; };
const flipSigns = (base, frac, r) => { const o = Float32Array.from(base); for (let i = 0; i < o.length; i++) if (r.next() < frac) o[i] = -o[i]; return o; };
function signOnlyGenome(base, len) {      // sign(base) * mean|base| within each genome block
  const o = Float32Array.from(base), N = base.length / len;
  for (let n = 0; n < N; n++) { let s = 0; for (let k = 0; k < len; k++) s += Math.abs(base[n * len + k]); const mAbs = s / len;
    for (let k = 0; k < len; k++) { const b = base[n * len + k]; o[n * len + k] = (b < 0 ? -1 : 1) * mAbs; } }
  return o;
}
const magOnlyGenome = (base, r) => { const o = Float32Array.from(base); for (let i = 0; i < o.length; i++) o[i] = Math.abs(base[i]) * (r.next() < 0.5 ? -1 : 1); return o; };
const randGenome = (len, s, g) => { const o = new Float32Array(len); for (let i = 0; i < len; i++) o[i] = g() * s; return o; };

/* ============================ measure ============================ */
const t0 = Date.now();
log(`[base] developing + running ${a.steps} steps, POP=${POP}...`);
const base = await runTraits(baseR, baseM, 0);
log(`[base] disp mean ${mean(base.disp).toFixed(4)} sd ${popSD(base.disp).toFixed(4)} · ` +
    `turnRMS ${mean(base.turnR).toFixed(4)} · thrustRMS ${mean(base.thrustR).toFixed(4)}`);

/* 0. Behavioural repeatability + spawn-noise floor. Same base genome, E spawns.
 * This is the axis against which the sensitivity curve has to be read: the
 * genotype signal is selectable only where perturbing the genome moves
 * behaviour by MORE than changing the spawn does. The noise floor is reported
 * in the same base-SD distance units as the sensitivity curve, so the two sit
 * on one scale. */
log('[0] behavioural repeatability + spawn-noise floor...');
const spawnRuns = [base];
for (let e = 1; e < a.evals; e++) spawnRuns.push(await runTraits(baseR, baseM, e));
// obs[g][e] = organism g's trait at spawn e.
const asGE = key => Array.from({ length: POP }, (_, g) => spawnRuns.map(run => run[key][g]));
const repDisp = repeatability(asGE('disp')), repTurn = repeatability(asGE('turnR')), repThrust = repeatability(asGE('thrustR'));
// Noise floor: typical |Δ| between two spawns of the SAME genome, in base-SD
// units — directly comparable to the perturbation distances below.
const noise = { disp: 0, turn: 0, thrust: 0 };
let pairs = 0;
for (let e = 1; e < a.evals; e++) {
  noise.disp += normDist(base.disp, spawnRuns[e].disp);
  noise.turn += normDist(base.turnR, spawnRuns[e].turnR);
  noise.thrust += normDist(base.thrustR, spawnRuns[e].thrustR);
  pairs++;
}
noise.disp /= pairs; noise.turn /= pairs; noise.thrust /= pairs;
log(`[0] R(disp) ${repDisp.toFixed(3)} R(turn) ${repTurn.toFixed(3)} R(thrust) ${repThrust.toFixed(3)} · ` +
    `noise floor disp ${noise.disp.toFixed(3)} turn ${noise.turn.toFixed(3)}`);

/* 1. the main sensitivity curve: additive gaussian, both genome blocks. */
const full = [];
for (const eps of EPS) {
  const g1 = gaussStream(0xBEEF ^ Math.round(eps * 1e6));
  const pert = await runTraits(addGauss(baseR, eps, g1), addGauss(baseM, eps, g1));
  full.push({ eps, ...summarise(base, pert) });
  log(`[full  eps ${String(eps).padEnd(5)}] expr ${full.at(-1).exprDist.toFixed(3)} · disp ${full.at(-1).disp.toFixed(3)} (r ${full.at(-1).dispR.toFixed(2)}) · turn ${full.at(-1).turn.toFixed(3)} · thrust ${full.at(-1).thrust.toFixed(3)}  (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}

/* 2a. magnitude jitter, signs preserved (regulatory matrix only; genM held at base). */
const mag = [];
for (const eps of EPS) {
  const g1 = gaussStream(0x3A6 ^ Math.round(eps * 1e6));
  const pert = await runTraits(magJitter(baseR, eps, g1), baseM);
  mag.push({ eps, ...summarise(base, pert) });
  log(`[mag   eps ${String(eps).padEnd(5)}] expr ${mag.at(-1).exprDist.toFixed(3)} · disp ${mag.at(-1).disp.toFixed(3)} · turn ${mag.at(-1).turn.toFixed(3)}`);
}

/* 2b. sign flips of a fraction of regulatory loci, magnitudes exact. */
const flip = [];
for (const frac of FLIPS) {
  const r = makeRng(0x5127 ^ Math.round(frac * 1e6));
  const pert = await runTraits(flipSigns(baseR, frac, r), baseM);
  flip.push({ frac, ...summarise(base, pert) });
  log(`[flip  f ${String(frac).padEnd(5)}] expr ${flip.at(-1).exprDist.toFixed(3)} · disp ${flip.at(-1).disp.toFixed(3)} · turn ${flip.at(-1).turn.toFixed(3)}`);
}

/* 3. swap genomes + random reference (regulatory matrix). */
const swaps = {};
swaps.signOnly = summarise(base, await runTraits(signOnlyGenome(baseR, LR), baseM));
log(`[signOnly] expr ${swaps.signOnly.exprDist.toFixed(3)} · disp ${swaps.signOnly.disp.toFixed(3)} · turn ${swaps.signOnly.turn.toFixed(3)}`);
{ const r = makeRng(0x9E1); swaps.magOnly = summarise(base, await runTraits(magOnlyGenome(baseR, r), baseM)); }
log(`[magOnly ] expr ${swaps.magOnly.exprDist.toFixed(3)} · disp ${swaps.magOnly.disp.toFixed(3)} · turn ${swaps.magOnly.turn.toFixed(3)}`);
const randRuns = [];
for (let i = 0; i < a.randRefs; i++) {
  const g1 = gaussStream(0xF00D + i * 7919);
  randRuns.push(summarise(base, await runTraits(randGenome(POP * LR, 0.38, g1), randGenome(POP * LM, 0.75, g1))));
}
const avg = k => mean(randRuns.map(r => r[k]));
swaps.random = { exprDist: avg('exprDist'), disp: avg('disp'), dispR: avg('dispR'), turn: avg('turn'), thrust: avg('thrust') };
log(`[random  ] expr ${swaps.random.exprDist.toFixed(3)} · disp ${swaps.random.disp.toFixed(3)} · turn ${swaps.random.turn.toFixed(3)}  (avg of ${a.randRefs})`);

/* ============================ report ============================ */
const f3 = x => x.toFixed(3);
const out = [];
out.push('\n=== incumbent genotype-to-phenotype sensitivity ===');
out.push(`${POP} random genomes (one population), ${a.steps} steps, seed ${a.seed}, develop() deterministic\n`);
out.push(`BEHAVIOURAL REPEATABILITY   same base genome, ${a.evals} spawns (gate part 2)`);
out.push(`  displacement ${f3(repDisp)}   turnRMS ${f3(repTurn)}   thrustRMS ${f3(repThrust)}`);
out.push('  soft body, for comparison: displacement 0.897  path 0.909  occupancy 0.897');
out.push(`  SPAWN-NOISE FLOOR (base-SD units, same metric as the curve below):`);
out.push(`  displacement ${f3(noise.disp)}   turnRMS ${f3(noise.turn)}   thrustRMS ${f3(noise.thrust)}`);
out.push('  -> a genotype perturbation is selectable only where its distance CLEARS this floor.\n');
out.push('GENOTYPE SENSITIVITY   additive N(0,eps^2) on every locus of genR+genM, matched spawn');
out.push('  distances are mean|Δ| over organisms in base-population-SD units; r is Pearson base-vs-perturbed');
out.push('  eps      expr    disp   (dispR)   turnRMS   thrustRMS');
for (const s of full) out.push(`  ${String(s.eps).padEnd(7)} ${f3(s.exprDist).padStart(6)}  ${f3(s.disp).padStart(6)}  (${f3(s.dispR)})  ${f3(s.turn).padStart(7)}   ${f3(s.thrust).padStart(7)}`);
out.push('\n  soft body, for comparison (RESEARCH.md gate, morph/behav):');
out.push('  eps      morph   behav');
out.push('  0.02     0.077   0.273');
out.push('  0.05     0.093   1.598');
out.push('  0.12     0.524   2.121');
out.push('  0.30     0.720   1.603');
out.push('  0.75     0.973   1.507');
out.push('  1.60     0.984   1.291');

out.push('\nMAGNITUDE vs SIGN   (regulatory matrix genR only; genM held at base)');
out.push('  (a) magnitude jitter, signs preserved:');
out.push('  eps      expr    disp    turnRMS');
for (const s of mag) out.push(`  ${String(s.eps).padEnd(7)} ${f3(s.exprDist).padStart(6)}  ${f3(s.disp).padStart(6)}  ${f3(s.turn).padStart(7)}`);
out.push('  (b) sign flips of a fraction of loci, magnitudes exact:');
out.push('  frac     expr    disp    turnRMS');
for (const s of flip) out.push(`  ${String(s.frac).padEnd(7)} ${f3(s.exprDist).padStart(6)}  ${f3(s.disp).padStart(6)}  ${f3(s.turn).padStart(7)}`);
out.push('  (c) information-swap genomes and the random-genome scale:');
out.push('  genome       expr    disp    turnRMS');
out.push(`  signOnly    ${f3(swaps.signOnly.exprDist).padStart(6)}  ${f3(swaps.signOnly.disp).padStart(6)}  ${f3(swaps.signOnly.turn).padStart(7)}   (magnitudes erased, signs kept)`);
out.push(`  magOnly     ${f3(swaps.magOnly.exprDist).padStart(6)}  ${f3(swaps.magOnly.disp).padStart(6)}  ${f3(swaps.magOnly.turn).padStart(7)}   (signs erased, magnitudes kept)`);
out.push(`  random      ${f3(swaps.random.exprDist).padStart(6)}  ${f3(swaps.random.disp).padStart(6)}  ${f3(swaps.random.turn).padStart(7)}   (fresh genome, the max-distance scale)`);
out.push(`\n[runtime ${((Date.now() - t0) / 1000).toFixed(0)}s]`);
console.log(out.join('\n'));

if (a.out) {
  const fs = await import('node:fs/promises');
  await fs.writeFile(a.out, JSON.stringify({
    settings: { seed: a.seed, steps: a.steps, pop: POP, evals: a.evals, eps: EPS, flips: FLIPS },
    base: { dispMean: mean(base.disp), dispSD: popSD(base.disp), turnMean: mean(base.turnR), thrustMean: mean(base.thrustR) },
    repeatability: { disp: repDisp, turn: repTurn, thrust: repThrust }, noiseFloor: noise,
    full, mag, flip, swaps,
  }, null, 2));
}
for (const i of inits) sim.disposeInit(i);
sim.dispose();
process.exit(0);
