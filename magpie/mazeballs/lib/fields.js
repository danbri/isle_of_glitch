/**
 * Vector/scalar fields — the one primitive the WORLD.md world is built on.
 *
 * WORLD.md's design discipline is parsimony: a small number of fields over the
 * 2D world, sampled per cell, updated cheaply, composing into many dynamics
 * (chemical gradients, currents advecting smells, terrain shaping flow). This
 * file is that primitive and nothing more — one scalar field with diffusion,
 * decay and sources; one divergence-free flow field from curl noise; semi-
 * Lagrangian advection of the scalar by the flow; bilinear sampling for a cell
 * to read a field at its own position. No multi-field engine, no coupling — add
 * those only when a measured experiment needs them.
 *
 * COMPUTE PATH. Written as GPU-shaped kernels, exactly like lib/softbody.js:
 * flat Float32Array storage, and every update is a pass with no sequential
 * dependency between grid cells. Diffusion is a Jacobi stencil (read old, write
 * new). Semi-Lagrangian advection is per-output-cell independent — each cell
 * traces its velocity back and samples the old field, which is the textbook
 * stable-and-parallel advection and the natural WGSL dispatch. Nothing here is
 * Gauss-Seidel or otherwise serial.
 *
 * DETERMINISM. Seeded value-noise, no Date/Math.random, so a world is a pure
 * function of its seed — the reproducibility the significance harness needs.
 *
 * The world is the unit square [0,1]^2 on a WxH grid; callers map their own
 * coordinates in. Boundaries are clamped (a closed basin), which is the cheap
 * default; a toroidal option can be added when a wrap-around world needs it.
 */

/* --------------------------------------------------------------- value noise */

// Deterministic hash -> [0,1). Integer lattice, so gradients are reproducible
// and cheap; this is the generator curlFlow() differentiates for its potential.
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);              // smoothstep, C1 at the lattice
const lerp = (a, b, t) => a + (b - a) * t;

/** Value noise at (x,y) in lattice units, one octave. */
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = smooth(fx), v = smooth(fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Fractal value noise, `oct` octaves, in [0,1]-ish. */
export function fbm(x, y, seed, oct = 4, lac = 2.0, gain = 0.5) {
  let f = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    f += amp * vnoise(x * freq, y * freq, seed + o * 1013);
    norm += amp; amp *= gain; freq *= lac;
  }
  return f / norm;
}

/* ------------------------------------------------------------- scalar field */

export class ScalarField {
  /**
   * @param {number} w  grid width
   * @param {number} h  grid height
   * @param {object} [o]
   * @param {number} [o.diffuse=0.12]  diffusion coefficient per step, in [0,0.25] for stability
   * @param {number} [o.decay=0.0]     fractional decay per step
   */
  constructor(w, h, { diffuse = 0.12, decay = 0.0 } = {}) {
    this.w = w; this.h = h; this.diffuse = diffuse; this.decay = decay;
    this.a = new Float32Array(w * h);   // current
    this.b = new Float32Array(w * h);   // scratch (double-buffer for Jacobi/advect)
  }
  idx(ix, iy) { return iy * this.w + ix; }

  /** Bilinear sample at world (x,y) in [0,1]^2, clamped at the border. */
  sample(x, y) {
    const w = this.w, h = this.h;
    const gx = Math.min(w - 1.001, Math.max(0, x * (w - 1)));
    const gy = Math.min(h - 1.001, Math.max(0, y * (h - 1)));
    const ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy;
    const a = this.a;
    const s00 = a[iy * w + ix], s10 = a[iy * w + ix + 1];
    const s01 = a[(iy + 1) * w + ix], s11 = a[(iy + 1) * w + ix + 1];
    return lerp(lerp(s00, s10, fx), lerp(s01, s11, fx), fy);
  }

  /** Deposit `amount` at world (x,y), spread bilinearly to the four cells. */
  deposit(x, y, amount) {
    const w = this.w, h = this.h;
    const gx = Math.min(w - 1.001, Math.max(0, x * (w - 1)));
    const gy = Math.min(h - 1.001, Math.max(0, y * (h - 1)));
    const ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy;
    const a = this.a;
    a[iy * w + ix]       += amount * (1 - fx) * (1 - fy);
    a[iy * w + ix + 1]   += amount * fx * (1 - fy);
    a[(iy + 1) * w + ix] += amount * (1 - fx) * fy;
    a[(iy + 1) * w + ix + 1] += amount * fx * fy;
  }

  /**
   * One update: diffuse (Jacobi stencil, clamped border = zero-flux, so total
   * mass is conserved by diffusion) then decay. Advection, if any, is a separate
   * pass the caller runs with a Flow — kept separate so a field can diffuse
   * without a flow and vice versa.
   */
  step() {
    const { w, h, a, b, diffuse, decay } = this;
    const keep = 1 - 4 * diffuse;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        // Zero-flux (Neumann) border: a neighbour off the edge reflects the
        // cell itself, so nothing leaks out and diffusion conserves total mass.
        const l = a[x > 0 ? i - 1 : i], r = a[x < w - 1 ? i + 1 : i];
        const u = a[y > 0 ? i - w : i], d = a[y < h - 1 ? i + w : i];
        b[i] = (keep * a[i] + diffuse * (l + r + u + d)) * (1 - decay);
      }
    }
    this.a.set(b);
  }

  total() { let s = 0; for (let i = 0; i < this.a.length; i++) s += this.a[i]; return s; }
}

/* --------------------------------------------------------------- flow field */

/**
 * A divergence-free 2D flow from the curl of a scalar noise potential:
 * v = (dψ/dy, -dψ/dx). Curl of any scalar is divergence-free by construction,
 * so advecting a density by this flow neither creates nor destroys mass (up to
 * interpolation error) — which is what makes it the honest, cheap way to stir a
 * chemical field. Sampled analytically from the noise, so there is no grid to
 * store; a caller reads velocity at any world point.
 */
export class CurlFlow {
  /**
   * @param {object} [o]
   * @param {number} [o.seed=1]
   * @param {number} [o.scale=3.5]   spatial frequency of the eddies
   * @param {number} [o.strength=1]  velocity magnitude scale
   * @param {number} [o.oct=3]       fbm octaves in the potential
   */
  constructor({ seed = 1, scale = 3.5, strength = 1, oct = 3 } = {}) {
    this.seed = seed >>> 0 || 1; this.scale = scale; this.strength = strength; this.oct = oct;
  }
  /** Velocity (vx, vy) at world (x,y) in [0,1]^2, from the curl of the potential. */
  vel(x, y, out = { vx: 0, vy: 0 }) {
    const s = this.scale, e = 1e-3;
    const psi = (px, py) => fbm(px * s, py * s, this.seed, this.oct);
    // Central differences of the potential -> curl.
    const dpdy = (psi(x, y + e) - psi(x, y - e)) / (2 * e);
    const dpdx = (psi(x + e, y) - psi(x - e, y)) / (2 * e);
    out.vx = dpdy * this.strength;
    out.vy = -dpdx * this.strength;
    return out;
  }
}

/**
 * Semi-Lagrangian advection of a ScalarField by a flow, dt in world units.
 * Per-output-cell independent — each cell traces its velocity back one step and
 * bilinearly samples the old field — so it is unconditionally stable and is the
 * natural parallel/WGSL form. Writes into the field's scratch buffer and swaps.
 */
export function advect(field, flow, dt) {
  const { w, h, a, b } = field;
  const vel = { vx: 0, vy: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = x / (w - 1), wy = y / (h - 1);
      flow.vel(wx, wy, vel);
      // Trace back to where this cell's material came from, then sample.
      const sx = wx - vel.vx * dt, sy = wy - vel.vy * dt;
      b[y * w + x] = field.sample(
        Math.min(1, Math.max(0, sx)), Math.min(1, Math.max(0, sy)));
    }
  }
  field.a.set(b);
}
