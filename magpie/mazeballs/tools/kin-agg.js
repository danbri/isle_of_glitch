#!/usr/bin/env node
/**
 * Pool `tools/kinematics.js` runs across SEEDS and apply the project bar.
 *
 * WHY THIS IS A SEPARATE TOOL. A kinematics run reports 192 agents from one
 * population, and the standard error across those agents is not the standard
 * error of the arm: agents inside one evolved population are close relatives
 * evaluated in one world, and `tools/policy.js` understated the across-seed
 * spread by 3.7-4.9x by making exactly that substitution (see RESEARCH.md).
 * So the unit of replication here is the SEED. Each seed contributes one
 * number per metric -- its population mean -- and every contrast is a paired
 * difference over seeds, tested against 2x the standard error of that paired
 * difference.
 *
 * Pairing is available because the arms share seeds by construction: the same
 * `--seed` gives both arms the same generation-0 genomes, the same world, and
 * the same spawn positions, so the difference between two arms at one seed is
 * the search rule and nothing else.
 *
 * The distributional report is separate from the tested one. Quantiles are
 * pooled over every agent of every seed and are there to show the SHAPE of the
 * change -- a shift of the whole distribution and a change in the size of one
 * tail are different mechanisms and have the same mean.
 *
 *   node tools/kin-agg.js --tag b --seeds 1,2,3,4 --arms gen0,base,tk2 --ref gen0
 */
import fs from 'node:fs/promises';
import { parseArgs } from './backend.js';
import { mean, sd } from '../lib/evodevo.js';

const args = parseArgs(process.argv.slice(2), {
  dir: 'runs', tag: 'b', seeds: '1,2,3,4', arms: 'gen0,base,tk2', ref: 'gen0',
  // Metrics whose per-agent distribution has a heavy tail from near-stationary
  // animals; summarised by the median rather than the mean.
  medianOf: 'tortuosity',
  out: '', quiet: false,
});
const log = (...m) => { if (!args.quiet) console.error(...m); };
const seeds = args.seeds.split(',').map(Number);
const arms = args.arms.split(',');
const medianOf = new Set(args.medianOf.split(',').filter(Boolean));

const median = a => { const s = Array.from(a).filter(Number.isFinite).sort((x, y) => x - y);
  const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const finite = a => Array.from(a).filter(Number.isFinite);
const centre = (k, v) => (medianOf.has(k) ? median(v) : mean(finite(v)));
const q = (a, p) => { const s = finite(a).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const se = a => sd(a) / Math.sqrt(a.length);

/* ------------------------------------------------------------------ load */

const runs = {};                       // runs[arm][seed] = parsed file
for (const a of arms) {
  runs[a] = {};
  for (const s of seeds) {
    const p = `${args.dir}/kin-${a}-${args.tag}-s${s}.json`;
    runs[a][s] = JSON.parse(await fs.readFile(p, 'utf8'));
  }
}
const metrics = Object.keys(runs[arms[0]][seeds[0]].agents);

/* --------------------------------------------------- per-seed populations */

// perSeed[arm][metric] = [one population centre per seed]
// pooled[arm][metric]  = every agent of every seed, for the distribution
const perSeed = {}, pooled = {};
for (const a of arms) {
  perSeed[a] = {}; pooled[a] = {};
  for (const m of metrics) {
    perSeed[a][m] = seeds.map(s => centre(m, runs[a][s].agents[m]));
    pooled[a][m] = seeds.flatMap(s => finite(runs[a][s].agents[m]));
  }
  // Population-level statistics carried alongside, one number per seed each.
  for (const k of ['spread', 'meanPairDist']) {
    perSeed[a][k] = seeds.map(s => runs[a][s].population[k]);
    pooled[a][k] = perSeed[a][k];
  }
  for (const k of ['entropy', 'occupied']) {
    perSeed[a][k] = seeds.map(s => runs[a][s].occupancy[k]);
    pooled[a][k] = perSeed[a][k];
  }
  // The joint term. `overlap` is the prey/predator occupancy overlap against an
  // independent-uniform baseline of 1; `predChebyshev`/`predWallFrac` are the
  // predators' own geometry, which must be constant across arms for the overlap
  // comparison to mean anything and is reported so that can be checked.
  for (const k of ['overlap', 'chebyshev', 'wallFrac', 'entropy']) {
    const kk = 'pred' + k[0].toUpperCase() + k.slice(1);
    perSeed[a][kk] = seeds.map(s => runs[a][s].predator?.[k]).filter(x => x !== undefined);
    if (perSeed[a][kk].length !== seeds.length) delete perSeed[a][kk];
    else pooled[a][kk] = perSeed[a][kk];
  }
}
const allMetrics = Object.keys(perSeed[arms[0]]);

/* ------------------------------------------------------------- contrasts */

/** Paired difference over seeds, against 2x the SE of the paired difference —
 *  the same bar the tournament aggregator applies. */
const contrast = (a, b, m) => {
  const d = seeds.map((_, i) => perSeed[a][m][i] - perSeed[b][m][i]);
  const s = se(d), md = mean(d);
  return { delta: md, se: s, bar: 2 * s, sig: Math.abs(md) > 2 * s,
           perSeed: d, dir: md > 0 ? '+' : '-' };
};

const table = {};
for (const m of allMetrics) {
  table[m] = { arms: {}, vsRef: {} };
  for (const a of arms) table[m].arms[a] = {
    mean: mean(perSeed[a][m]), se: se(perSeed[a][m]), perSeed: perSeed[a][m],
    p05: q(pooled[a][m], 0.05), p25: q(pooled[a][m], 0.25), p50: q(pooled[a][m], 0.50),
    p75: q(pooled[a][m], 0.75), p95: q(pooled[a][m], 0.95),
    agentSd: sd(pooled[a][m]),
  };
  for (const a of arms) if (a !== args.ref) table[m].vsRef[a] = contrast(a, args.ref, m);
  // Every ordered pair, so "tk2 vs base" is available without re-running.
  table[m].pairs = {};
  for (const a of arms) for (const b of arms) if (a !== b) table[m].pairs[`${a}-${b}`] = contrast(a, b, m);
}

/* ------------------------------------ the crux: distance from the ancestor */

/**
 * "Weak selection left the population near unevolved kinematics" and "an
 * encounter-rate strategy evolved" make opposite predictions about ONE number:
 * how far each evolved arm sits from generation 0 in kinematic space.
 *
 * Standardised in units of the generation-0 BETWEEN-AGENT standard deviation,
 * which is the natural scale of the trait in the founding population, and
 * computed per seed so it inherits seed-level statistics. `d` is the mean over
 * metrics of |arm - gen0| / sd_gen0; `dSigned` keeps the sign so the direction
 * of each shift stays visible.
 */
const KIN = ['speed', 'absTurnCmd', 'absHeadingRate', 'straightness', 'pathLength',
             'gyration', 'cellsVisited', 'radius', 'chebyshev', 'wallFrac',
             'cornerFrac', 'thrust', 'speedSd', 'absTurnCmdBias'];
const distance = {};
if (arms.includes(args.ref)) {
  for (const a of arms) if (a !== args.ref) {
    const per = seeds.map((s, i) => {
      let acc = 0, n = 0;
      for (const m of KIN) {
        const s0 = sd(finite(runs[args.ref][s].agents[m]));
        if (!(s0 > 1e-9)) continue;
        acc += Math.abs(perSeed[a][m][i] - perSeed[args.ref][m][i]) / s0; n++;
      }
      return acc / n;
    });
    distance[a] = { d: mean(per), se: se(per), perSeed: per,
      byMetric: Object.fromEntries(KIN.map(m => {
        const z = seeds.map((s, i) => (perSeed[a][m][i] - perSeed[args.ref][m][i]) /
                                      (sd(finite(runs[args.ref][s].agents[m])) || NaN));
        return [m, { z: mean(z), se: se(z) }];
      })) };
  }
  const others = arms.filter(a => a !== args.ref);
  if (others.length === 2) {
    const d = seeds.map((_, i) => distance[others[0]].perSeed[i] - distance[others[1]].perSeed[i]);
    distance.contrast = { arms: others, delta: mean(d), se: se(d), bar: 2 * se(d),
                          sig: Math.abs(mean(d)) > 2 * se(d), perSeed: d };
  }
}

/* ------------------------- which kinematic variable predicts avoided contact */

/**
 * Within-population Pearson correlation between an agent's contact and each of
 * its trajectory statistics, computed SEPARATELY IN EACH SEED and then pooled
 * across seeds. The correlation itself is a within-population quantity and its
 * within-population standard error is exactly the thing this project retracted
 * a result over, so it is never reported from one population: the number below
 * is a mean over four independent seeds with the seed-level SE, and a sign that
 * does not hold in all four seeds is not a finding.
 */
const corr = (x, y) => {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 1e-12 && syy > 1e-12 ? sxy / Math.sqrt(sxx * syy) : 0;
};
const contactCorr = {};
for (const a of arms) {
  contactCorr[a] = {};
  for (const m of metrics) {
    if (m === 'contact') continue;
    const per = seeds.map(s => {
      const xs = [], ys = [];
      const A = runs[a][s].agents;
      for (let i = 0; i < A.contact.length; i++)
        if (Number.isFinite(A[m][i])) { xs.push(A[m][i]); ys.push(A.contact[i]); }
      return xs.length > 8 ? corr(xs, ys) : NaN;
    });
    const v = per.filter(Number.isFinite);
    contactCorr[a][m] = { r: mean(v), se: se(v), perSeed: per,
                          allSameSign: v.length === seeds.length && (v.every(x => x > 0) || v.every(x => x < 0)) };
  }
}

const result = { tag: args.tag, seeds, arms, ref: args.ref, table, distance, contactCorr };
if (args.out) { await fs.writeFile(args.out, JSON.stringify(result, null, 1)); log(`[out] ${args.out}`); }
else process.stdout.write(JSON.stringify(result) + '\n');

/* ---------------------------------------------------------------- report */

const f = (x, w = 9, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a').padStart(w);
log(`\npooled over ${seeds.length} seeds: ${seeds.join(', ')}   tag=${args.tag}   ref=${args.ref}`);
log('\n  metric              ' + arms.map(a => (a + ' (±SE)').padStart(19)).join('') +
    arms.filter(a => a !== args.ref).map(a => `   ${a}-${args.ref}`.padStart(22)).join(''));
for (const m of allMetrics) {
  let row = `  ${m.padEnd(20)}`;
  for (const a of arms) row += `${f(table[m].arms[a].mean)} ±${f(table[m].arms[a].se, 7, 4)}  `;
  for (const a of arms) if (a !== args.ref) {
    const c = table[m].vsRef[a];
    row += `${f(c.delta)} ${c.sig ? '*' : ' '} bar ${f(c.bar, 7)} `;
  }
  log(row);
}
log('\n  tk2 vs base (paired over seeds, * = clears 2x SE):');
if (arms.includes('tk2') && arms.includes('base'))
  for (const m of allMetrics) {
    const c = table[m].pairs['tk2-base'];
    log(`  ${m.padEnd(20)}${f(c.delta)} ± ${f(c.se, 7)}  ${c.sig ? '*' : ' '}`);
  }
log('\n  pooled agent distribution (p05 / p25 / p50 / p75 / p95):');
for (const m of allMetrics) {
  let row = `  ${m.padEnd(20)}`;
  for (const a of arms) {
    const t = table[m].arms[a];
    row += `${a}: ${f(t.p05, 7)}${f(t.p25, 8)}${f(t.p50, 8)}${f(t.p75, 8)}${f(t.p95, 8)}   `;
  }
  log(row);
}
log('\n  within-population correlation with contact, pooled over seeds (+ = all four seeds agree in sign):');
for (const m of ['speed', 'pathLength', 'absHeadingRate', 'straightness', 'gyration', 'cellsVisited',
                 'radius', 'chebyshev', 'wallFrac', 'cornerFrac', 'oppMass', 'minFoodDist', 'forage']) {
  let row = `  ${m.padEnd(20)}`;
  for (const a of arms) { const c = contactCorr[a][m]; row += `${a}: ${f(c.r, 8)} ±${f(c.se, 6)}${c.allSameSign ? ' +' : '  '}  `; }
  log(row);
}
if (distance.contrast) {
  log(`\n  kinematic distance from ${args.ref}, in generation-0 between-agent SDs:`);
  for (const a of arms) if (a !== args.ref)
    log(`    ${a.padEnd(6)} d = ${f(distance[a].d)} ± ${f(distance[a].se, 7)}   per-seed ${distance[a].perSeed.map(x => x.toFixed(3)).join(' ')}`);
  const c = distance.contrast;
  log(`    ${c.arms[0]} - ${c.arms[1]} = ${f(c.delta)} ± ${f(c.se, 7)}  bar ${f(c.bar, 7)}  ` +
      `${c.sig ? (c.delta > 0 ? `${c.arms[0]} IS FURTHER FROM ${args.ref}` : `${c.arms[1]} IS FURTHER FROM ${args.ref}`) : 'NO SIGNIFICANT DIFFERENCE'}`);
  log(`\n  per-metric z from ${args.ref} (generation-0 SD units):`);
  for (const m of KIN) {
    let row = `  ${m.padEnd(20)}`;
    for (const a of arms) if (a !== args.ref) row += `${a}: ${f(distance[a].byMetric[m].z, 8)} ± ${f(distance[a].byMetric[m].se, 6)}   `;
    log(row);
  }
}
