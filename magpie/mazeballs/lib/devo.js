/**
 * Development: genome -> body. The genotype/phenotype map this project did not
 * have.
 *
 * Until now the genome WAS the phenotype — a graph of cells copied with
 * perturbation. Nothing developed, and METHODS.md is explicit that the
 * developmental encoding is the central thing the loop should be mutating.
 * eggs.md is equally explicit that reproduction as a point-event is a
 * predatorSpeed-class shortcut. This module is the first half of fixing both.
 *
 * WHAT A GENOME IS HERE
 *
 * Not a body. A small set of weights describing how a cell's properties depend
 * on WHERE IT IS in the egg. Two maternal gradients are laid down by the mother:
 *
 *   ap   anterior-posterior, -1 at one pole to +1 at the other
 *   dv   dorsal-ventral, -1 to +1 across
 *
 * Every property a cell has — whether it exists at all, how hard it contracts,
 * how well it grips, how stiff it is — is read off these two numbers through the
 * genome. That is the whole map, and it is deliberately tiny, because the point
 * of a patterning operator is that structure comes from the OPERATOR rather than
 * from a body plan written out cell by cell.
 *
 * WHY THIS SHAPE OF BASIS
 *
 * The basis functions are chosen so the structures we want to see are REACHABLE
 * but not imposed — the difference between making an outcome possible and
 * arranging it, which is the mistake this codebase has repeatedly made:
 *
 *   |dv|        bilateral symmetry. A genome weighting abs(dv) instead of dv
 *               cannot tell left from right, so its body is mirror-symmetric by
 *               construction. Both are available; which one is used is evolved.
 *               Symmetry is therefore an OUTCOME the loop reads, never a knob.
 *   sin(k*ap)   segmentation. Repeated modules along the main axis fall out of a
 *               periodic term rather than a segment count being a parameter.
 *   ap*|dv|     tapering — a body that is wide at one end and narrow at the
 *               other. This is what lets limbs be paired and positioned.
 *
 * `presence` decides whether there is a cell at a site at all, which is what
 * makes MORPHOLOGY evolvable: the outline of the animal is as much a product of
 * the genome as its tissue types. A body is not a ring of twelve cells any more.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * There is no size knob. Body size, cell count, module count, symmetry order and
 * the number of anything are all read off the developed body; none can be set.
 * METHODS.md asks for exactly this and the previous code did the opposite,
 * exposing maxCells and then sweeping it as an experiment.
 */

/**
 * Distance between lattice sites, shared by develop() and bond().
 *
 * These were separate defaults and drifted apart the moment one was changed:
 * develop() moved to 0.95 while bond() kept 0.62, so bond() looked for
 * neighbours within 0.84 of cells that were 0.95 apart and found none. Every
 * developed body came out with zero bonds — no skeleton, no muscle attachment,
 * no brain, since synapses follow bonds. One constant, two consumers.
 *
 * Must exceed a cell's touch distance (two radii, 0.68 by default) or bodies are
 * born with their cells inside one another.
 */
export const SPACING = 0.95;

/** Continuous properties every cell has. Types are descriptions of these. */
export const PROPS = ['presence', 'contract', 'sense', 'grip', 'stiff', 'tau', 'bias'];

/**
 * Basis over the two maternal gradients. Order is part of the genome format:
 * appending is safe, reordering is not.
 */
export const BASIS = [
  ['bias', (ap, dv) => 1],
  ['ap', (ap, dv) => ap],
  ['dv', (ap, dv) => dv],
  ['|dv|', (ap, dv) => Math.abs(dv)],
  ['ap|dv|', (ap, dv) => ap * Math.abs(dv)],
  ['ap^2', (ap, dv) => ap * ap],
  ['sin2ap', (ap, dv) => Math.sin(2 * Math.PI * ap)],
  ['sin3ap', (ap, dv) => Math.sin(3 * Math.PI * ap)],
  ['sin4ap|dv|', (ap, dv) => Math.sin(4 * Math.PI * ap) * Math.abs(dv)],
];

export const NB = BASIS.length;

/**
 * Synaptic expression. A synapse's weight is not stored per edge — it is
 * EXPRESSED from what its two endpoints are made of and where they sit.
 *
 * This is what makes the organism entirely a product of its genome. The
 * alternative, copying a parent's edge table and perturbing it, means the brain
 * is inherited as a literal wiring diagram while the body develops, and the two
 * drift apart: a child whose body developed differently would be wearing its
 * parent's connectome. Expressing the synapse from the tissue keeps brain and
 * body the same object, which is the principle the arena was built on.
 *
 * It also makes wiring physical. Cells only connect to cells they are BONDED to,
 * so a connection has a length, and long-range wiring costs extra bonds to
 * exist at all. METHODS.md calls this the deepest payoff of brain-in-body:
 * modularity becomes a consequence of anatomy rather than a designed prior.
 */
export const SYN_BASIS = [
  ['bias', (a, b) => 1],
  ['contract_src', (a, b) => a.contract],
  ['sense_src', (a, b) => a.sense],
  ['stiff_src', (a, b) => a.stiff],
  ['contract_dst', (a, b) => b.contract],
  ['sense_dst', (a, b) => b.sense],
  ['ap_dst', (a, b) => b.ap],
  ['dv_align', (a, b) => a.dv * b.dv],
  // ANTISYMMETRIC terms. Everything above depends only on WHAT the two cells
  // are, and bonded neighbours are made of nearly the same thing under a smooth
  // gradient — so w(i->j) came out nearly equal to w(j->i), and a symmetric
  // CTRNN provably converges to a fixed point. It cannot oscillate. Measured:
  // 99% of neurons with activation standard deviation below 0.01, no gait, and
  // bodies drifting 0.023 world units in 1600 steps.
  //
  // These two swap sign when the endpoints swap, so the genome can specify a
  // connection that excites down the body and inhibits back up it. That is the
  // asymmetry a central pattern generator needs, and along the AP axis it is
  // exactly the shape of a travelling wave — undulatory swimming, if evolution
  // wants it. Reachable, not imposed: a genome may leave both at zero.
  ['axial', (a, b) => b.ap - a.ap],
  ['lateral', (a, b) => b.dv - a.dv],
];
export const NSYN = SYN_BASIS.length;

/** A genome is PROPS.length x NB property weights, then NSYN synapse weights. */
export const GENOME_SIZE = PROPS.length * NB + NSYN;
export const SYN_OFF = PROPS.length * NB;

/**
 * Peak synapse weight.
 *
 * MEASURED, not chosen. A CTRNN only oscillates when loop gain is high enough;
 * below that it settles to a fixed point, and a body whose muscles hold a
 * constant contraction does not move at all. Free-running 24 developed brains
 * with no sensory drive, fraction whose mean activation standard deviation
 * exceeds 0.02:
 *
 *   scale  2.5, fan-in normalised    0%      <- what this was
 *   scale  6,   fan-in normalised    8%
 *   scale  6,   raw                 25%
 *   scale 12,   raw                 46%
 *   scale 20,   raw                 58%
 *
 * Two conclusions. The weights were roughly an order of magnitude too weak, and
 * dividing by fan-in — which looks like sensible normalisation and was added to
 * stop saturation — pushed the network further INTO the convergent regime and
 * made things worse at every scale. It is gone.
 *
 * 16 was chosen from that isolated free-running sweep, and it was too low. The
 * isolated answer is not the living answer: with sensory drive, births and deaths,
 * measured over 400 bodies in a real world —
 *
 *   SYN_RANGE   neurons CHANGING   mean act-std   displacement mean / p90
 *        8            7.0%            0.035           0.50 / 1.00
 *       16           11.2%            0.060           0.66 / 1.50
 *       32           21.1%            0.120           1.01 / 2.06
 *       64           32.1%            0.188           0.99 / 2.41
 *      128           30.7%            0.167           1.05 / 2.31
 *
 * A WRONG HYPOTHESIS DIED HERE, and it is worth keeping. 83% of neurons sat
 * railed at +/-1, so the obvious diagnosis was saturation: too much drive,
 * turn it down. The sweep says the opposite — displacement RISES as the
 * mid-range band shrinks. A neuron pinned at +1 that SWITCHES to -1 drives a
 * muscle harder than one drifting gently mid-scale; bang-bang control moves a
 * body perfectly well. "Fraction in the dynamic band" measured the wrong thing
 * entirely. What matters is whether an activation CHANGES OVER TIME, and by
 * that measure the drive was far too weak rather than too strong.
 *
 * 64 sits at the knee: both variability and displacement plateau there and 128
 * buys nothing. Still reachable-not-imposed — a genome remains free to specify a
 * quiet brain, and most will.
 */
// 32, LOWERED from 64 — and the reasoning that set it to 64 is retracted.
//
// That sweep concluded drive was too weak and higher was strictly better. It
// was measured when the tau floor was 0.018 s against dt 0.015, i.e. when
// every fast neuron was a comparator rather than an integrator. Under those
// dynamics more gain really did buy more activity, because the only thing on
// offer was how often a square wave flipped.
//
// Re-measured at the corrected tau range (0.126-1.26 s), sampling every step:
//
//     syn    |state|  graded%  jumpy  medHz  inBand%  selfProp
//      16      24.6      10    0.033   0.00      36    0.0003
//      32      38.1      23    0.048   1.14      40    0.0023
//      64      49.0      43    1.000  33.31      21    0.0019
//     128      47.6      54    1.000  33.31      11    0.0045
//
// At 64 and above the traces go back to jumpy 1.000 and flip at the sample
// rate: the drive is large enough to re-saturate the network whatever tau
// says, because tau sets how fast a neuron approaches its input and not how
// big that input is. 32 is where smoothness, a rhythm inside the body's
// 0.3-3 Hz band, and median self-propulsion coincide.
//
// Still reachable-not-imposed: a genome remains free to specify a quiet brain.
export let SYN_RANGE = 32;

/**
 * Override the synapse weight scale. An experiment knob, not a world parameter:
 * the value that maximises oscillation in an ISOLATED free-running brain is not
 * the value that does so in a living world with sensory drive, and finding the
 * second requires sweeping it in situ.
 */
export function setSynRange(v) { SYN_RANGE = v; }

/**
 * Stiffness spans STIFF_BASE^-1 to STIFF_BASE^+1 around the baseline spring.
 *
 * Was 4 (a 16x span end to end). The soft end was too soft: a body whose genome
 * made everything compliant could not resist flow drag across its own length and
 * its p90 bond reached 8x rest. At 2 the span is still fourfold — ample for bone
 * against sinew — and shared with the tests so it is stated once.
 */
export const STIFF_BASE = 2;

/** The weight of a synapse from cell `a` to cell `b`, expressed, not stored. */
export function synapse(genome, a, b) {
  let s = 0;
  for (let k = 0; k < NSYN; k++) s += genome[SYN_OFF + k] * SYN_BASIS[k][1](a, b);
  return SYN_RANGE * Math.tanh(s);
}

/**
 * A random viable-ish genome. Biased so `presence` starts positive over most of
 * the egg — a uniformly random genome usually specifies an animal with no cells
 * in it, and a founder population that is mostly empty measures nothing.
 */
export function randomGenome(rnd) {
  const g = new Float32Array(GENOME_SIZE);
  for (let p = 0; p < PROPS.length; p++) {
    for (let b = 0; b < NB; b++) g[p * NB + b] = (rnd() * 2 - 1) * 0.8;
  }
  g[PROPS.indexOf('presence') * NB] = 0.7 + rnd() * 0.5;   // bias term
  for (let k = 0; k < NSYN; k++) g[SYN_OFF + k] = (rnd() * 2 - 1) * 0.9;
  return g;
}

/** Evaluate one property of the genome at a point in the egg. */
export function express(genome, prop, ap, dv) {
  const p = PROPS.indexOf(prop);
  let s = 0;
  for (let b = 0; b < NB; b++) s += genome[p * NB + b] * BASIS[b][1](ap, dv);
  return Math.tanh(s);
}

/**
 * Develop a genome into a body.
 *
 * Sites are sampled on a hexagonal-ish lattice in EGG-LOCAL coordinates. The
 * lattice is scaffolding for sampling the gradients, not the world — developed
 * cells are handed continuous positions and immediately obey continuous physics.
 * Hexagonal rather than square because a square lattice gives every cell four
 * neighbours at right angles and quietly builds a preferred direction into every
 * body that evolves in it.
 *
 * @param {Float32Array} genome
 * @param {object} o
 * @param {number} o.extent     how far the egg reaches in cell radii
 * @param {number} o.spacing    distance between lattice sites
 * @param {number} o.yolk       energy available; development stops when spent
 * @param {number} o.cellCost   energy one cell costs to build
 * @returns {{cells: Array, ap: Float32Array, dv: Float32Array, spent: number,
 *            aborted: boolean}}
 */
export function develop(genome, o = {}) {
  // Spacing must exceed a cell's TOUCH DISTANCE (two radii, 0.68 at the default
  // 0.34 radius) or every body is born with its cells inside one another and
  // contact spends the first moments of life shoving them apart. It was 0.62,
  // which is less, so bodies were also about 2.5x denser than the jittered discs
  // the old code produced — and a dense body has too little ground beneath it to
  // pay its own brain tax, whatever its grazing rate, because grazing cannot
  // outrun regrowth for long. Dense tissue starved in place.
  const { extent = 3.2, spacing = SPACING, yolk = Infinity, cellCost = 0.6 } = o;
  const cells = [];
  const R = Math.ceil(extent / spacing);
  let spent = 0;
  let aborted = false;

  for (let row = -R; row <= R && !aborted; row++) {
    const y = row * spacing * 0.866;                 // hex row height
    const off = (row & 1) ? spacing * 0.5 : 0;       // stagger alternate rows
    for (let col = -R; col <= R; col++) {
      const x = col * spacing + off;
      const r = Math.hypot(x, y);
      if (r > extent) continue;

      // Gradients are normalised over the egg, so development is scale-free:
      // the same genome makes the same SHAPE in a larger or smaller egg.
      const ap = x / extent;
      const dv = y / extent;

      if (express(genome, 'presence', ap, dv) <= 0) continue;

      if (spent + cellCost > yolk) { aborted = true; break; }
      spent += cellCost;

      cells.push({
        x, y, ap, dv,
        contract: express(genome, 'contract', ap, dv),
        sense: express(genome, 'sense', ap, dv),
        grip: express(genome, 'grip', ap, dv),
        stiff: express(genome, 'stiff', ap, dv),
        // tau spans a decade, log-spaced: fast reflex arcs and slow integrators
        // are both reachable and neither is the default.
        tau: 0.18 * Math.pow(10, express(genome, 'tau', ap, dv)),
        bias: express(genome, 'bias', ap, dv),
      });
    }
  }
  return { cells, spent, aborted };
}

/**
 * Bond the developed cells to their neighbours, and give each bond material
 * properties from the cells it joins.
 *
 * This is where bone and sinew come from. A bond is not a generic spring any
 * more: its stiffness is the product of what its endpoints are made of, so a run
 * of stiff cells is a rigid strut and a compliant cell between two stiff ones is
 * a joint. "Bone" and "sinew" are DESCRIPTIONS of regions of a continuum, not
 * types the engine branches on — which is the treatment CELLS.md asks for, and
 * it costs no new entity and no new physics.
 *
 * @returns {Array<{i,j,rest,stiff,brittle}>}
 */
export function bond(cells, { spacing = SPACING, reach = 1.35, maxDegree = 6 } = {}) {
  const bonds = [];
  const deg = new Int32Array(cells.length);
  const lim = spacing * reach;

  // Nearest-first, so when a cell hits its degree limit it keeps the bonds that
  // hold it to its immediate neighbours rather than whichever it happened to
  // meet first. Iteration order should not decide anatomy.
  const cand = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const d = Math.hypot(cells[i].x - cells[j].x, cells[i].y - cells[j].y);
      if (d <= lim) cand.push([d, i, j]);
    }
  }
  cand.sort((a, b) => a[0] - b[0]);

  for (const [d, i, j] of cand) {
    if (deg[i] >= maxDegree || deg[j] >= maxDegree) continue;
    deg[i]++; deg[j]++;
    // Stiffness from both endpoints, so the bond is symmetric and Newton's
    // third law survives — the asymmetric version of this in the muscle code
    // injected energy every step and drove bodies to NaN.
    const s = (cells[i].stiff + cells[j].stiff) * 0.5;
    bonds.push({
      i, j,
      rest: d,
      // 0.5x to 2x around the baseline. It was 0.25x-4x, and the soft end was
      // too soft: a body whose genome made everything compliant could not resist
      // flow drag across its own length, and the p90 bond reached 8x its rest
      // length. Bone and sinew still differ fourfold end to end.
      stiff: Math.pow(STIFF_BASE, s),
      // Stiff matter is brittle matter. This is what makes a skeleton a
      // liability as well as an asset, so rigidity has a cost that is physical
      // rather than a number subtracted from a fitness score.
      brittle: Math.max(0, s),
    });
  }
  return bonds;
}

/**
 * Keep only the largest connected piece.
 *
 * A body IS a connected component of its bond graph — a disconnected one is not
 * one organism, it is two. Nothing stopped development from specifying that:
 * `presence` is free to be positive in two separate lobes of the egg, and when
 * it was, the result was a "body" whose halves shared a genome and nothing else.
 * 28 of 600 bodies in a run came out fragmented this way.
 *
 * Discarded tissue is simply not built, so the yolk is not spent on it either.
 *
 * @returns {{cells: Array, bonds: Array}} renumbered to the kept cells
 */
export function largestPiece(cells, bonds) {
  const n = cells.length;
  if (n === 0) return { cells, bonds };
  const adj = Array.from({ length: n }, () => []);
  for (const b of bonds) { adj[b.i].push(b.j); adj[b.j].push(b.i); }

  const comp = new Int32Array(n).fill(-1);
  let best = -1, bestSize = 0, c = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue;
    let size = 0;
    const stack = [i];
    comp[i] = c;
    while (stack.length) {
      const v = stack.pop(); size++;
      for (const w of adj[v]) if (comp[w] < 0) { comp[w] = c; stack.push(w); }
    }
    if (size > bestSize) { bestSize = size; best = c; }
    c++;
  }
  if (c === 1) return { cells, bonds };

  const remap = new Int32Array(n).fill(-1);
  const kept = [];
  for (let i = 0; i < n; i++) if (comp[i] === best) { remap[i] = kept.length; kept.push(cells[i]); }
  const keptBonds = [];
  for (const b of bonds) {
    if (remap[b.i] < 0 || remap[b.j] < 0) continue;
    keptBonds.push({ ...b, i: remap[b.i], j: remap[b.j] });
  }
  return { cells: kept, bonds: keptBonds };
}

/** Mutate a genome. Returns a new array; the parent is untouched. */
export function mutate(genome, rnd, { rate = 0.12, size = 0.22 } = {}) {
  const g = Float32Array.from(genome);
  for (let k = 0; k < g.length; k++) {
    if (rnd() < rate) g[k] = Math.max(-6, Math.min(6, g[k] + (rnd() * 2 - 1) * size));
  }
  return g;
}

/**
 * Measurements of a developed body. Every one of these is an OUTCOME — read
 * off the phenotype, never set — which is the whole point of exposing patterning
 * operators instead of size knobs.
 */
export function morphology(cells, bonds = []) {
  const n = cells.length;
  if (n === 0) return { n: 0, symmetry: 0, segments: 0, elongation: 0, stiffSpan: 0 };

  // Bilateral symmetry: for each cell, is there one mirrored across dv = 0 with
  // similar properties? 1 is perfectly symmetric.
  let matched = 0;
  for (const c of cells) {
    let best = Infinity;
    for (const d of cells) {
      const dx = c.x - d.x, dy = c.y + d.y;             // mirror in y
      const dp = Math.abs(c.contract - d.contract) + Math.abs(c.grip - d.grip)
               + Math.abs(c.stiff - d.stiff);
      const e = Math.hypot(dx, dy) + dp * 0.25;
      if (e < best) best = e;
    }
    if (best < 0.28) matched++;
  }

  // Segments: sign changes in mean contractility along the main axis, which is
  // what a repeated module looks like from the outside.
  const B = 12, acc = new Float64Array(B), cnt = new Float64Array(B);
  let lo = Infinity, hi = -Infinity;
  for (const c of cells) { lo = Math.min(lo, c.x); hi = Math.max(hi, c.x); }
  const span = Math.max(1e-6, hi - lo);
  for (const c of cells) {
    const b = Math.min(B - 1, Math.floor((c.x - lo) / span * B));
    acc[b] += c.contract; cnt[b]++;
  }
  let flips = 0, prev = 0;
  for (let b = 0; b < B; b++) {
    if (!cnt[b]) continue;
    const m = acc[b] / cnt[b];
    if (prev !== 0 && Math.sign(m) !== Math.sign(prev)) flips++;
    if (m !== 0) prev = m;
  }

  let ylo = Infinity, yhi = -Infinity;
  for (const c of cells) { ylo = Math.min(ylo, c.y); yhi = Math.max(yhi, c.y); }
  const width = Math.max(1e-6, yhi - ylo);

  let sMin = Infinity, sMax = -Infinity;
  for (const b of bonds) { sMin = Math.min(sMin, b.stiff); sMax = Math.max(sMax, b.stiff); }

  return {
    n,
    symmetry: matched / n,
    segments: flips,
    elongation: span / width,
    stiffSpan: bonds.length ? sMax / Math.max(1e-6, sMin) : 0,
  };
}
