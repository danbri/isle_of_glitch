#!/usr/bin/env node
/**
 * Is the incentive *actionable*? Repeatability of hazard exposure, feeding and
 * fitness across independent evaluations of the same genomes.
 *
 *   node tools/repeatability.js --generations 8 --hazStakes 16 --ambiguity 1 --seed 1
 *
 * Motivation (see RESEARCH.md, hazard-stakes section). Raising HAZARD_STAKES
 * makes hazards cost more, and the measured consequence is that `toxShare` —
 * the share of population fitness variance carried by the hazard term — goes
 * to ~1.0, while the `selection` component of the score collapses. Two
 * readings of that, and they are opposite:
 *
 *   (a) selection now has a large hazard signal to act on, and eight
 *       generations is simply not enough to act on it;
 *   (b) the hazard term is mostly *spawn luck* rather than genotype, so
 *       raising its price raises the NOISE in fitness rather than the signal,
 *       and selection gets worse the more the incentive is raised.
 *
 * Truncation selection can only act on the between-genotype part of a trait.
 * So evaluate the SAME final population R times from R independent spawn sets
 * and decompose:
 *
 *   repeatability R = var(genotype means) / var(all observations)
 *
 * the standard intra-class correlation, which here is a broad-sense
 * heritability: the ceiling on the per-generation response to selection on
 * that trait. R near 0 means the trait is not a heritable target at all, and
 * no price attached to it can make it one. Reported alongside the mean pairwise
 * Pearson correlation between evaluations, which is the same quantity read a
 * second way and is the more familiar number.
 *
 * The world layout is held fixed across evaluations, so a low repeatability is
 * about spawn position and trajectory noise rather than about the hazards
 * having moved. Food patches still relocate on depletion within an episode,
 * exactly as they do during selection — this is measuring the noise selection
 * actually faces, not an idealised version of it.
 */
import fs from 'node:fs/promises';
import { initBackend, parseArgs } from './backend.js';
import { EvoDevoSim, evolveFor, mean, sd } from '../lib/evodevo.js';

const args = parseArgs(process.argv.slice(2), {
  generations: 8, seed: 1, steps: 300, evals: 6,
  pop: 192, elites: 10, gain: 0.5, mutation: 0.10, epoch: 1450,
  clusters: 9, clusterSigma: 0.12, senseSigma2: 0.050, relocateThresh: 0.15,
  select: 'trunc', backend: 'auto', out: '', quiet: false, label: '',
  ambiguity: 0, qualitySigma2: 0.010,
  hazStakes: 1, hazSigma2: 0.0015, hazards: 18,
});
const log = (...m) => { if (!args.quiet) console.error(...m); };

const { pkg, backend } = await initBackend({ prefer: args.backend });
log(`[backend] ${pkg} -> ${backend}`);

const sim = new EvoDevoSim({
  seed: args.seed,
  config: {
    POP: args.pop, ELITES: args.elites, EPOCH_STEPS: args.epoch,
    GAIN: args.gain, MUTATION: args.mutation,
    FOOD_CLUSTERS: args.clusters, FOOD_CLUSTER_SIGMA: args.clusterSigma,
    FOOD_SENSE_SIGMA2: args.senseSigma2, FOOD_RELOCATE_THRESH: args.relocateThresh,
    SELECT: args.select,
    ODOUR_AMBIGUITY: args.ambiguity, ODOUR_QUALITY_SIGMA2: args.qualitySigma2,
    HAZARDS: args.hazards, HAZARD_STAKES: args.hazStakes,
    HAZARD_DAMAGE_SIGMA2: args.hazSigma2,
  },
});
await sim.initialise();

const t0 = Date.now();
await evolveFor(sim, args.generations, {
  onGeneration: ({ generation, best }) =>
    log(`[gen ${String(generation).padStart(3)}] best ${best.toFixed(3)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`),
});
log(`[evolved] ${args.generations} generations in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

/* --------------------------------------------- repeated evaluation */

const POP = sim.cfg.POP;
// [eval][agent] for each trait.
const tox = [], eat = [], fit = [];
for (let e = 0; e < args.evals; e++) {
  const init = sim.makeInit();
  const f = await sim.evaluate({ steps: args.steps, init, yieldEvery: 0 });
  const [t, i] = await Promise.all([sim.toxDose.data(), sim.intake.data()]);
  tox.push(Float32Array.from(t)); eat.push(Float32Array.from(i)); fit.push(f);
  sim.disposeInit(init);
  log(`[eval ${e + 1}/${args.evals}] toxDose ${mean(t).toFixed(4)} intake ${mean(i).toFixed(4)}`);
}

const variance = a => sd(a) ** 2;

/**
 * One-way ANOVA decomposition by genotype. `obs[e][i]` is agent i's value in
 * evaluation e. Between-genotype variance is the variance of each agent's mean
 * across evaluations, corrected for the sampling variance that inflates it
 * (var(mean of k draws) = varB + varW/k), which matters at evals=6 where the
 * uncorrected number would overstate repeatability by varW/6.
 */
function repeatability(obs) {
  const E = obs.length, N = obs[0].length;
  const perAgent = new Float64Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let e = 0; e < E; e++) s += obs[e][i]; perAgent[i] = s / E; }
  // Within-genotype (residual) variance, pooled over agents.
  let sw = 0;
  for (let i = 0; i < N; i++) {
    let s = 0; for (let e = 0; e < E; e++) s += (obs[e][i] - perAgent[i]) ** 2;
    sw += s / Math.max(1, E - 1);
  }
  const varW = sw / N;
  const varMeans = variance(perAgent);
  const varB = Math.max(0, varMeans - varW / E);
  const total = varB + varW;
  // Mean pairwise Pearson r between evaluations — the same quantity, read the
  // familiar way, and a check on the ANOVA arithmetic.
  const corr = (x, y) => {
    const mx = mean(x), my = mean(y);
    let cxy = 0, cxx = 0, cyy = 0;
    for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; cxy += a * b; cxx += a * a; cyy += b * b; }
    return (cxx <= 1e-12 || cyy <= 1e-12) ? 0 : cxy / Math.sqrt(cxx * cyy);
  };
  const rs = [];
  for (let a = 0; a < E; a++) for (let b = a + 1; b < E; b++) rs.push(corr(obs[a], obs[b]));
  return {
    repeatability: total > 1e-12 ? varB / total : 0,
    meanPairwiseR: mean(rs),
    varBetween: varB, varWithin: varW,
    mean: mean(obs.flatMap(o => Array.from(o))),
  };
}

const result = {
  label: args.label || undefined,
  settings: {
    seed: args.seed, generations: args.generations, steps: args.steps, evals: args.evals,
    pop: args.pop, ambiguity: args.ambiguity, hazStakes: args.hazStakes,
    hazSigma2: args.hazSigma2, hazards: args.hazards,
  },
  traits: {
    toxDose: repeatability(tox),
    intake: repeatability(eat),
    fitness: repeatability(fit),
  },
  runtimeSeconds: +((Date.now() - t0) / 1000).toFixed(1),
};

// How much of the *selectable* (between-genotype) fitness variance is hazard,
// versus how much of the total is. The gap between these two numbers is the
// whole argument: a hazard term can dominate total fitness variance while
// contributing almost nothing selection can act on.
const k = 1.35 * args.hazStakes;
const T = result.traits;
result.hazShareTotal = (T.toxDose.varBetween + T.toxDose.varWithin) * k * k /
  Math.max(1e-12, T.fitness.varBetween + T.fitness.varWithin);
// NOT reported unless fitness has a between-genotype component worth dividing
// by. At the repeatabilities this world actually produces (fitness R ~ 0.01)
// the denominator is frequently indistinguishable from zero and this ratio
// then returns garbage — one pilot cell printed 3.4e10. The repeatabilities
// themselves are the numbers to read; this one is a convenience that is only
// meaningful when fitness is measurably heritable at all.
result.hazShareBetween = T.fitness.repeatability >= 0.02
  ? T.toxDose.varBetween * k * k / T.fitness.varBetween : null;

if (args.out) await fs.writeFile(args.out, JSON.stringify(result, null, 2));
else process.stdout.write(JSON.stringify(result) + '\n');

log(`[done] toxDose R ${T.toxDose.repeatability.toFixed(3)} (r ${T.toxDose.meanPairwiseR.toFixed(3)}) · ` +
    `intake R ${T.intake.repeatability.toFixed(3)} (r ${T.intake.meanPairwiseR.toFixed(3)}) · ` +
    `fitness R ${T.fitness.repeatability.toFixed(3)} · ` +
    `hazShare total ${result.hazShareTotal.toFixed(3)} ` +
    `between ${result.hazShareBetween === null ? 'n/a (fitness R < 0.02)' : result.hazShareBetween.toFixed(3)}`);

sim.dispose();
