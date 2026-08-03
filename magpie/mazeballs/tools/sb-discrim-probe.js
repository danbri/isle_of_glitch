#!/usr/bin/env node
/**
 * Generation-0 verification for the discrimination task: BEFORE any evolution,
 * prove that the task has NO kinematic degenerate (no fixed policy — sit, cover,
 * random — can collect net-positive reward) AND that it is winnable (a body that
 * ate only good WOULD score net-positive), so a later null ablation means
 * something. A null on a task where nothing could ever win says nothing; a win by
 * a fixed policy means the task still has an escape and is void.
 *
 *   node tools/sb-discrim-probe.js --toxicFrac 0.5 --harsh 1.5,2,3,4 --starve 0.02 \
 *        --food 24 --clusters 8 --relocateThresh 0.30 --pop 48 --evals 4
 *
 * For a population of RANDOM (unevolved) genomes — which is every fixed/blundering
 * kinematic policy the substrate expresses at generation 0, sitters and coverers
 * included — it measures, per toxin harshness H:
 *
 *   selectivity        good/gross fraction eaten. ~0.5 means the body eats a 50/50
 *                      good/toxic stream: it CANNOT discriminate (it has not
 *                      evolved to read the quality channel). If this is ~0.5 for
 *                      every random body, no fixed policy discriminates — the
 *                      premise of the task.
 *   net (indiscrim.)   goodEaten − H·toxEaten − starve = the actual fitness. The
 *                      fraction of the population scoring net-POSITIVE this way is
 *                      the kinematic-escape rate: it MUST be ~0 for the task to
 *                      have no degenerate. Reported for sitters and coverers
 *                      separately (by path) so neither is hiding a win.
 *   net (selective)    goodEaten − starve, i.e. the SAME trajectory with the toxic
 *                      intake simply not counted — a strict LOWER BOUND on what a
 *                      body that steered off toxic would score (a real discriminator
 *                      also steers TOWARD good, eating more). If this is positive
 *                      for a meaningful fraction, the task is winnable BY SENSING
 *                      and the reward gradient toward discrimination exists.
 *
 * The verdict per H: NO-DEGENERATE requires escape-rate ~0; WINNABLE requires the
 * selective lower bound positive for a real fraction; the calibrated band is where
 * both hold (harsh enough that indiscriminate loses, not so harsh that even the
 * selective bound drowns and the population can only survive by eating nothing).
 *
 * IMPORTANT — the quality channel already exists at generation 0, so a RANDOM
 * genome can wire it by accident and win by (accidentally) sensing. So "net-
 * positive with the sense intact" does NOT prove a kinematic escape. The clean
 * test of "no kinematic degenerate" is the escape rate with the QUALITY CHANNEL
 * ABLATED (mean-replaced): a body that provably cannot read quality is forced to
 * eat type-blind (50/50), and if NONE of those can score net-positive then no
 * non-sensing policy — sit, cover, random — can win, and any win must come from
 * the sense. That ablated escape rate is the decisive validity number here.
 */
import { parseArgs } from './backend.js';
import { DEFAULTS, makeRng, randomGenome, develop, makeWorld, Colony } from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  toxicFrac: 0.5, harsh: '1.5,2,3,4', starve: 0.02, qualSigma2: -1,
  food: 24, clusters: 8, relocateThresh: 0.30, consume: -1, regrow: -1,
  pop: 48, steps: 400, seed: 1, evals: 4,
  sitPath: 0.10, coverPath: 0.60,   // path bands for the sitter / coverer census
  // Non-stationary quality (0 = stationary). When >0, each patch's good/toxic
  // identity flips at this Poisson rate (per patch per second) mid-episode,
  // revealed only through the quality channel. The clean no-degenerate proof —
  // the quality-ablated escape rate — becomes STRUCTURAL under flipping: a body
  // that commits to a patch eats it good then toxic as it flips, so even the
  // spawn-luck / low-gross selectivity tail the stationary task left is gone.
  flipRate: 0,
});
const harshList = String(a.harsh).split(',').map(Number).filter(x => x > 0);

const mean = (v) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const se = (v) => { const m = mean(v), n = v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1) / n); };
const f = x => x.toFixed(4);
const frac = (v, pred) => v.filter(pred).length / Math.max(1, v.length);

console.log(`[sb-discrim-probe] gen-0 kinematic-degenerate + winnability check`);
console.log(`  toxicFrac ${a.toxicFrac}  starve ${a.starve}  food ${a.food} in ${a.clusters} clusters  ` +
            `relocateThresh ${a.relocateThresh}  pop ${a.pop}  steps ${a.steps}  evals ${a.evals}` +
            (a.flipRate > 0 ? `  flipRate ${a.flipRate} [NON-STATIONARY]` : ''));
console.log(`  harsh (H): ${harshList.join(', ')}\n`);
console.log('  (QABL = quality channel ablated: a body that provably cannot sense good vs toxic)');
console.log('  H     selectivity(QABL)   mean-net(QABL) ± SE  esc%   net-selective ± SE   win%  anosmia%');

// One shared episode over the whole population, optionally with the quality
// channel blinded. Returns per-organism trait rows.
function runPop(phenos, world, cfg, seed, qualAbl) {
  const col = new Colony(phenos, world, cfg);
  col.qualAblate = qualAbl;
  col.spawn(makeRng(seed));
  for (let s = 0; s < a.steps; s++) { col.step(); if (s % 50 === 0) col.assertFinite(); }
  col.assertFinite('end');
  return col.traits();
}

for (const H of harshList) {
  const cfg = Object.freeze({
    ...DEFAULTS,
    FOOD: a.food, FOOD_CLUSTERS: a.clusters,
    FOOD_TOXIC_FRAC: a.toxicFrac, FOOD_TOXIN_HARSH: H, FOOD_STARVE: a.starve,
    FOOD_RELOCATE_THRESH: a.relocateThresh >= 0 ? a.relocateThresh : DEFAULTS.FOOD_RELOCATE_THRESH,
    ...(a.qualSigma2 >= 0 ? { FOOD_QUAL_SIGMA2: a.qualSigma2 } : {}),
    ...(a.consume >= 0 ? { FOOD_CONSUME: a.consume } : {}),
    ...(a.regrow >= 0 ? { FOOD_REGROW: a.regrow } : {}),
    ...(a.flipRate > 0 ? { FOOD_FLIP_RATE: a.flipRate } : {}),
  });
  const elapsed = a.steps * cfg.DT, starveCost = cfg.FOOD_STARVE * elapsed;
  const world = makeWorld(cfg, makeRng(7));
  const rng = makeRng(a.seed);
  const phenos = Array.from({ length: a.pop }, (_, i) =>
    develop({ buf: randomGenome(rng, cfg).buf }, cfg, makeRng((0x51b0 ^ Math.imul(i + 1, 2654435761)) >>> 0)));

  // Per-genome means over evals spawns, quality sense INTACT and ABLATED.
  const selvI = phenos.map(() => []), netI = phenos.map(() => []), netS = phenos.map(() => []);
  const grossA = phenos.map(() => []);
  const selvQ = phenos.map(() => []), netQ = phenos.map(() => []);
  for (let e = 0; e < a.evals; e++) {
    const seed = 0x9000 + e * 7919;
    const trI = runPop(phenos, world, cfg, seed, null);      // quality intact
    const trQ = runPop(phenos, world, cfg, seed, 'mean');    // quality ablated
    for (let g = 0; g < phenos.length; g++) {
      selvI[g].push(trI[g].selectivity);
      netI[g].push(trI[g].netIntake);                        // good − H·tox − starve (intact)
      netS[g].push(trI[g].netIntake + H * trI[g].toxEaten);  // good − starve: LOWER bound on a discriminator
      grossA[g].push(trI[g].gross);
      selvQ[g].push(trQ[g].selectivity);
      netQ[g].push(trQ[g].netIntake);                        // quality-ablated: forced type-blind
    }
  }
  const gSelvI = phenos.map((_, g) => mean(selvI[g]));
  const gNetI = phenos.map((_, g) => mean(netI[g]));
  const gNetS = phenos.map((_, g) => mean(netS[g]));
  const gGross = phenos.map((_, g) => mean(grossA[g]));
  const gSelvQ = phenos.map((_, g) => mean(selvQ[g]));
  const gNetQ = phenos.map((_, g) => mean(netQ[g]));

  const escapeQ = frac(gNetQ, x => x > 0);   // net-positive WITHOUT the sense => noisy upper tail of the kinematic census
  const win = frac(gNetS, x => x > 0);
  const anosmia = frac(gGross, x => x < 0.01);
  const meanNetQ = mean(gNetQ);              // the ROBUST no-degenerate statistic: expected reward of a non-sensing policy

  console.log(`  ${String(H).padStart(4)}  ${f(mean(gSelvQ))} ± ${f(se(gSelvQ))}    ` +
    `${(meanNetQ >= 0 ? '+' : '') + f(meanNetQ)} ± ${f(se(gNetQ))}   ${(escapeQ * 100).toFixed(0).padStart(3)}%       ` +
    `${(mean(gNetS) >= 0 ? '+' : '') + f(mean(gNetS))} ± ${f(se(gNetS))}   ${(win * 100).toFixed(0).padStart(3)}%    ${(anosmia * 100).toFixed(0).padStart(3)}%`);
}
console.log('\nRead: mean net-ablated < 0 with selectivity(QABL) ~0.5 => a body that CANNOT sense quality eats 50/50 and');
console.log('      LOSES in expectation => NO KINEMATIC DEGENERATE (sit/cover/random all lose). escape%(QABL) is the noisy');
console.log('      per-genome upper tail — it collapses toward 0 as spawns increase (see sb-discrim-debug escape-scaling).');
console.log('      net-selective > 0 with win% > 0 => a body that steered off toxic WOULD win => task WINNABLE by sensing.');
