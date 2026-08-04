/**
 * What descent copies, and how mutation changes it.
 *
 * A genome here is the whole heritable specification of one creature: how many
 * cells it has, what each of them becomes, the dynamics of each cell's neuron,
 * the wiring between them, and the graph of bonds that makes it a body rather
 * than a cloud. Position, velocity and energy are deliberately absent — those
 * are where a body happens to be, not what it is.
 *
 * Everything is a plain object of typed arrays. No classes, no methods, nothing
 * that cannot be written to a file or handed across a WASM boundary. A genome
 * that needs a constructor to be meaningful is a genome that cannot be archived,
 * and archiving is the whole basis of the ancestral tournament.
 *
 * All functions are pure and thread the RNG explicitly (see ./rng.js).
 */

import * as R from './rng.js';

/**
 * @typedef {object} Genome
 * @property {number} n            cells in the body
 * @property {Int32Array} ctype    what each cell becomes: 0 neuron, 1 sensor, 2 muscle
 * @property {Float32Array} bias   per-neuron bias
 * @property {Float32Array} invTau per-neuron 1/tau; stored inverted because the
 *                                 kernel multiplies rather than divides
 * @property {Int32Array} esrc     [n*degree] island-relative edge sources, -1 empty
 * @property {Float32Array} ew     [n*degree] edge weights
 * @property {Int32Array} bond     [n*bondK] island-relative bond targets, -1 empty
 * @property {Float32Array} brest  [n*bondK] rest length per bond
 * @property {number} degree
 * @property {number} bondK
 */

export const TAU_MIN = 0.24;
export const TAU_MAX = 1.89;

/** Default mutation parameters. Passed explicitly; nothing reads a global. */
export const defaultParams = Object.freeze({
  rate: 0.14,        // fraction of scalar entries perturbed
  size: 0.32,        // magnitude of a perturbation
  structRate: 0.035, // an edge appearing or vanishing
  typeRate: 0.07,    // a cell becoming a different kind of cell
  topoRate: 0.30,    // a bond being added or dropped
  sizeRate: 0.25,    // the body gaining or losing a cell
  minCells: 5,
  maxCells: 40,
  weightClamp: 12,   // see mutateGenome
});

/** An empty genome of `n` cells, all edges and bonds unset. */
export function emptyGenome(n, degree, bondK) {
  return {
    n, degree, bondK,
    ctype: new Int32Array(n),
    bias: new Float32Array(n),
    invTau: new Float32Array(n).fill(1 / 1.0),
    esrc: new Int32Array(n * degree).fill(-1),
    ew: new Float32Array(n * degree),
    bond: new Int32Array(n * bondK).fill(-1),
    brest: new Float32Array(n * bondK),
  };
}

/** A deep copy. Genomes are archived and replayed, so sharing buffers is a trap. */
export const cloneGenome = (g) => ({
  n: g.n, degree: g.degree, bondK: g.bondK,
  ctype: Int32Array.from(g.ctype),
  bias: Float32Array.from(g.bias),
  invTau: Float32Array.from(g.invTau),
  esrc: Int32Array.from(g.esrc),
  ew: Float32Array.from(g.ew),
  bond: Int32Array.from(g.bond),
  brest: Float32Array.from(g.brest),
});

/**
 * Map a child cell index onto the parent cell it descends from.
 *
 * When a child has a different cell count from its parent, cells correspond
 * proportionally around the body rather than by truncation, so a body that gains
 * a cell interpolates its parent's plan instead of losing the tail of it.
 */
export const sourceOf = (i, childN, parentN) =>
  Math.min(parentN - 1, Math.floor((i * parentN) / childN));

/**
 * The heritable time constant, in seconds.
 *
 * Stored inverted, and clamped on the way out as well as in, because a tau
 * outside this band is not merely unusual — below it the integrator is unstable
 * at the world's timestep, and far above it the f32 increment near equilibrium
 * falls under the rounding epsilon and the neuron silently stops integrating
 * altogether rather than integrating slowly.
 */
export const tauOf = (g, i) => 1 / Math.max(g.invTau[i], 1e-6);
export const clampTau = (t) => Math.min(TAU_MAX, Math.max(TAU_MIN, t));

/**
 * Produce a mutated child genome.
 *
 * @param {Genome} parent
 * @param {object} params
 * @param {number} rng
 * @returns {[Genome, number]} the child and the advanced RNG state
 */
export function mutateGenome(parent, params, rng) {
  const p = { ...defaultParams, ...params };
  let r = rng;

  // --- body size, which is what gives structure somewhere to go
  let n = parent.n;
  {
    const [grow, r1] = R.chance(r, p.sizeRate); r = r1;
    if (grow) {
      const [up, r2] = R.chance(r, 0.5); r = r2;
      n += up ? 1 : -1;
    }
  }
  n = Math.max(p.minCells, Math.min(p.maxCells, n));

  const child = emptyGenome(n, parent.degree, parent.bondK);
  const src = (i) => sourceOf(i, n, parent.n);

  // --- per-neuron dynamics
  for (let i = 0; i < n; i++) {
    const si = src(i);

    const [hitBias, r1] = R.chance(r, p.rate); r = r1;
    let bias = parent.bias[si];
    if (hitBias) { const [d, r2] = R.symmetric(r, p.size); r = r2; bias += d; }
    child.bias[i] = bias;

    const [hitTau, r3] = R.chance(r, p.rate); r = r3;
    let tau = tauOf(parent, si);
    if (hitTau) {
      // Perturbed in LOG space: a time constant is a scale, and an additive step
      // that is gentle at 1.8s is catastrophic at 0.25s.
      const [d, r4] = R.symmetric(r, p.size); r = r4;
      tau = tau * Math.exp(d);
    }
    child.invTau[i] = 1 / clampTau(tau);

    let type = parent.ctype[si];
    const [hitType, r5] = R.chance(r, p.typeRate); r = r5;
    if (hitType) { const [t, r6] = R.below(r, 3); r = r6; type = t; }
    child.ctype[i] = type;
  }

  // --- wiring
  const K = parent.degree;
  for (let i = 0; i < n; i++) {
    const si = src(i);
    for (let k = 0; k < K; k++) {
      const s = parent.esrc[si * K + k];
      // Remap through the size change as well as copying, so an inherited edge
      // still points at the corresponding cell rather than off the end.
      let tgt = s < 0 ? -1 : Math.min(n - 1, Math.floor((s * n) / parent.n));
      let w = parent.ew[si * K + k];

      if (s >= 0) {
        const [hitW, r1] = R.chance(r, p.rate); r = r1;
        if (hitW) { const [d, r2] = R.symmetric(r, p.size); r = r2; w += d; }
      }

      const [struct, r3] = R.chance(r, p.structRate); r = r3;
      if (struct) {
        if (tgt < 0) {
          const [j, r4] = R.below(r, n); r = r4;
          const [w0, r5] = R.symmetric(r, 1.2); r = r5;
          tgt = j; w = w0;
        } else { tgt = -1; w = 0; }
      }

      // Clamped, because a weight is a random walk with no restoring force and
      // nothing else bounds it. It takes thousands of generations to matter,
      // which is exactly long enough to appear as an unexplained failure in a
      // long run rather than as a bug during development.
      child.esrc[i * K + k] = tgt;
      child.ew[i * K + k] = tgt < 0 ? 0 : Math.max(-p.weightClamp, Math.min(p.weightClamp, w));
    }
  }

  return [child, r];
}

/** Total edges actually present — the honest synapse count. */
export function countEdges(g) {
  let n = 0;
  for (let i = 0; i < g.esrc.length; i++) if (g.esrc[i] >= 0) n++;
  return n;
}

/**
 * Every structural invariant a genome must satisfy, as a list of complaints.
 * Empty means sound. Returned rather than thrown so a caller can check a whole
 * population and report, which is what tests and archives want.
 */
export function validateGenome(g) {
  const bad = [];
  if (!(g.n > 0)) bad.push(`cell count ${g.n}`);
  if (g.ctype.length !== g.n) bad.push('ctype length');
  if (g.bias.length !== g.n) bad.push('bias length');
  if (g.esrc.length !== g.n * g.degree) bad.push('esrc length');
  if (g.bond.length !== g.n * g.bondK) bad.push('bond length');
  for (let i = 0; i < g.esrc.length; i++) {
    const s = g.esrc[i];
    // Island-relative by construction: an absolute index would carry whatever
    // arena offset the genome happened to occupy and wire a replay into
    // whatever now sits there.
    if (s !== -1 && (s < 0 || s >= g.n)) { bad.push(`edge ${i} -> ${s} outside ${g.n} cells`); break; }
  }
  for (let i = 0; i < g.bond.length; i++) {
    const b = g.bond[i];
    if (b !== -1 && (b < 0 || b >= g.n)) { bad.push(`bond ${i} -> ${b} outside ${g.n} cells`); break; }
  }
  for (let i = 0; i < g.n; i++) {
    const t = 1 / Math.max(g.invTau[i], 1e-9);
    if (!(t >= TAU_MIN - 1e-3 && t <= TAU_MAX + 1e-3)) { bad.push(`tau ${t.toFixed(3)} out of band`); break; }
  }
  return bad;
}
