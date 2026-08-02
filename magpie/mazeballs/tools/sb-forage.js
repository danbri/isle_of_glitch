#!/usr/bin/env node
/**
 * Does the sensory loop close? — a mechanistic probe of whether the food-bearing
 * sensor channel can reach the muscles in a GROWN body.
 *
 *   node tools/sb-forage.js --genomes 96 --seed 1
 *
 * For directed foraging to be selectable at all, a sensor cell's food reading has
 * to be able to change what the muscles do. If the developed wiring cannot express
 * "the food channel moves the motor", then selecting on intake is null by
 * construction, and that is a fact about the substrate to be diagnosed here rather
 * than a mystery to be reported after a flat evolution run.
 *
 * The probe is deliberately physics-free: it drives each body's developed CTRNN
 * forward under CLAMPED food input and reads the muscle command u = tanh(act_i +
 * act_j) that the physics kernel would apply to each muscle edge. Isolating the
 * neural map from the mechanics is the point — it answers "can food perturb the
 * motor drive" without the confound of whether that drive then happens to produce
 * displacement in this particular spawn.
 *
 *   1. CENSUS. How many bodies even have the parts — at least one sensor cell AND
 *      at least one muscle edge. No sensor, or no muscle, and the loop is open in
 *      that body for a trivial reason.
 *
 *   2. SCALAR SENSITIVITY. Drive the network to steady state with every sensor
 *      cell's food channel clamped LOW (0) versus HIGH (1, the tanh saturation of
 *      the real read), proprioception held at rest, and measure how far the
 *      time-averaged muscle command moves. A body that responds has a closed
 *      sensor->CTRNN->muscle path.
 *
 *   3. LATERAL SENSITIVITY. The substrate of STEERING, not just of a global gain
 *      change: split the sensor cells by body-frame x, drive left-high/right-low
 *      versus its mirror, and measure the change in the left/right muscle-command
 *      asymmetry. A body that responds can turn its motor output toward the side
 *      the food is on — which is what "turn toward food" requires of the wiring.
 *
 * Same CTRNN update as Colony.kNeural (lib/softbody.js), same DT, so the numbers
 * describe the same network the world runs.
 */
import { parseArgs } from './backend.js';
import {
  DEFAULTS, makeRng, randomGenome, develop, SENSORS,
} from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  genomes: 96, seed: 1, steps: 400, warmup: 200, high: 1.0, tol: 0.01, quiet: false,
});
const cfg = DEFAULTS;
const log = (...m) => { if (!a.quiet) console.error(...m); };

/**
 * Drive a developed phenotype's CTRNN forward with the food channel of its sensor
 * cells clamped to `foodOf(cellIndex)`. Physics-free: proprioception and boundary
 * are held at 0 (rest), so the only exogenous drive is food. Returns the
 * time-averaged muscle command per muscle edge over the post-warmup window.
 */
function driveMuscles(p, foodOf) {
  const n = p.n, dt = cfg.DT;
  const ny = new Float64Array(n), act = new Float64Array(n), ad = new Float64Array(n);
  const sens = new Float64Array(n * SENSORS);
  // muscle edges only
  const me = [];
  for (let e = 0; e < p.nE; e++) if (p.kind[e] === 2) me.push(e);
  const acc = new Float64Array(me.length);
  let counted = 0;
  for (let s = 0; s < a.steps; s++) {
    // clamp sensory input: food on sensor cells, everything else at rest
    for (let i = 0; i < n; i++) {
      const b = i * SENSORS;
      sens[b] = p.isSensor[i] ? foodOf(i) : 0;
      sens[b + 1] = 0; sens[b + 2] = 0; sens[b + 3] = 0;
    }
    for (let i = 0; i < n; i++) act[i] = Math.tanh(ny[i] + p.bias[i] - p.adapt[i] * ad[i]);
    for (let b = 0; b < n; b++) {
      let rec = 0;
      for (let i = 0; i < n; i++) rec += act[i] * p.W[i * n + b];
      let inp = 0;
      const wb = b * SENSORS, sb = b * SENSORS;
      for (let c = 0; c < SENSORS; c++) inp += p.win[wb + c] * sens[sb + c];
      ny[b] += (rec + inp - ny[b]) / p.tau[b] * dt;
      if (ny[b] > 12) ny[b] = 12; else if (ny[b] < -12) ny[b] = -12;
      ad[b] += (act[b] - ad[b]) / p.tauA[b] * dt;
    }
    if (s >= a.warmup) {
      for (let k = 0; k < me.length; k++) {
        const e = me[k];
        acc[k] += Math.tanh(act[p.ei[e]] + act[p.ej[e]]);
      }
      counted++;
    }
  }
  for (let k = 0; k < acc.length; k++) acc[k] /= Math.max(1, counted);
  return { u: acc, me };
}

/** Left/right muscle-command asymmetry: mean u over muscles whose midpoint x<0
 *  minus mean u over muscles whose midpoint x>0. The developed geometry is body-
 *  frame and centroid-centred, so x sign is a genuine left/right split. */
function lateralAsym(p, u, me) {
  let sl = 0, nl = 0, sr = 0, nr = 0;
  for (let k = 0; k < me.length; k++) {
    const e = me[k];
    const mx = 0.5 * (p.x[p.ei[e]] + p.x[p.ej[e]]);
    if (mx < 0) { sl += u[k]; nl++; } else { sr += u[k]; nr++; }
  }
  return (nl ? sl / nl : 0) - (nr ? sr / nr : 0);
}

/* ------------------------------------------------------------------- run */

log(`[sb-forage] ${a.genomes} random genomes, seed ${a.seed}, steps ${a.steps} (warmup ${a.warmup})`);
const rng = makeRng((0x51b0 ^ (a.seed * 2654435761)) >>> 0);

let haveSensor = 0, haveMuscle = 0, haveBoth = 0;
let scalarTested = 0, scalarResp = 0;
let lateralTested = 0, lateralResp = 0, lateralBoth = 0;
const scalarMags = [], lateralMags = [];
let sensorSum = 0, muscleSum = 0;

for (let g = 0; g < a.genomes; g++) {
  const genome = { buf: randomGenome(rng, cfg).buf };
  const devSeed = makeRng((0x51b0 ^ ((g + 1) * 2654435761)) >>> 0);
  const p = develop(genome, cfg, devSeed);
  const nSensor = p.stats.sensors, nMuscle = p.stats.muscles;
  sensorSum += nSensor; muscleSum += nMuscle;
  if (nSensor > 0) haveSensor++;
  if (nMuscle > 0) haveMuscle++;
  if (nSensor === 0 || nMuscle === 0) continue;
  haveBoth++;

  // 2. scalar sensitivity: uniform food low vs high
  const lo = driveMuscles(p, () => 0);
  const hi = driveMuscles(p, () => a.high);
  let d = 0; for (let k = 0; k < lo.u.length; k++) d += Math.abs(hi.u[k] - lo.u[k]);
  d /= Math.max(1, lo.u.length);
  scalarTested++; scalarMags.push(d);
  const scalarClosed = d > a.tol;
  if (scalarClosed) scalarResp++;

  // 3. lateral sensitivity: left-high/right-low vs mirror
  const sensorX = [];
  for (let i = 0; i < p.n; i++) if (p.isSensor[i]) sensorX.push(p.x[i]);
  // need sensor cells on both sides for a genuine lateral drive
  const hasLeft = sensorX.some(x => x < 0), hasRight = sensorX.some(x => x >= 0);
  if (hasLeft && hasRight) {
    lateralBoth++;
    const P = driveMuscles(p, (i) => (p.x[i] < 0 ? a.high : 0));
    const Q = driveMuscles(p, (i) => (p.x[i] < 0 ? 0 : a.high));
    const asymP = lateralAsym(p, P.u, P.me), asymQ = lateralAsym(p, Q.u, Q.me);
    const da = Math.abs(asymP - asymQ);
    lateralTested++; lateralMags.push(da);
    if (da > a.tol) lateralResp++;
  }
}

const pct = (x, n) => n ? (100 * x / n).toFixed(0) + '%' : '—';
const med = (v) => { if (!v.length) return 0; const s = [...v].sort((p, q) => p - q); return s[s.length >> 1]; };
const mx = (v) => v.length ? Math.max(...v) : 0;
const f = x => x.toFixed(4);

console.log(`\n=== does the sensory loop close? : ${a.genomes} random bodies, seed ${a.seed} ===\n`);
console.log('1. morphology census');
console.log(`   have >=1 sensor cell   ${haveSensor}/${a.genomes} (${pct(haveSensor, a.genomes)}), mean ${(sensorSum / a.genomes).toFixed(1)} sensors/body`);
console.log(`   have >=1 muscle edge   ${haveMuscle}/${a.genomes} (${pct(haveMuscle, a.genomes)}), mean ${(muscleSum / a.genomes).toFixed(1)} muscles/body`);
console.log(`   have BOTH (loop wireable) ${haveBoth}/${a.genomes} (${pct(haveBoth, a.genomes)})`);

console.log('\n2. scalar sensitivity — food LOW(0) vs HIGH(' + a.high + '), uniform, physics-free CTRNN');
console.log(`   bodies whose muscle command responds (|Δu| > ${a.tol}): ${scalarResp}/${scalarTested} (${pct(scalarResp, scalarTested)})`);
console.log(`   |Δ muscle command|  median ${f(med(scalarMags))}  max ${f(mx(scalarMags))}`);

console.log('\n3. lateral sensitivity — left-high/right-low vs mirror (the substrate of a turn)');
console.log(`   bodies with sensor cells on both sides: ${lateralBoth}/${haveBoth}`);
console.log(`   of those, muscle L/R asymmetry responds (|Δasym| > ${a.tol}): ${lateralResp}/${lateralTested} (${pct(lateralResp, lateralTested)})`);
console.log(`   |Δ L/R asymmetry|  median ${f(med(lateralMags))}  max ${f(mx(lateralMags))}`);

const verdict = scalarResp > 0 && lateralResp > 0
  ? 'CLOSES — food reaches the muscles, and a lateral food difference reaches the L/R motor asymmetry'
  : scalarResp > 0
    ? 'PARTIAL — food changes global motor drive but no lateral (steering) response found'
    : 'OPEN — the food channel does not reach the muscles in the developed wiring';
console.log(`\nverdict: ${verdict}`);
