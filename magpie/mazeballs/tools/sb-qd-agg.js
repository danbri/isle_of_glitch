#!/usr/bin/env node
/**
 * Pool the QD comparison across seeds, per selection scheme. Reads
 * results/qd/<scheme>-s<seed>.json and prints, for each scheme: the decisive
 * quality-ablation delta on net intake (mean ± SE across seeds, with the 2·SE
 * bar), the population/archive selectivity, the degenerate census, and — the
 * second decisive quantity — whether the archive ever CONTAINED a genuine
 * discriminator (a body with high selectivity AND a load-bearing sense) even
 * when the mean did not.
 *
 *   node tools/sb-qd-agg.js --schemes tournament,novelty,mapelites --seeds 1,2,3,4
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from './backend.js';

const a = parseArgs(process.argv.slice(2), {
  schemes: 'tournament,novelty,mapelites', seeds: '1,2,3,4', dir: 'results/qd',
});
const schemes = String(a.schemes).split(',');
const seeds = String(a.seeds).split(',').map(Number);

const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const se = (v) => { const m = mean(v), n = v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1) / n); };
const f = (x, d = 4) => (x === undefined || x === null ? 'n/a' : x.toFixed(d));

console.log(`\n=== QD comparison on the discrimination task (pooled across seeds ${seeds.join(',')}) ===\n`);
console.log('scheme       n  qualAblΔnet ± SE (2·SE bar)   verdict        meanSelv     squat% anosm% netNeg%   archive: discrim/cells (maxSel, maxΔ)');

for (const scheme of schemes) {
  const runs = [];
  for (const seed of seeds) {
    try { runs.push(JSON.parse(readFileSync(`${a.dir}/${scheme}-s${seed}.json`, 'utf8'))); }
    catch { /* missing seed */ }
  }
  if (!runs.length) { console.log(`${scheme.padEnd(12)} 0  (no runs found)`); continue; }
  const qAbl = runs.map(r => r.qualAblDrop);
  const mq = mean(qAbl), sq = se(qAbl), bar = 2 * sq;
  const verdict = mq > bar ? 'LOAD-BEARING' : 'incidental';
  const selv = mean(runs.map(r => r.meanSelvEvolved));
  const squat = mean(runs.map(r => r.squatterEvolved)) * 100;
  const anosm = mean(runs.map(r => r.anosmiaEvolved)) * 100;
  const netNeg = mean(runs.map(r => r.netNegEvolved)) * 100;
  // Archive-reach: sum discriminating cells across seeds, and the best single
  // cell any seed reached (max selectivity, max quality-Δ). A QD archive that
  // contains a discriminator even in one seed is the partial win.
  const scans = runs.map(r => r.qdScan).filter(Boolean);
  const discrim = scans.reduce((s, x) => s + (x.discrimCount || 0), 0);
  const cells = scans.reduce((s, x) => s + (x.n || 0), 0);
  const maxSel = scans.length ? Math.max(...scans.map(x => x.maxSel || 0)) : null;
  const maxDelta = scans.length ? Math.max(...scans.map(x => x.maxDelta || 0)) : null;
  const arch = scans.length
    ? `${discrim}/${cells}  (maxSel ${f(maxSel, 3)}, maxΔ ${f(maxDelta, 3)})`
    : '(tournament: n/a)';
  console.log(
    `${scheme.padEnd(12)} ${String(runs.length).padStart(1)}  ` +
    `${(mq >= 0 ? '+' : '') + f(mq)} ± ${f(sq)} (${f(bar)})`.padEnd(30) +
    `${verdict.padEnd(14)} ${f(selv, 3).padStart(6)}      ` +
    `${squat.toFixed(0).padStart(3)}   ${anosm.toFixed(0).padStart(3)}   ${netNeg.toFixed(0).padStart(3)}     ${arch}`);
}
console.log('\nqualAblΔnet > 2·SE bar => blinding the quality sense costs net intake => the sense is LOAD-BEARING.');
console.log('archive discrim/cells: cells with selectivity ≥ 0.55 AND quality-Δnet ≥ 0.02 AND eating, pooled over seeds.');
console.log('chance selectivity = 0.5; below 0.5 = eats more toxic than good.');
