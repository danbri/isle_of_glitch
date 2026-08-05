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

// Imported, never restated. SPACING and the synapse basis are shared with
// devo.js because both encodings feed the same bond() and the same arena, and
// this codebase has already lost a day to two copies of SPACING drifting apart
// (bond() looked for neighbours closer than the lattice actually placed them, so
// every developed body came out with zero bonds — no skeleton, no brain).
import { SPACING, SYN_BASIS, NSYN, SYN_RANGE } from './devo.js';
export { SPACING };

/** Gene products. The sketch numbers them 0-255; 64 is what actually evolves in
 *  a reasonable number of generations, and every reserved index below is defined
 *  as an offset so widening this does not renumber anything. */
export const NGENE = 64;

/** Regulators per gene. The brain uses 12 incoming edges; genes need fewer. */
export const K = 6;

/**
 * Egg radius, in world units. MUCH larger than a compact body of maxCells, and
 * that is the whole point — Dev 1.0's egg was the size of the body it contained,
 * so growth filled the shell and every animal was a disc. The egg has to afford
 * a shape before a genome can choose one. `evolve.js` reads this rather than
 * carrying its own default, so the two cannot disagree.
 */
export const DEFAULT_EXTENT = 12;

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
export const OUTPUTS = ['grow', 'survive', 'contract', 'sense', 'grip', 'stiff', 'tau', 'bias'];
export const G_GROW    = OUT_BASE + 0;
/**
 * SURVIVE — whether this cell is still part of the body when the egg hatches.
 *
 * Shape does not have to come only from where growth happened. Real embryos
 * carve as much as they build: interdigital webbing is REMOVED by apoptosis, not
 * un-grown, and differential adhesion sorts tissue that was laid down uniformly.
 *
 * This matters here for a specific reason. Patterning across a field — stripes,
 * bands, gap-gene domains — needs a FIELD to pattern: a fly reads its gradients
 * across thousands of nuclei that already exist. A body extruded one cell at a
 * time from a growing tip never has that field, which is the leading suspect for
 * why segments measure ~0 under pure tip growth. Cleavage mode fills the egg so
 * a field exists, and `survive` is then what makes a filled egg into a shape
 * rather than a disc.
 */
export const G_SURVIVE = OUT_BASE + 1;

/** Top of the range is reserved for environmental signals (the sketch's 201-255).
 *  Nothing writes these yet; they exist so the numbering is stable when they do. */
export const N_EXTERNAL = 8;
export const EXT_BASE = NGENE - N_EXTERNAL;

// --- genome layout ---------------------------------------------------------
// Per gene: K source indices, K weights, bias, log-decay, log-diffusion.
// Then a trailing block of NSYN synapse coefficients — see synapse() below.
export const GENE_STRIDE = 2 * K + 3;
export const OFF_SRC   = 0;
export const OFF_W     = K;
export const OFF_BIAS  = 2 * K;
export const OFF_DECAY = 2 * K + 1;
export const OFF_DIFF  = 2 * K + 2;
export const GRN_SIZE  = NGENE * GENE_STRIDE;
export const SYN_OFF   = GRN_SIZE;
export const GENOME_SIZE = GRN_SIZE + NSYN;

/**
 * The weight of a synapse from cell `a` to cell `b`.
 *
 * Deliberately the SAME basis and the same range as `devo.js`, imported rather
 * than restated: the brain is wired from what the two endpoint cells are made
 * of, and Dev 2.0 changes what determines a cell's properties, not what a
 * synapse is. Sharing the definition also means the antisymmetric `axial` and
 * `lateral` terms — the ones that let a CTRNN oscillate at all, and which cost
 * this project a measured retraction to discover — cannot drift out of sync
 * between the two encodings.
 *
 * The coefficients live in a trailing block of the genome rather than being
 * expressed by the GRN. Expressing them would be the more elegant story, but a
 * synapse weight is a function of a PAIR of cells and the GRN produces per-cell
 * concentrations; folding pairwise structure into it is a separate design
 * problem, and doing it badly would silently break the connectome. Recorded as
 * an open question rather than smuggled in.
 */
export function synapse(genome, a, b) {
  let s = 0;
  for (let k = 0; k < NSYN; k++) s += genome[SYN_OFF + k] * SYN_BASIS[k][1](a, b);
  return SYN_RANGE * Math.tanh(s);
}

/**
 * PRODUCTION ACTIVATION — logistic vs tanh, and why the answer is not obvious.
 *
 * Two sigmoids are in common use for CTRNNs and they are NOT interchangeable in
 * general: the logistic maps to (0, 1) and tanh to (-1, +1). Randall Beer's work
 * on CTRNN dynamics treats the two as related by an affine reparameterisation —
 * a network in one form maps to a network in the other with adjusted weights and
 * biases — so they span the same dynamics but NOT the same search space, which is
 * what matters to evolution.
 *
 * The distinction bites differently in our two uses:
 *
 * HERE (the GRN). A concentration cannot be negative, so the output range must be
 * [0, inf) and tanh is unavailable as-is. Rescaling it to (0,1) gives
 *
 *     (tanh(x) + 1) / 2  ==  sigmoid(2x)                     [exactly]
 *
 * so for THIS use, "logistic vs tanh" collapses to a pure GAIN factor of two. It
 * is not a shape choice at all, which is worth knowing before anyone sweeps it as
 * though it were. `prodGain` exposes it as the continuous knob it really is, and
 * 1.0 and 2.0 are the two named conventions.
 *
 * THE BRAIN (`brainarena_gpu.js`) is the case where the choice is substantive,
 * and it currently uses tanh. There the difference is CENTREDNESS: tanh is odd,
 * so a silent network is quiescent and excitation and inhibition are symmetric
 * about zero; the logistic outputs 0.5 for zero input, so a network with no drive
 * is half-on and every weight has to fight that offset. Given the measurement
 * that 40% of brain cells sit pinned at a rail, this is worth a controlled test
 * rather than an assumption — but it is a BRAIN experiment, not a GRN one, and
 * changing it changes what every evolved genome means.
 */
const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, x))));

/** Named conventions for `prodGain`. See the note above: for a [0,1] output these
 *  differ only by gain, and tanh-rescaled is exactly logistic at gain 2. */
export const PROD_GAIN = { logistic: 1.0, tanhRescaled: 2.0 };

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
  canalised = true,
  // 'grow'   — one cell, extended by division where the network says to grow.
  //            Morphology is the record of where growth happened.
  // 'cleave' — the egg is first partitioned into a field of pluripotent cells,
  //            then patterned, then SCULPTED by the survive gene. This is the
  //            arrangement fly patterning actually uses, and the one that gives
  //            a gradient something to be read across.
  //
  //            EXPERIMENTAL AND CURRENTLY WORSE. Measured over 200 founders:
  //            96% saturate the cell cap and elongation sits at 1.15 with
  //            segments flat at 0 — i.e. it makes discs. The cause is that
  //            `survive` reaches a steady state of sigmoid(bias)/decay well
  //            above threshold for every cell, so nothing is ever culled and
  //            the sculpting step is a no-op. Fixing it means making survival a
  //            REGULATED quantity sitting near its threshold rather than pinned
  //            by its bias, which is a tuning problem, not a design flaw — the
  //            field-for-patterning argument still stands. Left in, off by
  //            default, with the failure recorded rather than the mode quietly
  //            deleted.
  mode = 'grow',
  cleaveFrac = 0.35,          // fraction of developmental time spent cleaving
  divRate = 1.6,              // division readiness gained per unit grow per second
  surviveThresh = 0.5,
} = {}) {
  const lat = latticeFor(extent);
  const sites = lat.sites;
  const nS = sites.length;
  const dt = dtMs / 1000;
  const nStep = Math.max(1, Math.round(ms / dtMs));

  const conc = new Float32Array(nS * NGENE);
  const next = new Float32Array(nS * NGENE);
  const occupied = new Uint8Array(nS);

  // CANALISATION — the developmental noise is derived from the GENOME, so the
  // same genome develops the same body every time.
  //
  // This is not a cosmetic determinism. With per-development noise, measured
  // over 39 genomes developed 12 times each:
  //
  //     within-genome sd (same genome, fresh noise)  0.264
  //     between-genome sd (genome means)             0.084
  //     heritability h^2                             0.093
  //
  // Nine tenths of the variance in any morphology measure was developmental
  // noise rather than genome, and one genome ranged 0.63 to 2.31 across twelve
  // developments — a spread wider than the entire genetic range. Elite selection
  // on a signal like that picks lucky DEVELOPMENTS, which regress in their
  // offspring, so directed selection on elongation drove it DOWNWARDS (3.66 at
  // founding to 1.30 by generation 25). Selection was chasing noise.
  //
  // The noise still exists and still does its job: it is spatially structured
  // across sites, so a Turing instability can still choose a phase from it. It
  // is simply a fixed prepattern per genome rather than a fresh coin flip — which
  // is what canalisation means, and real embryos work hard for it.
  //
  // Pass `canalised: false` to restore stochastic development, which is how the
  // heritability above is measured.
  const noise = new Float32Array(nS);
  if (canalised) {
    // Cheap deterministic hash of the genome -> a seeded stream for the sites.
    let h = 2166136261 >>> 0;
    for (let i = 0; i < genome.length; i++) {
      h ^= Math.imul(Math.round(genome[i] * 4096) | 0, 16777619);
      h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    }
    let st = (h || 1) >>> 0;
    for (let s = 0; s < nS; s++) {
      st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
      noise[s] = st / 4294967296;
    }
  } else {
    for (let s = 0; s < nS; s++) noise[s] = rnd();
  }

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

  // Per-cell division readiness: accumulates at a rate set by `grow`, fires at 1.
  const ready = new Float32Array(nS);
  const cleaveSteps = Math.round(nStep * cleaveFrac);

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

    // ---- division
    //
    // WHEN DOES A CELL DIVIDE? Not on a synchronous poll. Each cell accumulates
    // readiness at a rate set by its own `grow` output, and divides when that
    // accumulator crosses 1, then resets. Division is therefore a RATE — a cell
    // expressing grow twice as hard divides twice as often — and cells fall out
    // of phase with each other naturally, instead of the whole embryo dividing
    // on the same tick because the loop said so.
    //
    // The old form (`t % 5 === 0` and a threshold) made division a property of
    // the integrator's step count, which is exactly the kind of thing that
    // silently sets a timescale nobody chose.
    //
    // During CLEAVAGE the accumulator is bypassed: cleavage in a real embryo is
    // not growth, it is the zygote's cytoplasm being partitioned, and it runs
    // fast and largely independent of patterning. Its job is to produce a FIELD
    // for the gradients to be read across.
    const cleaving = mode === 'cleave' && t < cleaveSteps;
    if (live.length < maxCells) {
      const added = [];
      for (let li = 0; li < live.length; li++) {
        const s = live[li];
        if (cleaving) {
          // partition, unconditionally, as fast as free neighbours allow
        } else {
          ready[s] += dt * conc[s * NGENE + G_GROW] * divRate;
          if (ready[s] < 1) continue;
          ready[s] -= 1;
        }
        const nb = sites[s].nb;
        // Grow into the free neighbour the gradient points hardest at, so
        // direction is a property of the chemistry rather than of iteration
        // order. Ties break toward the site the mother's axis favours.
        let best = -1, bestScore = -Infinity;
        for (let q = 0; q < nb.length; q++) {
          const nn = nb[q];
          if (occupied[nn]) continue;
          // Cleavage fills; it does not steer. Giving it the same polarity bias
          // as tip growth would make the "field" a lopsided crescent, which is
          // not a field.
          const score = cleaving
            ? (0.5 - sites[nn].rad) + 0.1 * noise[nn]
            : sites[nn].ap * conc[s * NGENE + G_AP]
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
        ready[best] = 0;
        setMaternal(best);
        added.push(best);
      }
      if (added.length) live = live.concat(added);
      if (aborted) break;
    }
  }

  // ---- read the body off the finished chemistry
  //
  // In cleave mode the egg is full and `survive` carves the shape out of it —
  // apoptosis, the way a hand is made. In grow mode the body is already only
  // where growth reached, so culling on top of that would delete a shape that
  // was built rather than sculpt one that was filled; survival is not applied.
  const sculpt = mode === 'cleave';
  const cells = [];
  let culled = 0;
  for (let li = 0; li < live.length; li++) {
    const s = live[li], b = s * NGENE, st = sites[s];
    const out = (n) => {
      const c = conc[b + OUT_BASE + n];
      return 2 * Math.tanh(c) - 1;                             // [0,inf) -> [-1,1)
    };
    if (sculpt && out(1) < 2 * surviveThresh - 1) { culled++; continue; }
    cells.push({
      x: st.x, y: st.y, ap: st.ap, dv: st.dv,
      contract: out(2), sense: out(3), grip: out(4), stiff: out(5),
      // tau spans a decade, log-spaced, matching devo.js so the CTRNN is
      // comparable between the two encodings.
      tau: 0.18 * Math.pow(10, out(6)),
      bias: out(7),
    });
  }
  return { cells, spent, aborted, steps: nStep, culled, laid: live.length };
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
/**
 * Founder seeding constants. Exposed as an options object because these are
 * EXPERIMENT KNOBS, not world parameters — the values that make a founder
 * population viable are found by sweeping them, not by reasoning, and a sweep
 * needs them addressable. Same treatment `devo.js` gives `setSynRange`.
 */
export const SEED_DEFAULTS = {
  edgeProb: 0.35,      // fraction of regulator slots live at birth
  weightScale: 2.5,    // spread of regulator weights
  biasSpread: 2.0,     // spread of per-gene bias
  biasOffset: -1.2,    // pushes most genes off at birth
  decaySpread: 0.8,
  diffSpread: 1.0,
  growBias: 0.2,
  growCrowd: -4.0,     // negative = grow where UNCROWDED, i.e. at a tip
  growSelf: 0.8,       // autocatalysis, so a tip sustains itself
  growAp: 0.6,         // a little polarity, so growth has a preferred end
  growDecay: 0.25,
  growDiff: -0.7,
  // Survival defaults ON. A founder whose survive gene sits near zero has its
  // whole embryo culled in cleave mode, which is not an interesting way to fail;
  // apoptosis should be something regulation REACHES for, not the default state
  // of matter. Mutation is free to carve from here.
  surviveBias: 1.2,
  surviveDecay: 0.0,
  surviveDiff: -0.5,
};

export function randomGenome(rnd = Math.random, opts = {}) {
  const o = { ...SEED_DEFAULTS, ...opts };
  const g = new Float32Array(GENOME_SIZE);
  for (let i = 0; i < NGENE; i++) {
    const b = i * GENE_STRIDE;
    for (let k = 0; k < K; k++) {
      // Most edges silenced at birth; a sparse network is the starting point,
      // and structural mutation adds edges where they earn their keep.
      g[b + OFF_SRC + k] = rnd() < o.edgeProb ? Math.floor(rnd() * NGENE) : -1;
      g[b + OFF_W + k] = (rnd() * 2 - 1) * o.weightScale;
    }
    g[b + OFF_BIAS] = (rnd() * 2 - 1) * o.biasSpread + o.biasOffset;
    g[b + OFF_DECAY] = (rnd() * 2 - 1) * o.decaySpread;
    g[b + OFF_DIFF] = (rnd() * 2 - 1) * o.diffSpread;
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
  g[gb + OFF_BIAS] = o.growBias;
  g[gb + OFF_SRC + 0] = G_CROWD; g[gb + OFF_W + 0] = o.growCrowd;  // grow at a TIP
  g[gb + OFF_SRC + 1] = G_GROW;  g[gb + OFF_W + 1] = o.growSelf;   // self-sustaining
  g[gb + OFF_SRC + 2] = G_AP;    g[gb + OFF_W + 2] = o.growAp;
  g[gb + OFF_DECAY] = o.growDecay;
  g[gb + OFF_DIFF] = o.growDiff;                                   // stays local

  const sb = G_SURVIVE * GENE_STRIDE;
  g[sb + OFF_BIAS] = o.surviveBias;
  g[sb + OFF_DECAY] = o.surviveDecay;
  g[sb + OFF_DIFF] = o.surviveDiff;

  // SYNAPSE COEFFICIENTS. Not optional and not zero-able: `synapse()` returns
  // SYN_RANGE * tanh(sum), so an all-zero block gives every edge weight exactly
  // zero and the whole population is born brain-dead. This repo has a commit
  // named "the brains were dead"; same magnitude as devo.js so the two encodings
  // start their connectomes on equal terms.
  for (let k = 0; k < NSYN; k++) g[SYN_OFF + k] = (rnd() * 2 - 1) * 0.9;
  return g;
}

/**
 * Mutation: weights and rates drift, and EDGES MOVE.
 *
 * Structural mutation is not decoration. A regulatory network's interesting
 * property is its topology — which gene regulates which — and a mutation
 * operator that only perturbs weights explores a fixed graph forever.
 */
export function mutate(genome, rnd = Math.random, { rate = 0.12, size = 0.3, structural = 0.02 } = {}) {
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
  // The connectome mutates too, or the brain is frozen at whatever the founder
  // happened to draw while the body evolves around it.
  for (let k = 0; k < NSYN; k++) {
    if (rnd() < rate) g[SYN_OFF + k] = clamp(g[SYN_OFF + k] + (rnd() * 2 - 1) * size, -6, 6);
  }
  return g;
}
