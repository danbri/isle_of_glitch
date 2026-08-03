#!/usr/bin/env node
/**
 * Aggregate the seed-a-gait foraging arms across seeds.
 *
 *   node tools/seedgait-agg.js results/seedgait/random-s*.json  (etc.)
 *
 * Each input is one sb-evolve run's --out JSON. The DECISIVE quantity is the
 * food-sense ablation delta on the EVOLVED population: intake(intact) −
 * intake(food-mean-ablated). Reported per ARM as the across-seed mean ± SE
 * against the project 2×-combined-SE bar, plus a paired-by-seed version (each
 * seed contributes one intact−ablated delta, since both come from the same
 * evolved population). A delta above the bar = the food sense is LOAD-BEARING.
 */
import { readFileSync } from 'node:fs';

const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const se = (v) => { const m = mean(v), n = v.length; return n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1) / n) : 0; };
const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(4);
const barOf = (s0, s1) => 2 * Math.sqrt(s0 ** 2 + s1 ** 2);

// Group files by arm name (basename before -s<digit>).
const files = process.argv.slice(2);
const arms = new Map();
for (const path of files) {
  const m = path.match(/([^/]+)-s\d+\.json$/);
  const arm = m ? m[1] : path;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  if (!arms.has(arm)) arms.set(arm, []);
  arms.get(arm).push({ path, j });
}

console.log('\n=== seed-a-gait foraging: food-sense ablation across seeds ===');
console.log(`task: food ${[...arms.values()][0][0].j.food.FOOD} in ${[...arms.values()][0][0].j.food.FOOD_CLUSTERS} clusters, ` +
  `span ${[...arms.values()][0][0].j.food.FOOD_CLUSTER_SPAN}, senseSigma2 ${[...arms.values()][0][0].j.food.FOOD_SENSE_SIGMA2}, ` +
  `relocateThresh ${[...arms.values()][0][0].j.food.FOOD_RELOCATE_THRESH}`);

const rows = [];
for (const [arm, runs] of arms) {
  const intact = runs.map(r => r.j.evolved.meanIntake);
  const ablated = runs.map(r => r.j.ablated.meanIntake);
  const paired = runs.map(r => r.j.evolved.meanIntake - r.j.ablated.meanIntake);
  const gen0 = runs.map(r => r.j.gen0.meanIntake);
  const dispE = runs.map(r => r.j.evolved.meanDisp);
  const dispA = runs.map(r => r.j.ablated.meanDisp);
  const iMean = mean(intact), iSE = se(intact);
  const aMean = mean(ablated), aSE = se(ablated);
  const delta = iMean - aMean, bar = barOf(iSE, aSE);
  const pMean = mean(paired), pSE = se(paired), pBar = 2 * pSE;
  rows.push({ arm, n: runs.length, iMean, iSE, aMean, aSE, delta, bar, pMean, pSE, pBar,
    gen0: mean(gen0), dispE: mean(dispE), dispA: mean(dispA),
    ascent: iMean - mean(gen0) });
}
// Print in a stable, readable order.
const order = ['random', 'seeded', 'staged'];
rows.sort((a, b) => (order.indexOf(a.arm) + 99 * (order.indexOf(a.arm) < 0)) - (order.indexOf(b.arm) + 99 * (order.indexOf(b.arm) < 0)));

for (const r of rows) {
  console.log(`\n--- ${r.arm.toUpperCase()}  (${r.n} seeds) ---`);
  console.log(`  gen-0 intake          ${r.gen0.toFixed(4)}`);
  console.log(`  evolved intake        intact ${r.iMean.toFixed(4)} ± ${r.iSE.toFixed(4)}   food-ablated ${r.aMean.toFixed(4)} ± ${r.aSE.toFixed(4)}`);
  console.log(`  displacement          intact ${r.dispE.toFixed(3)}   ablated ${r.dispA.toFixed(3)}   (locomotion should survive blinding)`);
  console.log(`  intake ascent (gen0->evolved intact): ${f(r.ascent)}`);
  console.log(`  ABLATION DELTA (intact − food-ablated):`);
  console.log(`    combined-SE:  ${f(r.delta)}  vs 2×-combined-SE bar ${r.bar.toFixed(4)}  -> ${r.delta > r.bar ? 'LOAD-BEARING' : 'incidental'}`);
  console.log(`    paired-by-seed: ${f(r.pMean)} ± ${r.pSE.toFixed(4)}  vs 2×SE bar ${r.pBar.toFixed(4)}  -> ${r.pMean > r.pBar ? 'LOAD-BEARING' : 'incidental'}`);
}
console.log('');
