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

/** Continuous properties every cell has. Types are descriptions of these. */
export const PROPS = ['presence', 'contract', 'sense', 'grip', 'stiff', 'tau'];

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

/** A genome is PROPS.length x NB weights, flat, row-major by property. */
export const GENOME_SIZE = PROPS.length * NB;

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
  const { extent = 3.2, spacing = 0.62, yolk = Infinity, cellCost = 0.6 } = o;
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
export function bond(cells, { spacing = 0.62, reach = 1.35, maxDegree = 6 } = {}) {
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
      // 0.25x to 4x around the baseline: a decade of material, log-spaced.
      stiff: Math.pow(4, s),
      // Stiff matter is brittle matter. This is what makes a skeleton a
      // liability as well as an asset, so rigidity has a cost that is physical
      // rather than a number subtracted from a fitness score.
      brittle: Math.max(0, s),
    });
  }
  return bonds;
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
