/**
 * A seeded generator as pure state transitions.
 *
 * Every function here takes a state and returns the advanced state alongside
 * its value. Nothing is stored, nothing is ambient, and there is no `Math.random`
 * anywhere in this package.
 *
 * That discipline is what makes a run reproducible from its seed, and it is the
 * first casualty of convenience: one call to an ambient generator, anywhere in
 * the tree, and a world stops being a function of its seed. Threading the state
 * by hand is mildly tedious and completely worth it — an evolutionary run that
 * cannot be replayed cannot be debugged, because the interesting behaviour
 * appears at generation ninety and never the same way twice.
 *
 * The generator is a 32-bit LCG (Numerical Recipes constants). It is not
 * cryptographic and does not need to be. It needs to be cheap, to have a long
 * enough period for a run, and — most importantly — to be trivially reproducible
 * in Rust, which rules out anything relying on JavaScript number semantics.
 *
 * State is a plain number so it can cross a WASM boundary, sit in a snapshot, or
 * be logged, without ceremony.
 */

/** @typedef {number} Rng an opaque generator state */

/** Start a generator. Any integer seed works; 0 is fine. */
export const seed = (n) => (n >>> 0);

/**
 * Advance the state. Exported because everything else is built from it and
 * because a caller sometimes wants to burn a step without using the value.
 * @param {Rng} r
 * @returns {Rng}
 */
export const next = (r) => (Math.imul(r, 1664525) + 1013904223) >>> 0;

/**
 * A float in [0, 1).
 * @param {Rng} r
 * @returns {[number, Rng]} the value and the advanced state
 */
export function unit(r) {
  const s = next(r);
  return [s / 4294967296, s];
}

/**
 * A float in [lo, hi).
 * @returns {[number, Rng]}
 */
export function range(r, lo, hi) {
  const [u, r2] = unit(r);
  return [lo + u * (hi - lo), r2];
}

/**
 * A float in [-m, +m). The commonest shape in mutation code, worth naming so
 * the intent is legible at the call site.
 * @returns {[number, Rng]}
 */
export function symmetric(r, m) {
  const [u, r2] = unit(r);
  return [(u * 2 - 1) * m, r2];
}

/**
 * An integer in [0, n).
 * @returns {[number, Rng]}
 */
export function below(r, n) {
  const [u, r2] = unit(r);
  return [Math.min(n - 1, (u * n) | 0), r2];
}

/**
 * True with probability p.
 * @returns {[boolean, Rng]}
 */
export function chance(r, p) {
  const [u, r2] = unit(r);
  return [u < p, r2];
}

/**
 * Shuffle a COPY of `xs`, leaving the caller's array alone.
 *
 * Returning a new array rather than shuffling in place is the more expensive
 * choice and the right default here: the caller usually still wants the original
 * order, and a function that quietly reorders its argument is the kind of thing
 * that is discovered much later and from a long way away.
 * @returns {[Array, Rng]}
 */
export function shuffled(r, xs) {
  const out = xs.slice();
  let s = r;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, s2] = below(s, i + 1);
    s = s2;
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return [out, s];
}

/**
 * Draw `k` values by folding a generator, for callers that want a batch without
 * writing the threading out by hand.
 * @returns {[number[], Rng]}
 */
export function take(r, k, draw = unit) {
  const out = new Array(k);
  let s = r;
  for (let i = 0; i < k; i++) {
    const [v, s2] = draw(s);
    out[i] = v; s = s2;
  }
  return [out, s];
}
