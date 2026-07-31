#!/usr/bin/env node
/**
 * Pool several `tournament.js --out` runs of the SAME configuration across
 * seeds, and diagnose the coevolutionary dynamics from the pooled curves.
 *
 *   node tools/tournament-agg.js tourn-s1.json tourn-s2.json ... --out pooled.json
 *
 * Why this exists: a single tournament's trend line is a regression through
 * nine points from ONE evolutionary history, and its residual standard error
 * says nothing about seed noise — which on this simulation is an order of
 * magnitude larger than parameter noise (0.250 against 0.026, RESEARCH.md).
 * The honest statistic is the mean across seeds at each generation with a
 * SEED-level standard error, and a per-seed trend slope treated as one
 * observation per seed. Both are computed here; nothing else is.
 *
 * The three classic coevolutionary failure modes are diagnosed explicitly,
 * because the shape of these curves is what names them:
 *
 *   disengagement        one side is crushed, the gradient vanishes, both
 *                        drift. Signature: contact saturated at a bound, and
 *                        the spread across prey collapsed — selection has
 *                        nothing left to act on. Distinguished from a real
 *                        prey win by `preyForageUnderThreat`, since "predators
 *                        stopped catching" and "prey got good at escaping"
 *                        give the same head-to-head number.
 *   cycling              rock-paper-scissors. Signature: `byAgeGap` is
 *                        non-monotone — a side does better against recent
 *                        ancestors than against distant ones, so there is no
 *                        net progress despite local improvement.
 *   mediocre stable state both sides settle. Signature: every curve flat,
 *                        including both marginals, and the age-gap profile
 *                        flat too.
 */
import fs from 'node:fs/promises';
import { mean, sd } from '../lib/evodevo.js';

const raw = process.argv.slice(2);
const files = [], opt = {};
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (!a.startsWith('--')) { files.push(a); continue; }
  const eq = a.indexOf('='); const k = eq === -1 ? a.slice(2) : a.slice(2, eq);
  let v = eq === -1 ? undefined : a.slice(eq + 1);
  if (v === undefined) { const n = raw[i + 1]; if (n !== undefined && !n.startsWith('--')) { v = n; i++; } }
  opt[k] = v === undefined ? 'true' : v;
}
const runs = await Promise.all(files.map(async f => JSON.parse(await fs.readFile(f, 'utf8'))));
const seeds = runs.map(r => r.meta.seed);
if (new Set(seeds).size !== seeds.length) throw new Error(`a seed appears in more than one file: ${seeds}`);
const gens = runs[0].generations;
for (const r of runs)
  if (r.generations.join(',') !== gens.join(','))
    throw new Error('runs have different snapshot grids and cannot be pooled');

const stat = vals => {
  const m = mean(vals), s = vals.length > 1 ? sd(vals) : 0;
  return { mean: m, sd: s, se: vals.length > 1 ? s / Math.sqrt(vals.length) : Infinity, n: vals.length };
};
/** Mean across seeds at each generation, with a seed-level standard error. */
const curve = (pick) => gens.map((g, i) => ({ generation: g, ...stat(runs.map(r => pick(r, i))) }));

const predatorCapability = curve((r, i) => r.predatorCapability[i].vsAll);
const preyVulnerability = curve((r, i) => r.preyVulnerability[i].vsAll);
const preyForage = curve((r, i) => r.preyForageUnderThreat[i].vsAll);
const headToHead = curve((r, i) => r.headToHead[i].contact);
const preySpread = curve((r, i) => mean(r.matrix.map(row => row[i].preyContactSd)));
const preyBest = curve((r, i) => mean(r.matrix.map(row => row[i].preyContactBest)));
const touched = curve((r, i) => mean(r.matrix.map(row => row[i].touched)));

/** Per-seed slopes, pooled as one observation per seed — the protocol's bar. */
const slopes = k => stat(runs.map(r => r.trends[k].slope));
const trends = {
  predatorCapability: slopes('predatorCapability'),
  preyVulnerability: slopes('preyVulnerability'),
  preyForage: slopes('preyForage'),
  headToHead: slopes('headToHead'),
};
/** A slope counts as real only if it clears 2x its own seed-level SE. */
const verdictOf = t => Math.abs(t.mean) > 2 * t.se
  ? (t.mean > 0 ? 'RISING' : 'FALLING') : 'FLAT';

const N = gens.length;
const byAgeGap = Array.from({ length: N }, (_, k) => ({
  ageGap: k, generationsBack: runs[0].byAgeGap[k].generationsBack,
  predatorVsOlderPrey: stat(runs.map(r => r.byAgeGap[k].predatorVsOlderPrey).filter(v => v !== null)),
  preyVsOlderPredator: stat(runs.map(r => r.byAgeGap[k].preyVsOlderPredator).filter(v => v !== null)),
}));

/**
 * Cycling test. In a transitively improving race, predators do monotonically
 * better against older prey, so `predatorVsOlderPrey` rises with the age gap.
 * Any dip — better against recent ancestors than against distant ones — is
 * intransitivity, i.e. rock-paper-scissors, and means local improvement is not
 * accumulating into progress.
 */
const monotoneViolations = (series) => {
  let worst = 0, at = null;
  for (let k = 2; k < series.length; k++) {
    const drop = series[k - 1] - series[k];
    if (drop > worst) { worst = drop; at = k; }
  }
  return { worstDrop: worst, atAgeGap: at };
};
const cycling = {
  predator: monotoneViolations(byAgeGap.map(r => r.predatorVsOlderPrey.mean)),
  prey: monotoneViolations(byAgeGap.map(r => r.preyVsOlderPredator.mean)),
};

const first = c => c[0].mean, last = c => c[c.length - 1].mean;
const combinedSe = (a, b) => Math.sqrt(a.se ** 2 + b.se ** 2);
const endpoints = (c, label, betterWhenFalling = false) => {
  const d = last(c) - first(c), bar = 2 * combinedSe(c[0], c[c.length - 1]);
  const sig = Math.abs(d) > bar;
  return { label, first: first(c), last: last(c), delta: d, bar,
    verdict: !sig ? 'NO SIGNIFICANT CHANGE'
      : (betterWhenFalling ? (d < 0 ? 'IMPROVED' : 'DEGRADED')
                           : (d > 0 ? 'IMPROVED' : 'DEGRADED')) };
};

const out = {
  label: opt.label || undefined,
  seeds, generations: gens, nSeeds: runs.length,
  settings: runs[0].meta.config, snapEvery: runs[0].meta.snapEvery,
  curves: { predatorCapability, preyVulnerability, preyForage, headToHead,
            preyContactSpread: preySpread, preyBestQuartile: preyBest, touchedFrac: touched },
  trends: Object.fromEntries(Object.entries(trends).map(([k, v]) => [k, { ...v, verdict: verdictOf(v) }])),
  endpoints: {
    predatorCapability: endpoints(predatorCapability, 'predator capability vs frozen prey'),
    preyVulnerability: endpoints(preyVulnerability, 'prey contact suffered from frozen predators', true),
    preyForage: endpoints(preyForage, 'prey foraging under threat'),
    headToHead: endpoints(headToHead, 'head-to-head (same generation)'),
  },
  byAgeGap, cycling,
};

if (opt.out) await fs.writeFile(opt.out, JSON.stringify(out, null, 2));

const f = (x, n = 4) => x.toFixed(n).padStart(n + 4);
console.log(`\npooled over ${runs.length} seeds: ${seeds.join(', ')}\n`);
console.log('  gen |  predCapability   |  preyVulnerability |   preyForage      |   headToHead');
console.log('      |  (rising = better)|  (FALLING = better)|                   |');
for (let i = 0; i < N; i++)
  console.log(`  ${String(gens[i]).padStart(3)} | ${f(predatorCapability[i].mean)} ± ${f(predatorCapability[i].se)} | ` +
    `${f(preyVulnerability[i].mean)} ± ${f(preyVulnerability[i].se)}  | ` +
    `${f(preyForage[i].mean)} ± ${f(preyForage[i].se)} | ${f(headToHead[i].mean)} ± ${f(headToHead[i].se)}`);

console.log('\n  endpoint tests (first vs last snapshot, 2x combined seed-level SE):');
for (const [k, e] of Object.entries(out.endpoints))
  console.log(`    ${e.label.padEnd(46)} ${f(e.first)} -> ${f(e.last)}  delta ${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(4)}  bar ${e.bar.toFixed(4)}  ${e.verdict}`);

console.log('\n  per-seed trend slopes (one observation per seed):');
for (const [k, t] of Object.entries(out.trends))
  console.log(`    ${k.padEnd(22)} ${t.mean.toExponential(2)} ± ${t.se.toExponential(2)}  ${t.verdict}`);

console.log('\n  age-gap profile (cycling diagnostic; rising = transitive progress):');
console.log('    gapGens | predator vs older prey | prey vs older predator');
for (const r of byAgeGap)
  console.log(`    ${String(r.generationsBack).padStart(7)} | ${f(r.predatorVsOlderPrey.mean)} ± ${f(r.predatorVsOlderPrey.se)}      | ${f(r.preyVsOlderPredator.mean)} ± ${f(r.preyVsOlderPredator.se)}`);
console.log(`\n    worst non-monotone drop, predator side: ${cycling.predator.worstDrop.toFixed(4)} (age gap ${cycling.predator.atAgeGap})`);
console.log(`    worst non-monotone drop, prey side:     ${cycling.prey.worstDrop.toFixed(4)} (age gap ${cycling.prey.atAgeGap})`);

console.log('\n  disengagement check (a saturated or collapsed gradient has nothing to select on):');
for (let i = 0; i < N; i++)
  console.log(`    gen ${String(gens[i]).padStart(3)}  prey contact sd ${f(preySpread[i].mean)}  best quartile ${f(preyBest[i].mean)}  touched ${f(touched[i].mean * 100, 1)}%`);
