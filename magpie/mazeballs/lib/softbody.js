/**
 * Soft-body evo/devo — a parallel substrate.
 *
 * The incumbent organism (lib/evodevo.js) has a morphology that cannot evolve:
 * twelve cells on a fixed line, a differential drive, two motor channels. Every
 * organism-side experiment in this project has added *parameters* to that body
 * and every one has been null. This file is the other thing you can do about
 * that — make the body itself something development discovers.
 *
 * An organism here is a clump of cells in the plane. Each cell holds a gene
 * state, reads a maternal gradient at its own position, relaxes a
 * gene-regulatory network, and from the resulting expression either divides,
 * dies, or takes a role: sensor, muscle, or plain neuron. Cells adhere to their
 * neighbours; the adhesion edges are the skeleton. Some of those edges are
 * muscles, whose rest length is driven by the CTRNN activations of the two
 * cells they connect. Ground friction is Coulomb with a static threshold and a
 * per-cell coefficient, so a travelling wave of contraction crawls.
 *
 * Development and lifetime stay two distinct stages, exactly as in the
 * incumbent: `develop()` runs once and returns a frozen phenotype; `Colony`
 * then runs that phenotype in the world and never touches the genome again.
 *
 * COMPUTE PATH. This is written as a set of *kernels* — per-particle and
 * per-edge loops with no sequential dependency between elements — over flat
 * structure-of-arrays typed buffers of fixed capacity (N_MAX cells, E_MAX
 * edges per organism, with an alive mask). That is the WGSL dispatch shape:
 * each `k*` function below is one compute pass, and the Jacobi accumulate /
 * apply split exists precisely so the constraint solve has no read-write
 * hazard between workgroups. Gauss-Seidel would be faster per iteration on a
 * CPU and impossible on a GPU, so it is not used. The host box has no GPU
 * (no `navigator.gpu` under Node 22, no Deno, no /dev/dri), so what actually
 * runs is the typed-array fallback; the shape is kept anyway because the
 * shape, not the speed, is the thing that would have to be rewritten later.
 *
 * NUMERICS. Soft bodies fail by producing NaN, not by scoring badly, and a NaN
 * that reaches a fitness function is silent corruption rather than a bad
 * result. So: velocities are clamped, per-iteration constraint corrections are
 * clamped, muscle rest lengths are capped as a *ratio* of the developed rest
 * length, and `assertFinite` scans every position and velocity on demand.
 */

/** Deterministic LCG, identical in construction to lib/evodevo.js makeRng. */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 0x8f3d20a1;
  const step = () => (s = (Math.imul(1664525, s) + 1013904223) >>> 0);
  return { next: () => step() / 4294967296, int: () => step(), state: () => s };
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const gauss = (rng) => {
  // Irwin-Hall(4), rescaled: bounded tails, so a genome draw can never emit a
  // 6-sigma weight that makes the first GRN relaxation rail on step one.
  let s = 0; for (let i = 0; i < 4; i++) s += rng.next();
  return (s - 2) * 1.0;
};

/* ------------------------------------------------------------------ genes */

/**
 * Gene readout. Genes 0..18 have a phenotypic readout; 19..21 have none and
 * exist only to feed back through the regulatory matrix, which is what makes
 * the network something other than a direct genome->phenotype lookup.
 */
export const G = Object.freeze({
  DIV: 0,      // division propensity
  DIE: 1,      // apoptosis propensity
  POLX: 2,     // division polarity, x
  POLY: 3,     // division polarity, y
  SIZE: 4,     // cell radius modulation
  SENSOR: 5,   // sensor role score
  MUSCLE: 6,   // muscle role score
  BIAS: 7,     // CTRNN bias
  TAU: 8,      // CTRNN time constant
  OUT_E: 9,    // presynaptic excitatory
  IN_E: 10,    // postsynaptic excitatory
  OUT_I: 11,   // presynaptic inhibitory
  IN_I: 12,    // postsynaptic inhibitory
  AMP: 13,     // muscle amplitude and sign
  GRIP: 14,    // ground friction coefficient
  RCP: 15,     // receptor weights, one per sensor channel: 15..18
});
export const GENES = 22;
export const SENSORS = 4;   // odour mass, boundary, own speed, own strain
export const MATERNAL = 6;  // bias, x, y, radial, clock, local density

export const DEFAULTS = Object.freeze({
  N_MAX: 64,
  E_MAX: 320,
  SEED_CELLS: 4,

  // ------------------------------------------------------------ development
  DEV_CYCLES: 14,          // growth cycles; each one is GRN + fate + mechanics
  GRN_STEPS: 6,            // relaxation steps of the regulatory network per cycle
  GRN_RATE: 0.19,          // same relaxation rate as the incumbent's develop()
  DEV_RELAX: 6,            // mechanical relaxation iterations per cycle
  DEV_SCALE: 0.13,         // length scale of the maternal coordinate gradient
  DIV_THRESH: 0.35,
  DIE_THRESH: 0.62,
  MIN_CELLS: 4,            // apoptosis never takes the body below this
  DIV_JITTER: 0.10,        // fraction of a cell radius of noise on the division axis
  CELL_R: 0.020,
  SIZE_RANGE: 0.35,        // radius = CELL_R * (1 +- SIZE_RANGE * tanh(expr[SIZE]))
  ADHESION: 2.45,          // edge if separation < ADHESION * mean radius
  DEV_JITTER: 0,           // per-spawn jitter on the initial clump (developmental noise)

  // ---------------------------------------------------------------- neural
  GAIN: 0.5,               // scales the developed recurrent matrix, as in the incumbent
  SYN_SIGMA2: 0.0060,      // distance kernel on synapses: neighbours wire together
  TAU_MIN: 0.24, TAU_SPAN: 1.65,
  BIAS_SCALE: 1.45,
  IN_SCALE: 1.18,

  // --------------------------------------------------------------- physics
  DT: 0.015,
  ITERS: 10,               // XPBD Jacobi iterations per step
  OMEGA: 0.55,             // Jacobi under-relaxation; >1 diverges on this topology
  COMPLIANCE: 2.0e-6,      // structural springs (XPBD alpha, world-units^2/force)
  MUSCLE_THRESH: 0.15,     // an edge is a muscle if min(expr[MUSCLE]) exceeds this
  MUSCLE_AMP: 0.34,        // maximum fractional rest-length change
  MUSCLE_MIN: 0.62, MUSCLE_MAX: 1.38,  // hard cap on L/L0, whatever the drive says
  MU_MIN: 0.10, MU_MAX: 2.20,          // Coulomb friction coefficient range
  DRAG: 0.90,              // per-step linear velocity retention
  V_MAX: 1.20,             // hard velocity clamp, world units / second
  DX_MAX: 0.35,            // per-iteration positional correction clamp, in cell radii
  WORLD_BOUND: 0.94,

  // ------------------------------------------------------------------ food
  FOOD: 42, FOOD_CLUSTERS: 9, FOOD_CLUSTER_SIGMA: 0.12,
  FOOD_SENSE_SIGMA2: 0.050, FOOD_EAT_SIGMA2: 0.0018,
  FOOD_CONSUME: 0.40, FOOD_REGROW: 0.09, FOOD_RELOCATE_THRESH: 0.15,
});

/* ---------------------------------------------------------------- genome */

/**
 * A genome is the maternal-drive matrix and the gene-gene regulatory matrix,
 * which is the same pair the incumbent evolves (`morph`/`genM` and `genR`) —
 * deliberately, so that if this substrate ever gets an evolutionary loop the
 * mutation operator is the one already in the project.
 */
export function randomGenome(rng, cfg = DEFAULTS) {
  const M = new Float32Array(MATERNAL * GENES);
  const R = new Float32Array(GENES * GENES);
  for (let i = 0; i < M.length; i++) M[i] = gauss(rng) * 0.85;
  for (let i = 0; i < R.length; i++) R[i] = gauss(rng) * 0.55;
  return { M, R };
}

/* ----------------------------------------------------------- development */

/**
 * Grow one organism. Returns a frozen phenotype in a body-local frame centred
 * on the clump's centroid; `Colony` places and orients it in the world.
 *
 * The loop is: read the maternal gradient at each cell's current position,
 * relax the GRN, act on the fate genes (die, divide), then let the clump relax
 * mechanically so that the next cycle's positional readings reflect the new
 * geometry. Position feeds the genes and the genes feed position; that
 * coupling is the whole point, and it is why morphology is not a genome
 * lookup.
 */
export function develop(genome, cfg = DEFAULTS, rng = makeRng(1)) {
  const N = cfg.N_MAX;
  const x = new Float64Array(N), y = new Float64Array(N);
  const alive = new Uint8Array(N);
  const g = new Float32Array(N * GENES);
  const rad = new Float64Array(N);
  const mat = new Float32Array(MATERNAL);
  const drive = new Float32Array(GENES);
  const tmp = new Float32Array(GENES);
  const { M, R } = genome;

  // Seed clump: a small ring, so the maternal x/y gradient has something to
  // read on cycle zero rather than a degenerate point at the origin.
  let n = 0;
  for (let i = 0; i < cfg.SEED_CELLS; i++) {
    const a = (i / cfg.SEED_CELLS) * Math.PI * 2;
    const jx = cfg.DEV_JITTER ? (rng.next() - 0.5) * 2 * cfg.DEV_JITTER : 0;
    const jy = cfg.DEV_JITTER ? (rng.next() - 0.5) * 2 * cfg.DEV_JITTER : 0;
    x[i] = Math.cos(a) * cfg.CELL_R + jx;
    y[i] = Math.sin(a) * cfg.CELL_R + jy;
    alive[i] = 1; rad[i] = cfg.CELL_R; n++;
  }

  const S = cfg.DEV_SCALE;
  const born = new Int32Array(N).fill(-1);   // cycle a cell was created

  for (let cyc = 0; cyc < cfg.DEV_CYCLES; cyc++) {
    // --- kernel: maternal read + GRN relaxation, one invocation per cell ----
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      // Local density: how many living cells sit within two radii. Contact
      // inhibition needs a signal to inhibit on, and this is the cheapest one
      // that is genuinely about the shape of the body rather than about the
      // cell's own coordinates.
      let dens = 0;
      for (let j = 0; j < N; j++) {
        if (!alive[j] || j === i) continue;
        const dx = x[j] - x[i], dy = y[j] - y[i];
        if (dx * dx + dy * dy < (2.2 * cfg.CELL_R) ** 2) dens++;
      }
      const r2 = (x[i] * x[i] + y[i] * y[i]) / (S * S);
      mat[0] = 1;
      mat[1] = clamp(x[i] / S, -3, 3);
      mat[2] = clamp(y[i] / S, -3, 3);
      mat[3] = Math.exp(-0.5 * r2);
      mat[4] = cyc / Math.max(1, cfg.DEV_CYCLES - 1);
      mat[5] = Math.min(1.5, dens / 6);
      for (let k = 0; k < GENES; k++) {
        let s = 0;
        for (let m = 0; m < MATERNAL; m++) s += mat[m] * M[m * GENES + k];
        drive[k] = s;
      }
      const base = i * GENES;
      for (let it = 0; it < cfg.GRN_STEPS; it++) {
        for (let k = 0; k < GENES; k++) {
          let s = drive[k];
          for (let m = 0; m < GENES; m++) s += g[base + m] * R[m * GENES + k];
          tmp[k] = Math.tanh(s);
        }
        for (let k = 0; k < GENES; k++) g[base + k] += (tmp[k] - g[base + k]) * cfg.GRN_RATE;
      }
    }

    // --- kernel: apoptosis, one invocation per cell ------------------------
    // Evaluated against a snapshot count so that "never below MIN_CELLS" does
    // not depend on the order cells are visited in.
    let liveCount = n;
    for (let i = 0; i < N; i++) {
      if (!alive[i] || born[i] === cyc) continue;
      if (Math.tanh(g[i * GENES + G.DIE]) > cfg.DIE_THRESH && liveCount > cfg.MIN_CELLS) {
        alive[i] = 0; liveCount--; n--;
      }
    }

    // --- kernel: division, one invocation per cell -------------------------
    // Writes into the first free slot (the "dead" slots left by apoptosis are
    // reused, which is what the alive mask buys). Collected first, applied
    // after, so a daughter cannot itself divide within the same cycle.
    const wantDivide = [];
    for (let i = 0; i < N; i++) {
      if (!alive[i] || born[i] === cyc) continue;
      if (Math.tanh(g[i * GENES + G.DIV]) > cfg.DIV_THRESH) wantDivide.push(i);
    }
    for (const i of wantDivide) {
      if (n >= N) break;
      let slot = -1;
      for (let s = 0; s < N; s++) if (!alive[s]) { slot = s; break; }
      if (slot < 0) break;
      const e = i * GENES;
      let px = Math.tanh(g[e + G.POLX]), py = Math.tanh(g[e + G.POLY]);
      px += (rng.next() - 0.5) * cfg.DIV_JITTER;
      py += (rng.next() - 0.5) * cfg.DIV_JITTER;
      const len = Math.hypot(px, py) || 1;
      px /= len; py /= len;
      const off = rad[i] * 0.62;
      const cx = x[i], cy = y[i];
      x[i] = cx - px * off; y[i] = cy - py * off;
      x[slot] = cx + px * off; y[slot] = cy + py * off;
      alive[slot] = 1; rad[slot] = rad[i]; born[slot] = cyc; n++;
      // Daughter inherits the mother's gene state. It differentiates because it
      // is somewhere else and therefore reads a different maternal gradient —
      // positional information, not an inheritance rule.
      for (let k = 0; k < GENES; k++) g[slot * GENES + k] = g[e + k];
    }

    // --- kernel: cell radius from expression -------------------------------
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      rad[i] = cfg.CELL_R * (1 + cfg.SIZE_RANGE * Math.tanh(g[i * GENES + G.SIZE]));
    }

    // --- mechanical relaxation of the clump --------------------------------
    relaxClump(x, y, rad, alive, N, cfg.DEV_RELAX, cfg);
  }

  // Final expression, and a compacted index list. Everything downstream reads
  // `idx`, so the O(n^2) neural and collision passes cost alive^2 rather than
  // N_MAX^2 — the alive mask is a storage decision, not a compute one.
  const expr = new Float32Array(N * GENES);
  for (let i = 0; i < N * GENES; i++) expr[i] = Math.tanh(g[i]);
  const idx = [];
  for (let i = 0; i < N; i++) if (alive[i]) idx.push(i);

  // Recentre on the body centroid so spawn placement means what it says.
  let cx = 0, cy = 0;
  for (const i of idx) { cx += x[i]; cy += y[i]; }
  cx /= idx.length; cy /= idx.length;
  for (const i of idx) { x[i] -= cx; y[i] -= cy; }

  /* ---------------------------------------------------- adhesion skeleton */
  const ei = new Int32Array(cfg.E_MAX), ej = new Int32Array(cfg.E_MAX);
  const L0 = new Float64Array(cfg.E_MAX), amp = new Float64Array(cfg.E_MAX);
  const kind = new Uint8Array(cfg.E_MAX);      // 1 = passive, 2 = muscle
  let nE = 0;
  for (let a = 0; a < idx.length && nE < cfg.E_MAX; a++) {
    for (let b = a + 1; b < idx.length && nE < cfg.E_MAX; b++) {
      const i = idx[a], j = idx[b];
      const d = Math.hypot(x[j] - x[i], y[j] - y[i]);
      const reach = cfg.ADHESION * 0.5 * (rad[i] + rad[j]);
      if (d > reach || d < 1e-6) continue;
      ei[nE] = i; ej[nE] = j; L0[nE] = d;
      const mi = expr[i * GENES + G.MUSCLE], mj = expr[j * GENES + G.MUSCLE];
      if (Math.min(mi, mj) > cfg.MUSCLE_THRESH) {
        kind[nE] = 2;
        amp[nE] = cfg.MUSCLE_AMP *
          Math.tanh(0.5 * (expr[i * GENES + G.AMP] + expr[j * GENES + G.AMP]));
      } else { kind[nE] = 1; amp[nE] = 0; }
      nE++;
    }
  }

  /* --------------------------------------------------------------- CTRNN */
  // Same construction as the incumbent's develop(): an excitatory outer
  // product minus an inhibitory one, gated by a distance kernel — except the
  // distances are now the body's real geometry rather than a fixed line, so
  // wiring is a consequence of morphology.
  const nA = idx.length;
  const W = new Float64Array(nA * nA);
  const bias = new Float64Array(nA), tau = new Float64Array(nA);
  const win = new Float64Array(nA * SENSORS);
  const grip = new Float64Array(nA);
  const isSensor = new Uint8Array(nA);
  for (let a = 0; a < nA; a++) {
    const i = idx[a], e = i * GENES;
    bias[a] = expr[e + G.BIAS] * cfg.BIAS_SCALE;
    tau[a] = cfg.TAU_MIN + cfg.TAU_SPAN / (1 + Math.exp(-expr[e + G.TAU]));
    grip[a] = cfg.MU_MIN + (cfg.MU_MAX - cfg.MU_MIN) * 0.5 * (1 + expr[e + G.GRIP]);
    const sg = Math.max(0, expr[e + G.SENSOR]);
    isSensor[a] = sg > 0.15 ? 1 : 0;
    for (let c = 0; c < SENSORS; c++)
      win[a * SENSORS + c] = sg * expr[e + G.RCP + c] * cfg.IN_SCALE;
  }
  for (let a = 0; a < nA; a++) {
    const i = idx[a];
    for (let b = 0; b < nA; b++) {
      const j = idx[b];
      const d2 = (x[j] - x[i]) ** 2 + (y[j] - y[i]) ** 2;
      const k = Math.exp(-d2 / cfg.SYN_SIGMA2);
      const w = (expr[i * GENES + G.OUT_E] * expr[j * GENES + G.IN_E]
               - expr[i * GENES + G.OUT_I] * expr[j * GENES + G.IN_I]) * k * 2.0;
      W[a * nA + b] = w * (cfg.GAIN / 2.0);       // W[from, to]
    }
    W[a * nA + a] += expr[i * GENES + G.OUT_E] * 0.65 * (cfg.GAIN / 2.0);
  }

  // Remap edge endpoints into the compact index space.
  const back = new Int32Array(N).fill(-1);
  for (let a = 0; a < nA; a++) back[idx[a]] = a;
  const cei = new Int32Array(nE), cej = new Int32Array(nE);
  for (let e = 0; e < nE; e++) { cei[e] = back[ei[e]]; cej[e] = back[ej[e]]; }

  // Compact geometry.
  const px = new Float64Array(nA), py = new Float64Array(nA), pr = new Float64Array(nA);
  for (let a = 0; a < nA; a++) { px[a] = x[idx[a]]; py[a] = y[idx[a]]; pr[a] = rad[idx[a]]; }

  let ext = 0, muscles = 0;
  for (let a = 0; a < nA; a++) ext = Math.max(ext, Math.hypot(px[a], py[a]));
  for (let e = 0; e < nE; e++) if (kind[e] === 2) muscles++;
  let sensors = 0; for (let a = 0; a < nA; a++) sensors += isSensor[a];

  return {
    n: nA, x: px, y: py, rad: pr,
    nE, ei: cei, ej: cej, L0: L0.slice(0, nE), amp: amp.slice(0, nE), kind: kind.slice(0, nE),
    W, bias, tau, win, grip, isSensor,
    stats: { cells: nA, edges: nE, muscles, sensors, extent: ext,
             area: polyArea(px, py, nA) },
  };
}

/** Convex-hull-free spread measure: mean squared radius, in cell-radius units. */
function polyArea(x, y, n) {
  let s = 0; for (let i = 0; i < n; i++) s += x[i] * x[i] + y[i] * y[i];
  return n ? s / n : 0;
}

/**
 * Mechanical relaxation of the growing clump: overlap repulsion plus adhesive
 * attraction toward contact. Jacobi, like the lifetime solver, and clamped the
 * same way — a division that lands two cells on top of each other must not be
 * able to launch them.
 */
function relaxClump(x, y, rad, alive, N, iters, cfg) {
  const ax = new Float64Array(N), ay = new Float64Array(N);
  const cnt = new Int32Array(N);
  const cap = cfg.DX_MAX * cfg.CELL_R;
  for (let it = 0; it < iters; it++) {
    ax.fill(0); ay.fill(0); cnt.fill(0);
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < N; j++) {
        if (!alive[j]) continue;
        let dx = x[j] - x[i], dy = y[j] - y[i];
        let d = Math.hypot(dx, dy);
        if (d < 1e-9) { dx = 1e-4; dy = 0; d = 1e-4; }
        const rest = rad[i] + rad[j];
        const reach = cfg.ADHESION * 0.5 * rest;
        if (d > reach) continue;
        // Overlap is corrected fully; adhesion pulls only weakly, so the clump
        // packs rather than collapsing to a point.
        const C = d - rest;
        const k = C > 0 ? 0.18 : 1.0;
        let corr = clamp(-0.5 * C * k, -cap, cap);
        const nx = dx / d, ny = dy / d;
        ax[i] -= nx * corr; ay[i] -= ny * corr;
        ax[j] += nx * corr; ay[j] += ny * corr;
        cnt[i]++; cnt[j]++;
      }
    }
    for (let i = 0; i < N; i++) {
      if (!alive[i] || !cnt[i]) continue;
      x[i] += ax[i] / cnt[i]; y[i] += ay[i] / cnt[i];
    }
  }
}

/* ---------------------------------------------------------------- world */

export function makeWorld(cfg = DEFAULTS, rng = makeRng(0x8f3d20a1)) {
  const bound = cfg.WORLD_BOUND * 0.92;
  const centres = [];
  for (let i = 0; i < cfg.FOOD_CLUSTERS; i++)
    centres.push([(rng.next() * 1.72) - 0.86, (rng.next() * 1.72) - 0.86]);
  const fx = new Float64Array(cfg.FOOD), fy = new Float64Array(cfg.FOOD);
  for (let i = 0; i < cfg.FOOD; i++) {
    const c = centres[i % Math.max(1, centres.length)] || [0, 0];
    const j = () => (rng.next() + rng.next() + rng.next() - 1.5) * (cfg.FOOD_CLUSTER_SIGMA / 1.5);
    fx[i] = clamp(c[0] + j(), -bound, bound);
    fy[i] = clamp(c[1] + j(), -bound, bound);
  }
  return { fx, fy, n: cfg.FOOD };
}

/* --------------------------------------------------------------- colony */

/**
 * P developed organisms in one arena, sharing one depleting food field —
 * matched to how the incumbent evaluates a population, so that the noise a
 * repeatability measure sees here has the same structure it has there.
 *
 * Storage is fixed-capacity structure-of-arrays across organisms: particle o*S
 * ... o*S+n-1 belongs to organism o, where S is the per-organism stride. Dead
 * slots are simply never indexed.
 */
export class Colony {
  constructor(phenos, world, cfg = DEFAULTS) {
    this.cfg = cfg; this.world = world; this.ph = phenos;
    this.P = phenos.length;
    const S = this.S = Math.max(1, ...phenos.map(p => p.n));
    const T = this.P * S;
    this.px = new Float64Array(T); this.py = new Float64Array(T);
    this.qx = new Float64Array(T); this.qy = new Float64Array(T);   // predicted
    this.vx = new Float64Array(T); this.vy = new Float64Array(T);
    this.ax = new Float64Array(T); this.ay = new Float64Array(T);   // Jacobi accumulator
    this.cnt = new Int32Array(T);
    this.rad = new Float64Array(T); this.grip = new Float64Array(T);
    this.ny = new Float64Array(T); this.act = new Float64Array(T);
    this.strain = new Float64Array(T);
    this.sens = new Float64Array(T * SENSORS);
    this.stock = new Float64Array(world.n).fill(1);
    this.foodX = Float64Array.from(world.fx); this.foodY = Float64Array.from(world.fy);
    // Per-organism accumulators.
    this.startX = new Float64Array(this.P); this.startY = new Float64Array(this.P);
    this.path = new Float64Array(this.P);
    this.intake = new Float64Array(this.P);
    this.lastCX = new Float64Array(this.P); this.lastCY = new Float64Array(this.P);
    this.occ = Array.from({ length: this.P }, () => new Set());
    // Collision candidate lists, rebuilt once per step.
    this.colI = new Int32Array(this.P * 512); this.colJ = new Int32Array(this.P * 512);
    this.colN = new Int32Array(this.P);
    this.lam = new Float64Array(this.P * cfg.E_MAX);
    this.steps = 0;
  }

  /** Place every organism: random position, random body orientation, zero state. */
  spawn(rng) {
    const cfg = this.cfg, S = this.S, b = cfg.WORLD_BOUND * 0.72;
    this.px.fill(0); this.py.fill(0); this.vx.fill(0); this.vy.fill(0);
    this.ny.fill(0); this.act.fill(0); this.strain.fill(0);
    this.path.fill(0); this.intake.fill(0);
    this.stock.fill(1);
    this.foodX.set(this.world.fx); this.foodY.set(this.world.fy);
    this.steps = 0;
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o];
      const ox = (rng.next() * 2 - 1) * b, oy = (rng.next() * 2 - 1) * b;
      const th = rng.next() * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      let cx = 0, cy = 0;
      for (let a = 0; a < p.n; a++) {
        const t = o * S + a;
        this.px[t] = ox + p.x[a] * c - p.y[a] * s;
        this.py[t] = oy + p.x[a] * s + p.y[a] * c;
        this.rad[t] = p.rad[a]; this.grip[t] = p.grip[a];
        cx += this.px[t]; cy += this.py[t];
      }
      cx /= p.n; cy /= p.n;
      this.startX[o] = cx; this.startY[o] = cy;
      this.lastCX[o] = cx; this.lastCY[o] = cy;
      this.occ[o].clear();
    }
  }

  centroid(o) {
    const p = this.ph[o], S = this.S;
    let cx = 0, cy = 0;
    for (let a = 0; a < p.n; a++) { cx += this.px[o * S + a]; cy += this.py[o * S + a]; }
    return [cx / p.n, cy / p.n];
  }

  /* ---- kernel: sensory read (per cell, only where a sensor role exists) --- */
  kSense() {
    const cfg = this.cfg, S = this.S, W = this.world;
    const s2 = cfg.FOOD_SENSE_SIGMA2;
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o];
      for (let a = 0; a < p.n; a++) {
        const t = o * S + a, b = t * SENSORS;
        if (!p.isSensor[a]) { this.sens[b] = 0; this.sens[b + 1] = 0; this.sens[b + 2] = 0; this.sens[b + 3] = 0; continue; }
        const X = this.px[t], Y = this.py[t];
        let mass = 0;
        for (let f = 0; f < W.n; f++) {
          const d2 = (this.foodX[f] - X) ** 2 + (this.foodY[f] - Y) ** 2;
          mass += Math.exp(-d2 / s2) * this.stock[f];
        }
        this.sens[b] = Math.tanh(mass * 0.16);
        this.sens[b + 1] = Math.tanh(Math.max(0, Math.max(Math.abs(X), Math.abs(Y)) - 0.70) * 3.2);
        this.sens[b + 2] = Math.tanh(Math.hypot(this.vx[t], this.vy[t]) * 3.0);
        this.sens[b + 3] = Math.tanh(this.strain[t] * 6.0);
      }
    }
  }

  /* ---- kernel: CTRNN update (per cell) ----------------------------------- */
  kNeural() {
    const cfg = this.cfg, S = this.S, dt = cfg.DT;
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], n = p.n, base = o * S;
      for (let a = 0; a < n; a++) this.act[base + a] = Math.tanh(this.ny[base + a] + p.bias[a]);
      for (let b = 0; b < n; b++) {
        let rec = 0;
        for (let a = 0; a < n; a++) rec += this.act[base + a] * p.W[a * n + b];
        let inp = 0;
        const wb = b * SENSORS, sb = (base + b) * SENSORS;
        for (let c = 0; c < SENSORS; c++) inp += p.win[wb + c] * this.sens[sb + c];
        const t = base + b;
        this.ny[t] += (rec + inp - this.ny[t]) / p.tau[b] * dt;
        // The state is a tanh argument; letting it run to 1e3 buys nothing and
        // costs the only thing that turns finite arithmetic into NaN.
        this.ny[t] = clamp(this.ny[t], -12, 12);
      }
    }
  }

  /* ---- kernel: XPBD predict + Jacobi solve + friction (per cell/edge) ---- */
  kPhysics() {
    const cfg = this.cfg, S = this.S, dt = cfg.DT;
    const a2 = cfg.COMPLIANCE / (dt * dt);

    // predict
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], base = o * S;
      for (let a = 0; a < p.n; a++) {
        const t = base + a;
        let vX = this.vx[t] * cfg.DRAG, vY = this.vy[t] * cfg.DRAG;
        const sp = Math.hypot(vX, vY);
        if (sp > cfg.V_MAX) { vX *= cfg.V_MAX / sp; vY *= cfg.V_MAX / sp; }
        this.vx[t] = vX; this.vy[t] = vY;
        this.qx[t] = this.px[t] + vX * dt;
        this.qy[t] = this.py[t] + vY * dt;
      }
    }

    // collision candidate list, once per step
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], base = o * S;
      let m = 0; const cb = o * 512;
      for (let a = 0; a < p.n && m < 512; a++) {
        for (let b = a + 1; b < p.n && m < 512; b++) {
          const dx = this.qx[base + b] - this.qx[base + a];
          const dy = this.qy[base + b] - this.qy[base + a];
          const rr = (this.rad[base + a] + this.rad[base + b]) * 1.05;
          if (dx * dx + dy * dy < rr * rr) { this.colI[cb + m] = a; this.colJ[cb + m] = b; m++; }
        }
      }
      this.colN[o] = m;
    }

    this.lam.fill(0);
    const cap = cfg.DX_MAX * cfg.CELL_R;
    for (let it = 0; it < cfg.ITERS; it++) {
      this.ax.fill(0); this.ay.fill(0); this.cnt.fill(0);
      // per-edge kernel
      for (let o = 0; o < this.P; o++) {
        const p = this.ph[o], base = o * S, lb = o * cfg.E_MAX;
        for (let e = 0; e < p.nE; e++) {
          const i = base + p.ei[e], j = base + p.ej[e];
          let dx = this.qx[j] - this.qx[i], dy = this.qy[j] - this.qy[i];
          let d = Math.hypot(dx, dy);
          if (!(d > 1e-9)) { dx = 1e-5; dy = 0; d = 1e-5; }
          let L = p.L0[e];
          if (p.kind[e] === 2) {
            const u = Math.tanh(this.act[i] + this.act[j]);
            L = L * clamp(1 + p.amp[e] * u, cfg.MUSCLE_MIN, cfg.MUSCLE_MAX);
          }
          const C = d - L;
          const dl = (-C - a2 * this.lam[lb + e]) / (2 + a2);
          this.lam[lb + e] += dl;
          let corr = clamp(dl, -cap, cap);
          const nx = dx / d, ny = dy / d;
          this.ax[i] -= nx * corr; this.ay[i] -= ny * corr;
          this.ax[j] += nx * corr; this.ay[j] += ny * corr;
          this.cnt[i]++; this.cnt[j]++;
        }
        // per-pair kernel: non-penetration
        const cb = o * 512, m = this.colN[o];
        for (let k = 0; k < m; k++) {
          const i = base + this.colI[cb + k], j = base + this.colJ[cb + k];
          let dx = this.qx[j] - this.qx[i], dy = this.qy[j] - this.qy[i];
          let d = Math.hypot(dx, dy);
          if (!(d > 1e-9)) { dx = 1e-5; dy = 0; d = 1e-5; }
          const rest = this.rad[i] + this.rad[j];
          if (d >= rest) continue;
          const corr = clamp(0.5 * (d - rest), -cap, cap);
          const nx = dx / d, ny = dy / d;
          this.ax[i] += nx * corr; this.ay[i] += ny * corr;
          this.ax[j] -= nx * corr; this.ay[j] -= ny * corr;
          this.cnt[i]++; this.cnt[j]++;
        }
      }
      // per-cell kernel: apply the averaged correction. Jacobi, so the read
      // above and the write here are separate passes and no cell sees a
      // partially updated neighbour.
      for (let o = 0; o < this.P; o++) {
        const p = this.ph[o], base = o * S;
        for (let a = 0; a < p.n; a++) {
          const t = base + a;
          if (!this.cnt[t]) continue;
          this.qx[t] += cfg.OMEGA * this.ax[t] / this.cnt[t];
          this.qy[t] += cfg.OMEGA * this.ay[t] / this.cnt[t];
        }
      }
    }

    // friction + world bound + velocity update, per cell
    const B = cfg.WORLD_BOUND;
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], base = o * S;
      for (let a = 0; a < p.n; a++) {
        const t = base + a;
        let dx = this.qx[t] - this.px[t], dy = this.qy[t] - this.py[t];
        // Coulomb ground friction as a positional budget: below the static
        // threshold the cell does not move at all, above it the cell slips by
        // the excess. This is what makes a contraction wave crawl instead of
        // oscillating in place.
        const budget = this.grip[t] * dt * dt * 9.8;
        const dl = Math.hypot(dx, dy);
        if (dl <= budget) { dx = 0; dy = 0; }
        else { const s = 1 - budget / dl; dx *= s; dy *= s; }
        let X = this.px[t] + dx, Y = this.py[t] + dy;
        if (X > B) { X = B; } else if (X < -B) { X = -B; }
        if (Y > B) { Y = B; } else if (Y < -B) { Y = -B; }
        this.vx[t] = (X - this.px[t]) / dt;
        this.vy[t] = (Y - this.py[t]) / dt;
        this.px[t] = X; this.py[t] = Y;
      }
      // proprioceptive strain, for the next step's sensory read
      for (let a = 0; a < p.n; a++) this.strain[base + a] = 0;
      const c2 = new Int32Array(p.n);
      for (let e = 0; e < p.nE; e++) {
        const i = p.ei[e], j = p.ej[e];
        const d = Math.hypot(this.px[base + j] - this.px[base + i],
                             this.py[base + j] - this.py[base + i]);
        const s = (d - p.L0[e]) / p.L0[e];
        this.strain[base + i] += s; this.strain[base + j] += s;
        c2[i]++; c2[j]++;
      }
      for (let a = 0; a < p.n; a++) if (c2[a]) this.strain[base + a] /= c2[a];
    }
  }

  /* ---- kernel: feeding and the food field -------------------------------- */
  kFood() {
    const cfg = this.cfg, W = this.world, dt = cfg.DT;
    const draw = new Float64Array(W.n);
    for (let o = 0; o < this.P; o++) {
      const [cx, cy] = this.centroid(o);
      let best = 0;
      for (let f = 0; f < W.n; f++) {
        const d2 = (this.foodX[f] - cx) ** 2 + (this.foodY[f] - cy) ** 2;
        const k = Math.exp(-d2 / cfg.FOOD_EAT_SIGMA2);
        draw[f] += k;
        const e = k * this.stock[f];
        if (e > best) best = e;
      }
      this.intake[o] += best * dt;
      // trajectory readouts
      const d = Math.hypot(cx - this.lastCX[o], cy - this.lastCY[o]);
      this.path[o] += d;
      this.lastCX[o] = cx; this.lastCY[o] = cy;
      // spatial occupancy on a 12x12 grid over the arena
      const gx = Math.min(11, Math.max(0, ((cx + 0.94) / 1.88 * 12) | 0));
      const gy = Math.min(11, Math.max(0, ((cy + 0.94) / 1.88 * 12) | 0));
      this.occ[o].add(gy * 12 + gx);
    }
    for (let f = 0; f < W.n; f++) {
      let s = this.stock[f];
      s += ((1 - s) * cfg.FOOD_REGROW - draw[f] * s * cfg.FOOD_CONSUME) * dt;
      s = clamp(s, 0, 1);
      if (cfg.FOOD_RELOCATE_THRESH > 0 && s < cfg.FOOD_RELOCATE_THRESH) {
        // Deterministic relocation from the step counter and the patch index —
        // no RNG draw here, so an episode is reproducible from the spawn seed
        // alone regardless of how many organisms happened to feed.
        const h = Math.imul(f * 2654435761 ^ this.steps * 40503, 2246822519) >>> 0;
        this.foodX[f] = ((h & 0xffff) / 65536 * 2 - 1) * cfg.WORLD_BOUND * 0.87;
        this.foodY[f] = (((h >>> 16) & 0xffff) / 65536 * 2 - 1) * cfg.WORLD_BOUND * 0.87;
        s = 1;
      }
      this.stock[f] = s;
    }
  }

  step() {
    this.kSense();
    this.kNeural();
    this.kPhysics();
    this.kFood();
    this.steps++;
  }

  /** Scan every position and velocity. Throws rather than returning a score. */
  assertFinite(where = '') {
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], base = o * this.S;
      for (let a = 0; a < p.n; a++) {
        const t = base + a;
        if (!Number.isFinite(this.px[t]) || !Number.isFinite(this.py[t]) ||
            !Number.isFinite(this.vx[t]) || !Number.isFinite(this.vy[t]) ||
            !Number.isFinite(this.ny[t]))
          throw new Error(`non-finite state at step ${this.steps} organism ${o} cell ${a} ${where}`);
      }
    }
  }

  /** Behavioural traits, one row per organism. */
  traits() {
    const out = [];
    for (let o = 0; o < this.P; o++) {
      const [cx, cy] = this.centroid(o);
      out.push({
        displacement: Math.hypot(cx - this.startX[o], cy - this.startY[o]),
        path: this.path[o],
        speed: this.path[o] / Math.max(1e-9, this.steps * this.cfg.DT),
        occupancy: this.occ[o].size,
        intake: this.intake[o],
      });
    }
    return out;
  }
}

/** Run one episode. Returns per-organism trait rows. */
export function episode(colony, steps, { checkEvery = 50 } = {}) {
  for (let s = 0; s < steps; s++) {
    colony.step();
    if (checkEvery && s % checkEvery === 0) colony.assertFinite();
  }
  colony.assertFinite('end');
  return colony.traits();
}
