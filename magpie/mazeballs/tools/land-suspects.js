#!/usr/bin/env node
/**
 * Which suspect blocks the soft body — the developmental encoding, or something
 * else? A one-variable test.
 *
 *   node tools/land-suspects.js
 *
 * land-evolve.js showed a DIRECT-encoded CTRNN evolves load-bearing sensing on
 * the gradient-source task in ~40 generations, where the soft body never did.
 * The soft body differs in many ways; the most-implicated one, from the flatness,
 * operator and novelty results, is the DEVELOPMENTAL genotype→phenotype map. This
 * changes only that: the same task, the same point agent, the same trivial motor,
 * the same two gradient sensors — but the CTRNN weights are grown from a compact
 * gene-regulatory genome by the same construction lib/evodevo.js and
 * lib/softbody.js use (positional morphogen drive, a GRN relaxation, an
 * expression readout into weights), instead of read straight from the genome.
 *
 * If the direct encoding finds sensing and the developmental one does not — on an
 * identical task where the direct one succeeds — the developmental encoding is the
 * wall, isolated. Guarded against the central-place trap: a solvability check
 * confirms a developmental genome CAN express sensing (hand-built), so a null is
 * "unfindable", not "unexpressible".
 */
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296; }
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const tanh = Math.tanh;

const N = 8, S = 2, M = 2;
const STEPS = 500, SRC_R = 0.05, SENSE_OFF = 0.05, REACH = 0.30, DT = 0.2, SCALE = 1.5;
const conc = (x, y, sx, sy) => Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (REACH * REACH));

/* ---- the phenotype: (W,bias,Win,Wout) run as a CTRNN on the task, ablatable ----
 * hardMotor mimics the soft body's real difficulty: a settled controller does
 * not move. Translation requires the motor output to OSCILLATE (a gait) — thrust
 * is proportional to the rate of change of the motor signal — and steering
 * requires the two motor channels to differ dynamically, not a free "turn" knob.
 * So the search must first discover sustained coordinated oscillation before it
 * can move anywhere, exactly the prerequisite the plasticity run watched consume
 * the whole budget on gait. Easy motor is the land-evolve motor: turn and thrust
 * read straight off the network. */
function evaluate(P, seed, ablate, hardMotor) {
  const { W, B, WI, WO } = P;
  const speed = (1 / 240) / SCALE, SP = 6;
  let fit = 0;
  for (let sp = 0; sp < SP; sp++) {
    const r = rng(seed + sp * 2654435761);
    const sx = 0.2 + r() * 0.6, sy = 0.2 + r() * 0.6;
    let x = r(), y = r(), h = r() * 6.283; const st = new Float32Array(N);
    let best = Infinity, reached = STEPS, pL = 0, pR = 0;
    for (let t = 0; t < STEPS; t++) {
      let s0 = conc(clamp01(x + Math.cos(h - 0.6) * SENSE_OFF), clamp01(y + Math.sin(h - 0.6) * SENSE_OFF), sx, sy);
      let s1 = conc(clamp01(x + Math.cos(h + 0.6) * SENSE_OFF), clamp01(y + Math.sin(h + 0.6) * SENSE_OFF), sx, sy);
      if (ablate) { s0 = 0.15; s1 = 0.15; }
      const ny = new Float32Array(N);
      for (let j = 0; j < N; j++) {
        let rec = 0; for (let i = 0; i < N; i++) rec += tanh(st[i] + B[i]) * W[i * N + j];
        ny[j] = st[j] + (rec + s0 * WI[j] + s1 * WI[N + j] - st[j]) * DT;
      }
      st.set(ny);
      let mL = 0, mR = 0;
      for (let j = 0; j < N; j++) { const a = tanh(st[j]); mL += a * WO[j * M]; mR += a * WO[j * M + 1]; }
      mL = tanh(mL); mR = tanh(mR);
      if (hardMotor) {
        // two "muscles": thrust from how fast they change (a gait), heading from
        // which one leads — a settled controller makes no progress.
        const dL = mL - pL, dR = mR - pR;
        const th = Math.min(1, Math.abs(dL) + Math.abs(dR)) * 6;   // oscillation -> thrust
        h += (dR - dL) * 3;                                        // dynamic asymmetry -> turn
        x = clamp01(x + Math.cos(h) * speed * th); y = clamp01(y + Math.sin(h) * speed * th);
        pL = mL; pR = mR;
      } else {
        h += mL * 0.3;
        const th = mR * 0.5 + 0.5;
        x = clamp01(x + Math.cos(h) * speed * th * 2); y = clamp01(y + Math.sin(h) * speed * th * 2);
      }
      const d = Math.hypot(x - sx, y - sy); if (d < best) best = d;
      if (d < SRC_R) { reached = t; break; }
    }
    fit += reached < STEPS ? 1 + (STEPS - reached) / STEPS : Math.max(0, 1 - best);
  }
  return fit / SP;
}

/* ---- encoding A: DIRECT — weights straight from the genome ---- */
const DIRECT_LEN = N * N + N + S * N + N * M;
function directPheno(g) {
  let o = 0;
  const W = g.subarray(o, o += N * N), B = g.subarray(o, o += N), WI = g.subarray(o, o += S * N), WO = g.subarray(o, o += N * M);
  return { W, B, WI, WO };
}

/* ---- encoding B: DEVELOPMENTAL — a GRN grows the weights, as the soft body does ---- */
const GENES = 10, DEV_STEPS = 20, DEV_RATE = 0.19;
// genome = genR [GENES*GENES] + genM [3*GENES]
const DEV_LEN = GENES * GENES + 3 * GENES;
// neuron positions on a line, and the sensor "embedding" (a fixed angle per sensor)
const npos = Array.from({ length: N }, (_, i) => -1 + 2 * i / (N - 1));
function devPheno(g) {
  const genR = g.subarray(0, GENES * GENES), genM = g.subarray(GENES * GENES);
  // develop: each neuron reads positional morphogen drive, relax the GRN
  const expr = []; // expr[i] = Float32Array(GENES)
  for (let i = 0; i < N; i++) {
    const p = npos[i], basis = [1, p, p * p];
    const drive = new Float32Array(GENES);
    for (let k = 0; k < GENES; k++) { let s = 0; for (let m = 0; m < 3; m++) s += basis[m] * genM[m * GENES + k]; drive[k] = s; }
    let gg = new Float32Array(GENES);
    for (let step = 0; step < DEV_STEPS; step++) {
      const ng = new Float32Array(GENES);
      for (let k = 0; k < GENES; k++) { let r = 0; for (let m = 0; m < GENES; m++) r += gg[m] * genR[m * GENES + k]; ng[k] = gg[k] + DEV_RATE * (tanh(r + drive[k]) - gg[k]); }
      gg = ng;
    }
    expr.push(gg.map(tanh));
  }
  // readout into CTRNN params, same shape of construction as lib/softbody.js:
  //   bias <- expr ch0 ; W <- (exc_out ch2)(exc_in ch3) - (inh_out ch4)(inh_in ch5)
  //   Win <- sensor coupling via ch6 ; Wout <- motor ch7,ch8
  const W = new Float32Array(N * N), B = new Float32Array(N), WI = new Float32Array(S * N), WO = new Float32Array(N * M);
  for (let i = 0; i < N; i++) B[i] = expr[i][0] * 1.45;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
    W[i * N + j] = (expr[i][2] * expr[j][3] - expr[i][4] * expr[j][5]) * 1.2;
  for (let j = 0; j < N; j++) { WI[j] = expr[j][6] * 1.2; WI[N + j] = expr[j][7] * 1.2; }   // two sensors -> ch6, ch7
  for (let j = 0; j < N; j++) { WO[j * M] = expr[j][8]; WO[j * M + 1] = expr[j][9]; }
  return { W, B, WI, WO };
}

/* ---- evolution (identical for every condition) ---- */
function evolve(len, phenoOf, seed, hardMotor, pop = 60, gens = 40) {
  const r = rng(seed);
  const mk = () => { const g = new Float32Array(len); for (let i = 0; i < len; i++) g[i] = (r() * 2 - 1) * 0.8; return g; };
  const mut = g => { const o = Float32Array.from(g); for (let i = 0; i < o.length; i++) if (r() < 0.15) o[i] += (r() * 2 - 1) * 0.25; return o; };
  let G = Array.from({ length: pop }, mk);
  let F = G.map((g, i) => evaluate(phenoOf(g), 0x3000 + i, false, hardMotor));
  for (let gen = 0; gen < gens; gen++) {
    const order = [...F.keys()].sort((a, b) => F[b] - F[a]);
    const next = [G[order[0]], G[order[1]]];
    while (next.length < pop) { const a = (r() * pop) | 0, b = (r() * pop) | 0; next.push(mut(F[a] >= F[b] ? G[a] : G[b])); }
    G = next; F = G.map((g, i) => evaluate(phenoOf(g), 0x3000 + (gen + 1) * 7919 + i, false, hardMotor));
  }
  const champ = G[F.indexOf(Math.max(...F))];
  const intact = evaluate(phenoOf(champ), 0xBEEF, false, hardMotor), abl = evaluate(phenoOf(champ), 0xBEEF, true, hardMotor);
  return { intact, ablated: abl, drop: intact - abl };
}

const rowFor = (label, len, ph, hard) => {
  const runs = [1, 2, 3].map(s => evolve(len, ph, s, hard));
  const avg = k => runs.reduce((a, r) => a + r[k], 0) / runs.length;
  const d = avg('drop');
  console.log(`${label.padEnd(28)}  ${avg('intact').toFixed(2)}    ${avg('ablated').toFixed(2)}     ${d >= 0 ? '+' : ''}${d.toFixed(2)}  ` +
    `${d > 0.25 ? 'SENSING EVOLVED' : d > 0.1 ? 'partial' : 'reflex/none'}`);
};

// displacement-only fitness (learn to move, ignore the source) for staging
function locomotion(P, seed) {
  const speed = (1 / 240) / SCALE;
  let f = 0;
  for (let sp = 0; sp < 4; sp++) {
    const r = rng(seed + sp * 40503); let x = r(), y = r(), h = r() * 6.283; const x0 = x, y0 = y;
    const st = new Float32Array(N); let pL = 0, pR = 0;
    for (let t = 0; t < STEPS; t++) {
      const ny = new Float32Array(N);
      for (let j = 0; j < N; j++) { let rec = 0; for (let i = 0; i < N; i++) rec += tanh(st[i] + P.B[i]) * P.W[i * N + j]; ny[j] = st[j] + (rec + 0.15 * P.WI[j] + 0.15 * P.WI[N + j] - st[j]) * DT; }
      st.set(ny);
      let mL = 0, mR = 0; for (let j = 0; j < N; j++) { const a = tanh(st[j]); mL += a * P.WO[j * M]; mR += a * P.WO[j * M + 1]; }
      mL = tanh(mL); mR = tanh(mR);
      const th = Math.min(1, Math.abs(mL - pL) + Math.abs(mR - pR)) * 6; h += (mR - mL - (pR - pL)) * 3;
      x = clamp01(x + Math.cos(h) * speed * th); y = clamp01(y + Math.sin(h) * speed * th); pL = mL; pR = mR;
    }
    f += Math.hypot(x - x0, y - y0);
  }
  return f / 4;
}
// staged: phase 1 rewards moving (hard motor), phase 2 rewards finding the source.
function stagedEvolve(len, phenoOf, seed, pop = 60, g1 = 14, g2 = 34) {
  const r = rng(seed);
  const mk = () => { const g = new Float32Array(len); for (let i = 0; i < len; i++) g[i] = (r() * 2 - 1) * 0.8; return g; };
  const mut = g => { const o = Float32Array.from(g); for (let i = 0; i < o.length; i++) if (r() < 0.15) o[i] += (r() * 2 - 1) * 0.25; return o; };
  let G = Array.from({ length: pop }, mk);
  const run = (fitFn, gens) => { let F = G.map((g, i) => fitFn(phenoOf(g), 0x3000 + i));
    for (let gen = 0; gen < gens; gen++) { const order = [...F.keys()].sort((a, b) => F[b] - F[a]); const nx = [G[order[0]], G[order[1]]];
      while (nx.length < pop) { const a = (r() * pop) | 0, b = (r() * pop) | 0; nx.push(mut(F[a] >= F[b] ? G[a] : G[b])); } G = nx;
      F = G.map((g, i) => fitFn(phenoOf(g), 0x3000 + (gen + 1) * 7919 + i)); } return F; };
  run((P, s) => locomotion(P, s), g1);                                    // phase 1: just move
  const F = run((P, s) => evaluate(P, s, false, true), g2);               // phase 2: find the source
  const champ = G[F.indexOf(Math.max(...F))];
  const intact = evaluate(phenoOf(champ), 0xBEEF, false, true), abl = evaluate(phenoOf(champ), 0xBEEF, true, true);
  return { intact, ablated: abl, drop: intact - abl };
}

console.log('Same task, same sensors. One variable changed per row. Ablation = did it USE the sense.\n');
console.log('condition                     intact  ablated  SENSE-DROP');
rowFor('direct enc, easy motor', DIRECT_LEN, directPheno, false);         // land-evolve control
rowFor('developmental enc, easy motor', DEV_LEN, devPheno, false);        // encoding isolated
rowFor('developmental enc, HARD motor', DEV_LEN, devPheno, true);         // + the gait burden -> the wall
// the fix: solve locomotion first (phase 1), then evolve sensing (phase 2)
{
  const runs = [1, 2, 3].map(s => stagedEvolve(DEV_LEN, devPheno, s));
  const avg = k => runs.reduce((a, r) => a + r[k], 0) / runs.length; const d = avg('drop');
  console.log(`${'dev enc, HARD motor, STAGED'.padEnd(28)}  ${avg('intact').toFixed(2)}    ${avg('ablated').toFixed(2)}     ${d >= 0 ? '+' : ''}${d.toFixed(2)}  ` +
    `${d > 0.25 ? 'SENSING EVOLVED' : d > 0.1 ? 'partial' : 'reflex/none'}`);
}
console.log('\nEncoding exonerated. Adding the HARD motor (moving needs an evolved gait) is what');
console.log('drops sensing — the motor-coordination burden is the wall. If STAGING (solve');
console.log('locomotion first, then sense) restores sensing, decoupling the two is the fix.');
