#!/usr/bin/env node
/**
 * Aggregate the sense-range × food-sparsity foraging sweep into a dose-response.
 *
 *   node tools/senserange-agg.js results/senserange
 *
 * Each input JSON is one `sb-evolve --fitness netintake` run (a powered
 * regime: a movement cost crossed with relocating food, so intake is heritable
 * and the food-sense ablation has signal to act on). The decisive per-run
 * number is `netAblDrop` — the drop in NET intake when the food sense is
 * mean-replaced on the evolved population — the same blind-vs-intact instrument
 * the whole project reads. This tool pools it across seeds within each
 * (sparsity, sense-range) cell and prints the ablation delta as a dose-response
 * over sense range (√FOOD_SENSE_SIGMA2, the effective sensing radius) and food
 * sparsity, with an across-seed standard error and the project's 2·SE bar. It
 * also carries the diagnostics that catch the known degenerate optima: the
 * squatter fraction (sit-still revival) and the intake repeatability (heritable
 * feeding, which can be high while the sense is still inert — trust the
 * ablation, not the repeatability).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'results/senserange';
const files = readdirSync(dir).filter(f => f.endsWith('.json'));
const runs = files.map(f => ({ f, j: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));

const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
// Sample standard error of the mean across seeds.
const se = v => { const m = mean(v), n = v.length; return n < 2 ? NaN : Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1) / n); };
const f4 = x => (x >= 0 ? '+' : '') + x.toFixed(4);

// Group by (FOOD count = sparsity, FOOD_SENSE_SIGMA2 = range).
const cells = new Map();
for (const { j } of runs) {
  const key = `${j.food.FOOD}|${j.food.FOOD_CLUSTERS}|${j.food.FOOD_SENSE_SIGMA2}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(j);
}

const rows = [];
for (const [key, js] of cells) {
  const [FOOD, CL, SIG] = key.split('|').map(Number);
  const drop = js.map(j => j.netAblDrop);          // per-seed ablation delta on net intake
  const seeds = js.map(j => j.seed).sort((a, b) => a - b);
  rows.push({
    FOOD, CL, sigma: SIG, radius: Math.sqrt(SIG), K: js.length, seeds,
    dropMean: mean(drop), dropSE: se(drop),
    meanNet: mean(js.map(j => j.evolved.meanNet)),
    netGain: mean(js.map(j => j.netGain)),
    Rintake: mean(js.map(j => j.evolved.R.intake)),
    squat: mean(js.map(j => j.squatterEvolved)),
    disp: mean(js.map(j => j.evolved.meanDisp)),
    forage: mean(js.map(j => j.evolved.forageFrac)),
  });
}
// Sparsity descending (sparse first), then range ascending.
rows.sort((a, b) => a.FOOD - b.FOOD || a.sigma - b.sigma);

const label = r => `${r.FOOD}f/${r.CL}c`;
console.log(`\nsense-range × sparsity dose-response  (arena ~1.88 across; radius = sqrt(FOOD_SENSE_SIGMA2))`);
console.log(`decisive column: ablation Δnet = NET intake lost when the food sense is mean-replaced on the evolved pop`);
console.log(`load-bearing iff Δnet > 2·SE(Δnet) across seeds (and materially above the ~0.005 floor)\n`);
console.log(`  sparsity  sigma2  radius  K   squat%  R(intake)  meanNet   netGain   ablation Δnet ± SE   (2·SE bar)  verdict`);
for (const r of rows) {
  const bar = 2 * r.dropSE;
  const lb = r.dropMean > bar && r.dropMean > 0.005;
  console.log(
    `  ${label(r).padEnd(8)}  ${r.sigma.toFixed(2).padStart(5)}  ${r.radius.toFixed(3)}  ${r.K}  ` +
    `${(r.squat * 100).toFixed(0).padStart(5)}%  ${r.Rintake.toFixed(3).padStart(7)}   ${r.meanNet.toFixed(4)}   ${f4(r.netGain)}   ` +
    `${f4(r.dropMean)} ± ${r.dropSE.toFixed(4)}   (${bar.toFixed(4)})  ${lb ? 'LOAD-BEARING' : 'incidental'}`);
}
console.log('');
