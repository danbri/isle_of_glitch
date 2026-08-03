/**
 * The analytic fields: value noise, fractal noise, divergence-free flow, and the
 * drifting resource landscape.
 *
 * These are the JavaScript half of a deliberate duplicate. The simulation
 * evaluates the same functions in WGSL on the GPU, because a cell must read the
 * field at its own position and cannot call into JS to do it. Anything on the
 * CPU that needs the same numbers — scoring a position, reporting on a live
 * world, an analysis that has no GPU to hand — comes here.
 *
 * THIS IS A DUPLICATE, AND DUPLICATES DRIFT. That is not a risk, it is a
 * certainty, and it has already happened three times in this project:
 *
 *   - tools/shape-report.js divided by a hardcoded rest length of 0.62 after
 *     rest lengths became per-bond, and reported bodies as frustrated for
 *     several commits after they had been fixed.
 *   - WGSL_FIELD started reading P.worldTime from the simulation's uniform,
 *     which is fine in the compute shader and takes the renderer down with
 *     "unresolved value 'P'" — the block is shared verbatim between them.
 *   - lib/evolve_test.js hand-copied this noise function to score positions,
 *     with nothing connecting it to the original.
 *
 * So the equivalence is not promised in a comment, it is TESTED: field_cpu_test.js
 * samples both this file and the real WGSL on a GPU at thousands of points and
 * fails if they disagree beyond f32 rounding. A duplicate that is checked is a
 * cache; a duplicate that is merely intended to match is a bug waiting.
 *
 * Any change here must be made in WGSL_FIELD too, and the test is what will tell
 * you that you forgot.
 */

/** Deterministic integer hash -> [0,1). Mirrors hash2 in WGSL_FIELD. */
export function hash2(ix, iy, seed) {
  // >>> 0 after each step, because WGSL's u32 wraps and JS numbers do not.
  let h = (Math.imul(ix >>> 0, 374761393) ^ Math.imul(iy >>> 0, 668265263)
        ^ Math.imul(seed >>> 0, 1274126177)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth3 = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

/** Value noise at p, one octave. Mirrors vnoise. */
export function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const u = smooth3(x - ix), v = smooth3(y - iy);
  return mix(
    mix(hash2(ix, iy, seed), hash2(ix + 1, iy, seed), u),
    mix(hash2(ix, iy + 1, seed), hash2(ix + 1, iy + 1, seed), u), v);
}

/**
 * Fractional-octave fbm. Mirrors fbmOct — including the FRACTIONAL octave
 * weighting, which exists so that zoom is continuous rather than stepping as
 * levels of detail cross a threshold.
 */
export function fbmOct(x, y, seed, octF) {
  let f = 0, amp = 1, norm = 0, qx = x, qy = y;
  for (let o = 0; o < 6; o++) {
    const w = Math.min(1, Math.max(0, octF - o));
    f += amp * w * vnoise(qx, qy, seed + o * 1013);
    norm += amp * w;
    amp *= 0.5; qx *= 2; qy *= 2;
  }
  return f / Math.max(norm, 1e-6);
}

/** Mirrors fbm: the simulation always uses full detail. */
export const fbm = (x, y, seed) => fbmOct(x, y, seed, 4);

/**
 * Divergence-free flow, the curl of an fbm potential. Mirrors flowField.
 * @returns {[number, number]}
 */
export function flowField(x, y, scale, strength, seed) {
  const e = 0.35 / scale;
  const qx = x * scale, qy = y * scale;
  const dx = fbm(qx + e * scale, qy, seed) - fbm(qx - e * scale, qy, seed);
  const dy = fbm(qx, qy + e * scale, seed) - fbm(qx, qy - e * scale, seed);
  return [dy * strength / (2 * e), -dx * strength / (2 * e)];
}

/**
 * The drifting, morphing resource field. Mirrors resourceField — note it takes
 * time and drift explicitly, exactly as the WGSL does, because that block may
 * not name a uniform.
 */
export function resourceField(x, y, scale, seed, t = 0, driftX = 0, driftY = 0, morphRate = 0) {
  const qx = x * scale + t * driftX, qy = y * scale + t * driftY;
  const a = fbm(qx, qy, seed);
  const b = fbm(qx, qy, seed + 7777);
  const w = 0.5 + 0.5 * Math.sin(t * morphRate);
  const r = mix(a, b, w);
  return r * r;
}
