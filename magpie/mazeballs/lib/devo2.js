/**
 * Development 2.0 — a gene regulatory network growing a body inside an egg.
 *
 * Replaces the positional readout in `devo.js`, which was a painting operator:
 * every cell property was a weighted sum of nine fixed basis functions of two
 * maternal coordinates, evaluated on a hex disc. It had no time, no signalling,
 * no diffusion and no growth, and it produced — measured over 64 living genomes
 * at generation 22 — bodies of elongation p50 = p90 = max = 1.15, identical to
 * random founders. The map could reach elongation 4.0 with hand-made genomes and
 * evolution never found it, because `presence` thresholded on a disc has a hard
 * prior toward "the whole disc". See DEVELOPMENT-2.md.
 *
 * WHAT IS DIFFERENT, AND WHY EACH PIECE IS THERE
 *
 * 1. THE BODY GROWS. Development starts from ONE cell at the centre of the egg
 *    and adds cells over time where the network says to grow. Morphology is
 *    therefore the RECORD OF A PROCESS rather than a thresholded function, and an
 *    elongated body is what you get by growing preferentially along an axis —
 *    which is one gene being high at one pole. That is the whole point: the thing
 *    Dev 1.0 made improbable, this makes cheap.
 *
 * 2. GENE PRODUCTS DIFFUSE, AT DIFFERENT RATES. Without transport each cell's
 *    network runs independently and the only spatial information available is the
 *    maternal gradient — Dev 1.0 with extra steps. Turing patterns need a slow
 *    activator against a fast inhibitor, so the diffusion rate is per-product and
 *    evolved, spanning two decades.
 *
 * 3. CONCENTRATIONS ARE NON-NEGATIVE, WITH PRODUCTION AND DECAY. A CTRNN's tanh
 *    would give negative concentrations, which are meaningless, and would lose
 *    degradation — which is what oscillators are built from. The form is
 *
 *      dc_g/dt = P * sigmoid(bias_g + SUM_k w_gk * c_src(g,k))  -  decay_g * c_g
 *                                                               +  D_g * laplacian
 *
 *    which is CTRNN-shaped (same gather-and-squash) but positivity-preserving.
 *    Mutual exclusion — the motif that breaks symmetry — is just w_ab < 0 and
 *    w_ba < 0, falling out of weight sign rather than being a special case.
 *
 * 4. THE NETWORK IS SPARSE. A dense 256-gene network is 65,536 weights and
 *    evolution explores none of it. K regulators per gene, exactly as the brain
 *    has K incoming edges per neuron, with structural mutation moving the edges.
 *    Real transcription factors have few targets; this is not only a budget cut.
 *
 * 5. THE AXES ARE MATERNAL, NOT NOISE. Noise-driven symmetry breaking gives a
 *    RANDOM side each generation — a coin flip, not a coordinate system, and
 *    selection cannot act on it. The mother is a physical object with a heading,
 *    so she deposits an oriented egg: that gives AP, its perpendicular gives DV,
 *    deterministically and heritably. Noise is still present (gene 3) and is what
 *    lets a Turing instability choose a phase, but it is not asked to do a job it
 *    cannot do.
 *
 * WHAT IS DELIBERATELY STILL ABSENT
 *
 * Development happens as an internal integration AT BIRTH, not as an egg sitting
 * in the world developing over real time while things eat it. That second thing
 * is the eggs.md programme and it is a separate, larger change to reproduction.
 * This module is the encoding; it does not yet make eggs physical.
 */

/** Distance between lattice sites. Shared with bond() in devo.js — see the note
 *  there about these drifting apart and every body coming out with no bonds. */
export const SPACING = 0.95;

/** Gene products. The sketch numbers them 0-255; 64 is what actually evolves in
 *  a reasonable number of generations, and every reserved index below is defined
 *  as an offset so widening this does not renumber anything. */
export const NGENE = 64;

/** Regulators per gene. The brain uses 12 incoming edges; genes need fewer. */
export const K = 6;

// --- reserved gene indices -------------------------------------------------
// Maternal. These are BOUNDARY CONDITIONS: clamped from geometry every step,
// never integrated, so they cannot be regulated away. The sketch's "000".
export const G_AP    = 0;   // anterior-posterior, 0..1 along the egg's heading
export const G_DV    = 1;   // dorsal-ventral, 0..1 across it
export const G_RAD   = 2;   // distance from the centre, 0 at core, 1 at shell
export const G_NOISE = 3;   // fixed per-site noise — the symmetry-breaking seed
// CROWDING — how enclosed this cell is, 0 alone to 1 fully surrounded. Not
// maternal: a signal from the cell's own neighbourhood, sampled every step.
//
// This exists because of a measured failure. Without it, growth is isotropic:
// every cell with a free neighbour and enough `grow` extends, so a body expands
// as a disc from its seed and elongation cannot exceed the aspect of a circle
// however good the network is. Selection on elongation for 30 generations moved
// Dev 2.0 not at all (1.30 -> 1.30) while Dev 1.0 managed 1.15 -> 1.39.
//
// A tip is a cell with few occupied neighbours. Exposing crowding as an INPUT
// lets a genome grow only where it is uncrowded — apical growth, filaments,
// branches — or ignore it and stay a blob. Reachable, not imposed: the founder
// seeding below leans on it, and mutation is free to weight it to zero.
export const G_CROWD = 4;
export const N_MATERNAL = 5;

// Outputs. Read off as cell properties once development finishes. A fixed
// readout block over an evolved network: the interface to the rest of the
// pipeline (describe(), bond(), synapse()) is unchanged, so this module can be
// swapped in without touching the arena.
export const OUT_BASE = 8;
export const OUTPUTS = ['grow', 'contract', 'sense', 'grip', 'stiff', 'tau', 'bias'];
export const G_GROW = OUT_BASE + 0;

/** Top of the range is reserved for environmental signals (the sketch's 201-255).
 *  Nothing writes these yet; they exist so the numbering is stable when they do. */
export const N_EXTERNAL = 8;
export const EXT_BASE = NGENE - N_EXTERNAL;

// --- genome layout ---------------------------------------------------------
// Per gene: K source indices, K weights, bias, log-decay, log-diffusion.
export const GENE_STRIDE = 2 * K + 3;
export const OFF_SRC   = 0;
export const OFF_W     = K;
export const OFF_BIAS  = 2 * K;
export const OFF_DECAY = 2 * K + 1;
export const OFF_DIFF  = 2 * K + 2;
export const GENOME_SIZE = NGENE * GENE_STRIDE;

const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, x))));

/** Decay rate in 1/s. Spans a decade and a half either side of 1, so a product
 *  can be a fast transient or a stable determinant. */
const decayOf = (g, i) => 0.6 * Math.pow(10, clamp(g[i * GENE_STRIDE + OFF_DECAY], -1.2, 1.2));

/** Diffusion coefficient. TWO DECADES is not generosity — a Turing instability
 *  needs the activator and the inhibitor to differ by roughly an order of
 *  magnitude, so the reachable span must comfortably contain that ratio. */
const diffOf = (g, i) => 0.02 * Math.pow(10, clamp(g[i * GENE_STRIDE + OFF_DIFF], -1, 2));

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

/** Source gene for regulator k of gene i, as an index into 0..NGENE-1. Stored as
 *  a float so one flat Float32Array is the whole genome and the existing
 *  mutation machinery keeps working; rounded on read. */
function srcOf(genome, i, k) {
  const v = genome[i * GENE_STRIDE + OFF_SRC + k];
  if (!Number.isFinite(v) || v < 0) return -1;               // a silenced edge
  const s = Math.floor(v) % NGENE;
  return s < 0 ? -1 : s;
}

/**
 * The hex lattice inside a circular egg, with neighbour lists.
 *
 * Precomputed once per egg geometry and shared by every embryo of that size, so
 * the per-birth cost is the network, not the geometry.
 */
export function eggLattice(extent) {
  const sites = [];
  const spacing = SPACING;
  const R = Math.ceil(extent / spacing) + 1;
  for (let row = -R; row <= R; row++) {
    const y = row * spacing * 0.866;
    const off = (row & 1) ? spacing * 0.5 : 0;
    for (let col = -R; col <= R; col++) {
      const x = col * spacing + off;
      const r = Math.hypot(x, y);
      if (r > extent) continue;
      sites.push({ x, y, r, ap: x / extent, dv: y / extent, rad: r / extent, nb: [] });
    }
  }
  // Neighbours: within 1.35 spacings, the same reach bond() uses, so the
  // diffusion graph and the mechanical graph are the same graph.
  const lim = spacing * 1.35;
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const d = Math.hypot(sites[i].x - sites[j].x, sites[i].y - sites[j].y);
      if (d <= lim) { sites[i].nb.push(j); sites[j].nb.push(i); }
    }
  }
  // Start from the site nearest the centre — one cell, as the sketch asks.
  let seed = 0;
  for (let i = 1; i < sites.length; i++) if (sites[i].r < sites[seed].r) seed = i;
  return { sites, seed, extent };
}

const latticeCache = new Map();
export function latticeFor(extent) {
  const key = extent.toFixed(3);
  let l = latticeCache.get(key);
  if (!l) { l = eggLattice(extent); latticeCache.set(key, l); }
  return l;
}

/**
 * Run development: genome -> body.
 *
 * @param {Float32Array} genome
 * @param {object} o
 * @param {number} [o.yolk]        energy available; growth stops when spent
 * @param {number} [o.cellCost]    energy per cell built
 * @param {number} [o.extent]      egg radius in world units. MUST BE MUCH LARGER
 *   than a compact body of maxCells, or the body fills the shell and is a disc
 *   again whatever the network says. Measured: at extent 4.5 — which is exactly
 *   the radius of a compact 60-cell blob — every one of 200 random embryos hit
 *   the cell cap and elongation came out at p50 0.90, worse than Dev 1.0. The
 *   egg has to afford a shape before the genome can choose one.
 * @param {number} [o.ms]          developmental time in milliseconds
 * @param {number} [o.dtMs]        integration step in milliseconds
 * @param {number} [o.maxCells]
 * @param {() => number} [o.rnd]   entropy for developmental noise
 * @returns {{cells: Array, spent: number, aborted: boolean, steps: number}}
 */
export function develop(genome, {
  yolk = 1e9, cellCost = 1.0, extent = 12,
  ms = 12000, dtMs = 40, maxCells = 60, rnd = Math.random,
} = {}) {
  const lat = latticeFor(extent);
  const sites = lat.sites;
  const nS = sites.length;
  const dt = dtMs / 1000;
  const nStep = Math.max(1, Math.round(ms / dtMs));

  const conc = new Float32Array(nS * NGENE);
  const next = new Float32Array(nS * NGENE);
  const occupied = new Uint8Array(nS);
  const noise = new Float32Array(nS);
  for (let s = 0; s < nS; s++) noise[s] = rnd();

  // Precompute per-gene constants once rather than per cell per step.
  const decay = new Float32Array(NGENE), diff = new Float32Array(NGENE);
  const bias = new Float32Array(NGENE);
  const src = new Int32Array(NGENE * K), w = new Float32Array(NGENE * K);
  for (let g = 0; g < NGENE; g++) {
    decay[g] = decayOf(genome, g);
    diff[g] = diffOf(genome, g);
    bias[g] = genome[g * GENE_STRIDE + OFF_BIAS];
    for (let k = 0; k < K; k++) {
      src[g * K + k] = srcOf(genome, g, k);
      w[g * K + k] = genome[g * GENE_STRIDE + OFF_W + k];
    }
  }

  const setMaternal = (s) => {
    const b = s * NGENE, st = sites[s];
    conc[b + G_AP] = 0.5 * (st.ap + 1);
    conc[b + G_DV] = 0.5 * (st.dv + 1);
    conc[b + G_RAD] = st.rad;
    conc[b + G_NOISE] = noise[s];
    const nb = st.nb;
    let occ = 0;
    for (let q = 0; q < nb.length; q++) if (occupied[nb[q]]) occ++;
    conc[b + G_CROWD] = nb.length ? occ / nb.length : 0;
  };

  let live = [lat.seed];
  occupied[lat.seed] = 1;
  setMaternal(lat.seed);
  let spent = cellCost, aborted = false;

  // Growth is throttled so a body cannot appear in one step: at most one new
  // cell per existing cell per growth window, and growth windows are spaced.
  const GROW_EVERY = 5;
  const GROW_THRESH = 0.55;

  for (let t = 0; t < nStep; t++) {
    // ---- regulatory update, gather-style, out of place
    for (let li = 0; li < live.length; li++) {
      const s = live[li], b = s * NGENE;
      const nb = sites[s].nb;
      // mean of occupied neighbours, for the diffusion term
      let nOcc = 0;
      for (let q = 0; q < nb.length; q++) if (occupied[nb[q]]) nOcc++;
      for (let g = N_MATERNAL; g < NGENE; g++) {
        let net = bias[g];
        const wb = g * K;
        for (let k = 0; k < K; k++) {
          const sg = src[wb + k];
          if (sg < 0) continue;
          net += w[wb + k] * conc[b + sg];
        }
        let lap = 0;
        if (nOcc > 0 && diff[g] > 0) {
          let acc = 0;
          for (let q = 0; q < nb.length; q++) {
            const nn = nb[q];
            if (occupied[nn]) acc += conc[nn * NGENE + g];
          }
          lap = diff[g] * (acc / nOcc - conc[b + g]);
        }
        const c = conc[b + g] + dt * (sigmoid(net) - decay[g] * conc[b + g] + lap);
        next[b + g] = c > 0 ? (c < 40 ? c : 40) : 0;          // non-negative, bounded
      }
    }
    for (let li = 0; li < live.length; li++) {
      const s = live[li], b = s * NGENE;
      for (let g = N_MATERNAL; g < NGENE; g++) conc[b + g] = next[b + g];
      setMaternal(s);                                          // clamped, every step
    }

    // ---- growth
    if (t % GROW_EVERY === 0 && live.length < maxCells) {
      const added = [];
      for (let li = 0; li < live.length; li++) {
        const s = live[li];
        if (conc[s * NGENE + G_GROW] < GROW_THRESH) continue;
        const nb = sites[s].nb;
        // Grow into the free neighbour the gradient points hardest at, so
        // direction is a property of the chemistry rather than of iteration
        // order. Ties break toward the site the mother's axis favours.
        let best = -1, bestScore = -Infinity;
        for (let q = 0; q < nb.length; q++) {
          const nn = nb[q];
          if (occupied[nn]) continue;
          const score = sites[nn].ap * conc[s * NGENE + G_AP]
                      + sites[nn].dv * conc[s * NGENE + G_DV]
                      + 0.05 * noise[nn];
          if (score > bestScore) { bestScore = score; best = nn; }
        }
        if (best < 0) continue;
        if (spent + cellCost > yolk) { aborted = true; break; }
        if (live.length + added.length >= maxCells) break;
        occupied[best] = 1;
        spent += cellCost;
        // The daughter inherits the mother's chemistry. Cytoplasm is divided,
        // not created: halving it means a growing tip carries a decaying memory
        // of where it came from rather than a perfect copy, which is what lets
        // a travelling front exist at all.
        const bs = s * NGENE, bd = best * NGENE;
        for (let g = N_MATERNAL; g < NGENE; g++) {
          const half = conc[bs + g] * 0.5;
          conc[bd + g] = half; conc[bs + g] = half;
        }
        setMaternal(best);
        added.push(best);
      }
      if (added.length) live = live.concat(added);
      if (aborted) break;
    }
  }

  // ---- read the body off the finished chemistry
  const cells = [];
  for (let li = 0; li < live.length; li++) {
    const s = live[li], b = s * NGENE, st = sites[s];
    const out = (n) => {
      const c = conc[b + OUT_BASE + n];
      return 2 * Math.tanh(c) - 1;                             // [0,inf) -> [-1,1)
    };
    cells.push({
      x: st.x, y: st.y, ap: st.ap, dv: st.dv,
      contract: out(1), sense: out(2), grip: out(3), stiff: out(4),
      // tau spans a decade, log-spaced, matching devo.js so the CTRNN is
      // comparable between the two encodings.
      tau: 0.18 * Math.pow(10, out(5)),
      bias: out(6),
    });
  }
  return { cells, spent, aborted, steps: nStep };
}

/**
 * A random genome that actually develops into something.
 *
 * A uniformly random network almost always either never reaches the growth
 * threshold (a one-cell embryo) or saturates it everywhere (a filled disc — the
 * exact failure Dev 1.0 had). So the growth gene is seeded with a positive bias
 * and a maternal input, which makes founders grow SOMETHING without prescribing
 * a shape: which direction, how far, and whether growth is patterned are all
 * left to the network.
 */
export function randomGenome(rnd = Math.random) {
  const g = new Float32Array(GENOME_SIZE);
  for (let i = 0; i < NGENE; i++) {
    const b = i * GENE_STRIDE;
    for (let k = 0; k < K; k++) {
      // Most edges silenced at birth; a sparse network is the starting point,
      // and structural mutation adds edges where they earn their keep.
      g[b + OFF_SRC + k] = rnd() < 0.35 ? Math.floor(rnd() * NGENE) : -1;
      g[b + OFF_W + k] = (rnd() * 2 - 1) * 2.5;
    }
    g[b + OFF_BIAS] = (rnd() * 2 - 1) * 2 - 1.2;               // mostly off
    g[b + OFF_DECAY] = (rnd() * 2 - 1) * 0.8;
    g[b + OFF_DIFF] = (rnd() * 2 - 1) * 1.0;
  }
  // Growth: reachable from the start, shape unspecified.
  //
  // SELF-LIMITING BY CONSTRUCTION. The first version seeded a positive bias and
  // zero decay, so production ran forever and every embryo grew until it hit the
  // cell cap — 200 of 200, filling the egg, elongation p50 0.90. Growth must be a
  // TRANSIENT the network has to keep paying for: with decay the steady state is
  // sigmoid(net)/decay, division halves it below threshold, and a tip must
  // actively re-produce to grow again. That turns "grow" from a switch into a
  // rate, which is what lets one end of a body keep growing while another stops.
  const gb = G_GROW * GENE_STRIDE;
  g[gb + OFF_BIAS] = 0.2;
  g[gb + OFF_SRC + 0] = G_CROWD; g[gb + OFF_W + 0] = -4.0;      // grow at a TIP
  g[gb + OFF_SRC + 1] = G_GROW;  g[gb + OFF_W + 1] = 0.8;       // self-sustaining
  g[gb + OFF_SRC + 2] = G_AP;    g[gb + OFF_W + 2] = 0.6;
  g[gb + OFF_DECAY] = 0.25;
  g[gb + OFF_DIFF] = -0.7;                                      // stays local
  return g;
}

/**
 * Mutation: weights and rates drift, and EDGES MOVE.
 *
 * Structural mutation is not decoration. A regulatory network's interesting
 * property is its topology — which gene regulates which — and a mutation
 * operator that only perturbs weights explores a fixed graph forever.
 */
export function mutate(genome, { rate = 0.12, size = 0.3, structural = 0.02, rnd = Math.random } = {}) {
  const g = Float32Array.from(genome);
  for (let i = 0; i < NGENE; i++) {
    const b = i * GENE_STRIDE;
    for (let k = 0; k < K; k++) {
      if (rnd() < structural) {
        // rewire, silence, or wake an edge
        g[b + OFF_SRC + k] = rnd() < 0.3 ? -1 : Math.floor(rnd() * NGENE);
        if (g[b + OFF_SRC + k] >= 0 && rnd() < 0.5) g[b + OFF_W + k] = (rnd() * 2 - 1) * 2.5;
      }
      if (rnd() < rate) g[b + OFF_W + k] += (rnd() * 2 - 1) * size * 2.5;
    }
    if (rnd() < rate) g[b + OFF_BIAS] += (rnd() * 2 - 1) * size * 2;
    if (rnd() < rate) g[b + OFF_DECAY] = clamp(g[b + OFF_DECAY] + (rnd() * 2 - 1) * size, -1.2, 1.2);
    if (rnd() < rate) g[b + OFF_DIFF] = clamp(g[b + OFF_DIFF] + (rnd() * 2 - 1) * size, -1, 2);
  }
  return g;
}
