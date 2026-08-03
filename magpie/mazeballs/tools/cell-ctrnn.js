#!/usr/bin/env node
/**
 * cell-ctrnn.js — an evo-DEVO, CTRNN swimmer whose cells ARE its sensors,
 * neurons and muscles. This is the goal in miniature (evodevo · ctrnn ·
 * continuous 2D · cells as sensors/muscles/neurons), returned to after the
 * cellworld detour, and built to obey WORLD.md's First Law: no role is a knob,
 * every behaviour is caused from below.
 *
 *   node tools/cell-ctrnn.js
 *
 * THE BODY (development). A genome develops into a ring of P cells around a hub.
 * Each cell has a maternal-gradient coordinate g = angle/2pi in [0,1); a cell's
 * FATE is read from g, exactly the positional-information idea the mission wants:
 * the two cells nearest the front (g near 0 and 1) also become SENSORS; all P are
 * CTRNN NEURONS. The ring springs between adjacent cells are MUSCLES; the hub
 * spokes are stiff bone. Nothing about "sensor/muscle/neuron" is hand-placed per
 * body — it falls out of the gradient + a couple of evolvable dev genes (ring
 * radius, sensor gain). Minimal, but genuinely genotype -> development -> body.
 *
 * THE MIND (ctrnn). Every cell is a continuous-time recurrent neuron:
 *   tau_i * dy_i/dt = -y_i + sum_j W[i][j]*tanh(y_j + b_j) + senseInput_i
 * integrated with small Euler steps — continuous time, recurrent, no per-role
 * speed. Sensor cells add the local sugar reading to their own input. There is
 * no separate "brain": the body's cells think.
 *
 * THE MUSCLES. A ring spring between cells a,b has rest length
 *   L0 * (1 + AMP * tanh((y_a + y_b)/2))
 * so the two cells' neuron states CONTRACT the fibre between them — "muscle is a
 * function of two nodes and their connecting force," per the design. Overdamped
 * viscous physics turns rhythmic, asymmetric contraction into swimming; steering
 * comes from the left/right sensor difference feeding the CTRNN. Thrust is thus
 * an ENERGY/mechanics story, never a set speed.
 *
 * THE ASCENT (evolution). A population evolves (tournament k=2) to swim up a
 * sugar gradient to food, fitness spawn-averaged so it is genetic. We report the
 * fitness ascent AND the decisive test every experiment here uses: ablate the
 * sensors (freeze them to the mean) and see whether performance collapses — did
 * evolution build a body that USES its senses, or a blind reflex gait.
 */
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const P = 6;                                   // body cells = CTRNN neurons
const LW = P * P, LB = P, LT = P;              // recurrent weights, biases, taus
const GENOME = LW + LB + LT + 3;               // + [ampMuscle, senseGain, ringR]
const DT = 0.25, STEPS = 420, MOBIL = 0.9;     // ctrnn/physics step, episode, viscous mobility

function randomGenome(r) { const g = new Float32Array(GENOME); for (let i = 0; i < GENOME; i++) g[i] = (r() * 2 - 1) * 0.7; return g; }
function mutate(g, r, rate, step) { const o = Float32Array.from(g); for (let i = 0; i < o.length; i++) if (r() < rate) o[i] += (r() * 2 - 1) * step; return o; }

// concentration of a diffusion-steady radial source at (sx,sy): a followable gradient
const conc = (x, y, sx, sy, reach) => Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (reach * reach));

/** DEVELOP a genome into a body: ring of P cells, fates from the maternal gradient. */
function develop(g) {
  const amp = 0.35 + 0.5 * (Math.tanh(g[LW + LB + LT]) * 0.5 + 0.5);      // muscle contraction amplitude
  const senseGain = 1.5 * (Math.tanh(g[LW + LB + LT + 1]) * 0.5 + 0.5);   // sensor coupling
  const ringR = 0.10 + 0.06 * (Math.tanh(g[LW + LB + LT + 2]) * 0.5 + 0.5); // developed body radius
  const cells = [], rest = [];
  for (let i = 0; i < P; i++) {
    const th = (i / P) * Math.PI * 2;
    cells.push({ x: Math.cos(th) * ringR, y: Math.sin(th) * ringR });     // developed ring position
  }
  // fate from maternal gradient g_i = i/P: the two cells nearest the front are sensors.
  const isSensor = i => i === 0 || i === P - 1;
  for (let i = 0; i < P; i++) { const j = (i + 1) % P; rest.push(Math.hypot(cells[i].x - cells[j].x, cells[i].y - cells[j].y)); }
  const W = g.subarray(0, LW), B = g.subarray(LW, LW + LB), Traw = g.subarray(LW + LB, LW + LB + LT);
  const tau = Array.from({ length: P }, (_, i) => 0.5 + 2.5 * (Math.tanh(Traw[i]) * 0.5 + 0.5)); // continuous-time constants
  return { cells, rest, amp, senseGain, ringR, W, B, tau, isSensor };
}

/** One episode: develop, then swim toward food. Returns {start, best} distances
 *  (centroid-to-food at t0 and closest approach) so fitness can reward PROGRESS. */
function episode(body, seed, ablate) {
  const r = rng(seed);
  const reach = 1.5;                                                      // gradient reaches back over the travel
  const fa = r() * 6.283, fr = 1.8 + r() * 0.8;                          // food far enough that you must swim to it
  const sx = Math.cos(fa) * fr, sy = Math.sin(fa) * fr;
  // place body at origin, random heading
  const h0 = r() * 6.283, ch = Math.cos(h0), sh = Math.sin(h0);
  const cx = body.cells.map(c => c.x * ch - c.y * sh), cy = body.cells.map(c => c.x * sh + c.y * ch);
  const vx = new Float64Array(P), vy = new Float64Array(P), y = new Float64Array(P);
  let best = Infinity, start = Math.hypot(sx, sy);                        // centroid starts ~origin
  for (let t = 0; t < STEPS; t++) {
    // body centroid
    let mx = 0, my = 0; for (let i = 0; i < P; i++) { mx += cx[i]; my += cy[i]; } mx /= P; my /= P;
    const d = Math.hypot(mx - sx, my - sy); if (d < best) best = d;
    // SENSORS: each sensor cell reads the sugar concentration at its own position
    const sense = new Float64Array(P);
    for (let i = 0; i < P; i++) if (body.isSensor(i)) sense[i] = ablate ? 0.2 : conc(cx[i], cy[i], sx, sy, reach) * body.senseGain;
    // CTRNN: continuous-time recurrent update of every cell/neuron
    const ny = new Float64Array(P);
    for (let i = 0; i < P; i++) {
      let net = 0; for (let j = 0; j < P; j++) net += body.W[i * P + j] * Math.tanh(y[j] + body.B[j]);
      ny[i] = y[i] + (DT / body.tau[i]) * (-y[i] + net + sense[i]);
    }
    for (let i = 0; i < P; i++) y[i] = ny[i];
    // MUSCLES: ring springs contract with the two cells' neuron states; hub spokes are stiff
    const K_MUS = 34, K_BONE = 40;
    for (let i = 0; i < P; i++) {
      const j = (i + 1) % P;
      const L = body.rest[i] * (1 + body.amp * Math.tanh((y[i] + y[j]) / 2));  // active rest length
      let dx = cx[j] - cx[i], dy = cy[j] - cy[i], dl = Math.hypot(dx, dy) || 1e-6;
      const f = K_MUS * (dl - L) / dl;
      vx[i] += f * dx * DT; vy[i] += f * dy * DT; vx[j] -= f * dx * DT; vy[j] -= f * dy * DT;
      // bone spoke to centroid keeps the body from collapsing (structure, not drive)
      const bx = mx - cx[i], by = my - cy[i], bl = Math.hypot(bx, by) || 1e-6, bf = K_BONE * (bl - body.ringR) / bl;
      vx[i] += bf * bx * DT; vy[i] += bf * by * DT;
    }
    // overdamped viscous integration (no inertia buildup) — same law for every cell
    for (let i = 0; i < P; i++) { vx[i] *= MOBIL; vy[i] *= MOBIL; cx[i] += vx[i] * DT; cy[i] += vy[i] * DT; }
  }
  return { start, best };
}

// FIXED spawn seeds — the SAME food placements for every genome in every
// generation, so selection is consistent and the mean can genuinely ascend.
const SPAWNS = [0x51ed1, 0x51ed2, 0x51ed3, 0x51ed4, 0x51ed5];
function fitness(g, _seed, ablate) {
  const body = develop(g);
  let f = 0;
  for (const s of SPAWNS) { const e = episode(body, s, ablate); f += Math.max(0, e.start - e.best); } // PROGRESS toward food
  return f / SPAWNS.length;
}

function evolve(seed, pop = 60, gens = 60) {
  const r = rng(seed);
  let G = Array.from({ length: pop }, () => randomGenome(r));
  let F = G.map((g, i) => fitness(g, 0x100 + i));
  const gen0 = F.reduce((a, b) => a + b, 0) / pop;
  for (let gen = 0; gen < gens; gen++) {
    const order = [...F.keys()].sort((a, b) => F[b] - F[a]);
    const next = [G[order[0]], G[order[1]]];                              // elitism
    while (next.length < pop) { const a = (r() * pop) | 0, b = (r() * pop) | 0; next.push(mutate(F[a] >= F[b] ? G[a] : G[b], r, 0.14, 0.22)); }
    G = next; F = G.map((g, i) => fitness(g, 0x100 + (gen + 1) * 7919 + i));
  }
  const champ = G[F.indexOf(Math.max(...F))];
  const intact = fitness(champ, 0xBEEF), abl = fitness(champ, 0xBEEF, true);
  return { gen0, mean: F.reduce((a, b) => a + b, 0) / pop, best: Math.max(...F), intact, ablated: abl, drop: intact - abl, champ };
}

if (process.argv[1] && process.argv[1].endsWith('cell-ctrnn.js')) {
  console.log('cell-CTRNN swimmer: cells are neurons; ring springs are muscles; 2 cells sense. evodevo + ctrnn.\n');
  console.log('seed  gen0mean  evolved-mean  champ-best  intact  sense-ablated  SENSE-DROP');
  const seeds = [1, 2, 3];
  const runs = seeds.map(s => { const R = evolve(s); console.log(
    `${String(s).padStart(4)}  ${R.gen0.toFixed(3).padStart(7)}   ${R.mean.toFixed(3).padStart(10)}   ${R.best.toFixed(3).padStart(8)}   ${R.intact.toFixed(3)}   ${R.ablated.toFixed(3).padStart(11)}     ${R.drop >= 0 ? '+' : ''}${R.drop.toFixed(3)}`); return R; });
  const avg = k => runs.reduce((a, r) => a + r[k], 0) / runs.length;
  console.log(`\nascent: gen0 ${avg('gen0').toFixed(3)} -> evolved ${avg('mean').toFixed(3)} (best ${avg('best').toFixed(3)})`);
  const drop = avg('drop');
  console.log(`sense-drop ${drop >= 0 ? '+' : ''}${drop.toFixed(3)}: ${drop > 0.15 ? 'SENSING IS LOAD-BEARING — the body uses its senses' : drop > 0.05 ? 'partial' : 'reflex gait — sensing not yet load-bearing (the known wall)'}`);
  console.log('\nascent = evolution improved the swimmer; sense-drop = did the evolved body USE its sensor cells.');
}

export { develop, episode, fitness, evolve, GENOME, P };
