#!/usr/bin/env node
/**
 * Does EVOLUTION find sensing when the world is uncoverable? The findability
 * test the land-control set up.
 *
 *   node tools/land-evolve.js
 *
 * land-control.js proved the WORLD rewards a hand-written sensing policy once it
 * is too large to sweep. The mission's actual open question is whether evolution
 * — which in eight soft-body experiments always found a reflex instead of a
 * sense — will cross to sensing when the world makes it the only way to win.
 *
 * This isolates coverability from every other confound: a MINIMAL, direct-
 * encoded CTRNN (no developmental map, no soft-body physics) drives a point
 * agent in a radial chemical gradient (the diffusion steady-state shape a
 * lib/fields.js source produces). Two sensors read the field ahead-left and
 * ahead-right; two motors set turn and thrust. Fitness is getting to the source,
 * spawn-averaged so it is genetic. Tournament k=2, the one rule that has moved a
 * population here. The decisive measurement is the one every wave used: ablate
 * the sensors on the evolved population and see whether performance collapses —
 * did evolution build a controller that USES the gradient, or a reflex.
 *
 * Run in two worlds: COVERABLE (small, a body sweeps it — reproduce the old-world
 * null) and UNCOVERABLE (large, coverage fails). If evolution finds sensing in
 * the uncoverable world and not the coverable one, coverability is the variable,
 * and the mission's wall was the world all along.
 */
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296; }
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

const N = 8, S = 2, M = 2;                      // neurons, sensors, motors
const LW = N * N, LB = N, LI = S * N, LO = N * M, GENOME = LW + LB + LI + LO;
const STEPS = 500, SRC_R = 0.05, SENSE_OFF = 0.05, REACH = 0.30, DT = 0.2;

function randomGenome(r) { const g = new Float32Array(GENOME); for (let i = 0; i < GENOME; i++) g[i] = (r() * 2 - 1) * 0.8; return g; }
function mutate(g, r, rate, step) { const o = Float32Array.from(g); for (let i = 0; i < o.length; i++) if (r() < rate) o[i] += (r() * 2 - 1) * step; return o; }

// concentration of a source at (sx,sy), the diffusion steady-state (Gaussian) shape
const conc = (x, y, sx, sy) => Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (REACH * REACH));

/** Run one genome in a world of `scale` (larger = harder to cover), K spawns. Returns mean fitness and mean ablated fitness. */
function evaluate(g, scale, seed, ablate) {
  const W = g.subarray(0, LW), B = g.subarray(LW, LW + LB), WI = g.subarray(LW + LB, LW + LB + LI), WO = g.subarray(LW + LB + LI);
  const speed = (1 / 240) / scale;
  const SP = 6;                                  // spawns
  let fit = 0;
  for (let sp = 0; sp < SP; sp++) {
    const r = rng(seed + sp * 2654435761);
    const sx = 0.2 + r() * 0.6, sy = 0.2 + r() * 0.6;
    let x = r(), y = r(), h = r() * 6.283;
    const st = new Float32Array(N);
    let best = Infinity, reached = STEPS;
    for (let t = 0; t < STEPS; t++) {
      // sensors: field ahead-left, ahead-right (finite-difference gradient)
      let s0 = conc(clamp01(x + Math.cos(h - 0.6) * SENSE_OFF), clamp01(y + Math.sin(h - 0.6) * SENSE_OFF), sx, sy);
      let s1 = conc(clamp01(x + Math.cos(h + 0.6) * SENSE_OFF), clamp01(y + Math.sin(h + 0.6) * SENSE_OFF), sx, sy);
      if (ablate) { s0 = 0.15; s1 = 0.15; }      // mean-replacement: information removed
      // CTRNN step
      const ny = new Float32Array(N);
      for (let j = 0; j < N; j++) {
        let rec = 0; for (let i = 0; i < N; i++) rec += Math.tanh(st[i] + B[i]) * W[i * N + j];
        const inp = s0 * WI[0 * N + j] + s1 * WI[1 * N + j];
        ny[j] = st[j] + (rec + inp - st[j]) * DT;
      }
      st.set(ny);
      let turn = 0, thrust = 0;
      for (let j = 0; j < N; j++) { const a = Math.tanh(st[j]); turn += a * WO[j * M + 0]; thrust += a * WO[j * M + 1]; }
      turn = Math.tanh(turn); thrust = Math.tanh(thrust) * 0.5 + 0.5;
      h += turn * 0.3;
      x = clamp01(x + Math.cos(h) * speed * thrust * 2);
      y = clamp01(y + Math.sin(h) * speed * thrust * 2);
      const d = Math.hypot(x - sx, y - sy);
      if (d < best) best = d;
      if (d < SRC_R) { reached = t; break; }
    }
    // fitness: reward getting close and getting there fast
    fit += (reached < STEPS ? 1.0 + (STEPS - reached) / STEPS : Math.max(0, 1 - best / 1.0));
  }
  return fit / SP;
}

function evolve(scale, seed, pop = 60, gens = 40) {
  const r = rng(seed);
  let genomes = Array.from({ length: pop }, () => randomGenome(r));
  let fits = genomes.map((g, i) => evaluate(g, scale, 0x3000 + i));
  for (let gen = 0; gen < gens; gen++) {
    const next = [];
    // elitism (2)
    const order = [...fits.keys()].sort((a, b) => fits[b] - fits[a]);
    next.push(genomes[order[0]], genomes[order[1]]);
    while (next.length < pop) {
      const a = (r() * pop) | 0, b = (r() * pop) | 0;
      const p = fits[a] >= fits[b] ? genomes[a] : genomes[b];
      next.push(mutate(p, r, 0.15, 0.25));
    }
    genomes = next;
    fits = genomes.map((g, i) => evaluate(g, scale, 0x3000 + (gen + 1) * 7919 + i));
  }
  // evaluate champion on held-out spawns, intact vs sensor-ablated
  const champ = genomes[fits.indexOf(Math.max(...fits))];
  const intact = evaluate(champ, scale, 0xBEEF), abl = evaluate(champ, scale, 0xBEEF, true);
  const pm = fits.reduce((a, b) => a + b, 0) / fits.length;
  return { best: Math.max(...fits), mean: pm, intact, ablated: abl, senseDrop: intact - abl };
}

console.log('Does evolution find sensing? Direct-encoded CTRNN, tournament k=2, ablation = did it USE the sense.\n');
console.log('world         gen0mean  evolved  intact  sense-ablated  SENSE-DROP (>0 = sensing is load-bearing)');
for (const [label, scale] of [['COVERABLE (0.6)', 0.6], ['borderline (1.5)', 1.5], ['UNCOVERABLE (4)', 4], ['UNCOVERABLE (8)', 8]]) {
  const seeds = [1, 2, 3];
  const runs = seeds.map(s => evolve(scale, s));
  const avg = k => runs.reduce((a, r) => a + r[k], 0) / runs.length;
  const drop = avg('senseDrop');
  console.log(`${label.padEnd(16)}  ${'-'.padStart(6)}    ${avg('mean').toFixed(2)}    ${avg('intact').toFixed(2)}    ${avg('ablated').toFixed(2)}` +
    `         ${drop >= 0 ? '+' : ''}${drop.toFixed(2)}  ${drop > 0.25 ? 'SENSING EVOLVED' : drop > 0.1 ? 'partial' : 'reflex only'}`);
}
console.log('\nRead: if SENSE-DROP is large in the uncoverable worlds and ~0 in the coverable one,');
console.log('evolution finds sensing exactly when coverage stops working — coverability was the wall.');
