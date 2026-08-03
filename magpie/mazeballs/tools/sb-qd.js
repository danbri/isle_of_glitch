/**
 * Quality-diversity primitives for the soft-body loop: the pure functions that
 * a novelty-search or MAP-Elites selection scheme in `sb-evolve.js` needs, kept
 * out of `lib/softbody.js` (untouched, so the single-species path stays
 * byte-identical) and out of the loop itself (so they can be unit-tested).
 *
 * THE PROBLEM these attack. Six experiments established that pure fitness
 * selection (tournament k=2) walks this substrate into a sit-and-refuse
 * attractor on the discrimination task: sitting is a one-mutation win that pays
 * immediately, sensing needs many coordinated mutations that pay nothing until
 * complete, so selection takes the cheap win and never crosses the findability
 * valley to the discriminating policy that provably wins. The hypothesis here is
 * that a search which rewards BEHAVIOURAL DIVERSITY keeps a discriminating
 * stepping-stone alive even while it is currently worse than a sitter — so the
 * search must be able to tell a discriminator apart from a sitter in behaviour
 * space. That is the whole design constraint on the descriptor below.
 *
 * THE DESCRIPTOR (`descriptorOf`). Three spawn-averaged behavioural axes:
 *   selectivity  good/gross intake, 0.5 = indiscriminate, →1 discriminating.
 *                THIS is the axis that makes discrimination a distinct niche:
 *                a sitter eats a random 50/50 stream (≈0.5), a coverer eats
 *                everything (≈0.5), a toxic-seeker →0, only a body that steers
 *                off toxic on the quality sense reaches high selectivity. A
 *                descriptor without this axis (displacement/position only)
 *                collapses sitter and discriminator into the same cell and
 *                cannot keep the discriminator as a stepping stone — which is
 *                exactly why position-only novelty would be a null.
 *   gross        type-blind total eaten. Separates the refuse-all-food /
 *                anosmic degenerate (≈0) from any body that eats, and a coverer
 *                (high) from a sitter (moderate).
 *   path         total centroid travel. Separates a sitter (≈0) from a coverer
 *                (high), so the two non-sensing degenerates do not share a cell.
 * Together these place sit / cover / refuse / toxic-seek / discriminate in five
 * distinguishable regions, and selectivity is the axis a QD scheme rewards
 * exploring toward. The axes are spawn-averaged (and the caller runs the
 * high-turnover consume≈1.2 regime the research calibrated) because on a single
 * episode at low turnover selectivity is dominated by which patches a body
 * happened to sit on — spawn luck, not a heritable trait; averaging makes the
 * descriptor reflect the genome.
 */

/** Column z-scores of an N×D matrix (array of length-D rows). SD floored so a
 * dead axis (all bodies identical) contributes 0 distance rather than NaN. */
export function zNormColumns(rows) {
  const N = rows.length; if (!N) return { z: [], mean: [], sd: [] };
  const D = rows[0].length;
  const mean = new Array(D).fill(0), sd = new Array(D).fill(0);
  for (const r of rows) for (let d = 0; d < D; d++) mean[d] += r[d];
  for (let d = 0; d < D; d++) mean[d] /= N;
  for (const r of rows) for (let d = 0; d < D; d++) sd[d] += (r[d] - mean[d]) ** 2;
  for (let d = 0; d < D; d++) sd[d] = Math.sqrt(sd[d] / Math.max(1, N - 1)) || 1e-9;
  const z = rows.map(r => r.map((v, d) => (v - mean[d]) / sd[d]));
  return { z, mean, sd };
}

/** Mean Euclidean distance to the k nearest OTHER rows, in whatever space the
 * rows already live in (caller z-normalises first). This is the novelty score:
 * a body far from the rest of the population in behaviour space is novel and is
 * rewarded even when its fitness is currently poor. */
export function knnNovelty(rows, k) {
  const N = rows.length; if (N < 2) return new Array(N).fill(0);
  const kk = Math.max(1, Math.min(N - 1, k | 0));
  const out = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    const ds = [];
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      let s = 0; const a = rows[i], b = rows[j];
      for (let d = 0; d < a.length; d++) s += (a[d] - b[d]) ** 2;
      ds.push(Math.sqrt(s));
    }
    ds.sort((p, q) => p - q);
    let acc = 0; for (let m = 0; m < kk; m++) acc += ds[m];
    out[i] = acc / kk;
  }
  return out;
}

/** Standardise a vector to z-scores (for combining fitness and novelty on one
 * scale before selection ranks on their sum). */
export function zScore(v) {
  const n = v.length; if (!n) return v.slice();
  const m = v.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1)) || 1e-9;
  return v.map(x => (x - m) / sd);
}

/** Frozen quantile bin edges (nb-1 of them) from a sample — same estimator as
 * evodevo's MAP-Elites, so the grid spans the observed range rather than a
 * guessed scale. Edges are taken from the generation-0 descriptor distribution
 * and then held fixed for the whole run. */
export function binEdges(vals, nb) {
  const s = Array.from(vals).sort((a, b) => a - b), e = [];
  for (let i = 1; i < nb; i++) e.push(s[Math.floor(s.length * i / nb)]);
  return e;
}

/** Bin index of x under frozen edges. */
export function binOf(x, edges) { let b = 0; while (b < edges.length && x > edges[b]) b++; return b; }

/** Flatten a 3-axis descriptor to a single cell index given per-axis edge sets
 * and per-axis bin counts. */
export function cellOf(desc, edges, nb) {
  return (binOf(desc[0], edges[0]) * nb[1] + binOf(desc[1], edges[1])) * nb[2]
       + binOf(desc[2], edges[2]);
}
