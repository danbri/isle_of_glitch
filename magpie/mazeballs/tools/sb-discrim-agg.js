#!/usr/bin/env node
/**
 * Aggregate the discrimination sb-evolve runs across seeds, per (H, operator).
 * The decisive column is the QUALITY-sense ablation on NET intake: per seed,
 * delta = meanNet(intact) − meanNet(qual-ablated); across seeds, mean ± SE and
 * the project's 2·SE bar. Load-bearing iff mean delta > bar. Also reports the
 * degenerate census (squatter / anosmia / net-negative), selectivity intact vs
 * qual-ablated, and net-intake ascent — the calibration the sweep must show.
 *
 *   node tools/sb-discrim-agg.js results/discrim/*.json
 */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
const mean = v => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const se = v => { const m = mean(v), n = v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1) / n); };
const f = x => (x >= 0 ? '+' : '') + x.toFixed(4);
const f2 = x => x.toFixed(4);

// group by H + op
const groups = {};
for (const path of files) {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  if (!j.discrim) { console.error(`skip ${path}: not a discrimination run`); continue; }
  const key = `H${j.discrim.toxinHarsh}-${j.op}`;
  (groups[key] ||= { H: j.discrim.toxinHarsh, op: j.op, runs: [] }).runs.push(j);
}

const rows = Object.values(groups).sort((a, b) => (a.H - b.H) || a.op.localeCompare(b.op));
console.log('discrimination task: evolved-population aggregate across seeds (fitness netintake)\n');
console.log('  H  op        K  squat% anosm% netNeg%  selEvo   selQAbl   meanNet(evo)   netAscent      DECISIVE qualAbl Δnet ± SE (2·SE bar)   verdict');
for (const g of rows) {
  const K = g.runs.length;
  const squat = mean(g.runs.map(r => r.squatterEvolved)) * 100;
  const anos = mean(g.runs.map(r => r.anosmiaEvolved)) * 100;
  const nneg = mean(g.runs.map(r => r.netNegEvolved)) * 100;
  const selEvo = g.runs.map(r => r.meanSelvEvolved);
  const selQ = g.runs.map(r => r.qualAblated.meanSelv);
  const netEvo = g.runs.map(r => r.meanNetEvolved);
  const netGen0 = g.runs.map(r => r.meanNetGen0);
  const ascent = mean(netEvo) - mean(netGen0);
  // per-seed decisive delta = meanNet(intact) − meanNet(qual-ablated)
  const delta = g.runs.map(r => r.meanNetEvolved - r.qualAblated.meanNet);
  const dMean = mean(delta), dSE = se(delta), bar = 2 * dSE;
  const verdict = dMean > bar ? 'LOAD-BEARING' : 'incidental';
  console.log(
    `  ${String(g.H).padStart(2)}  ${g.op.padEnd(9)} ${K}   ` +
    `${squat.toFixed(0).padStart(4)}  ${anos.toFixed(0).padStart(4)}  ${nneg.toFixed(0).padStart(5)}   ` +
    `${f2(mean(selEvo))}   ${f2(mean(selQ))}   ${f(mean(netEvo))}      ${f(ascent)}       ` +
    `${f(dMean)} ± ${f2(dSE)} (${f2(bar)})   ${verdict}`);
}
console.log('\n  selEvo   = selectivity of the evolved population (0.5 = eats 50/50, no discrimination)');
console.log('  selQAbl  = selectivity with the quality channel ablated (should fall to ~0.5 IF the intact pop discriminated)');
console.log('  DECISIVE = does blinding the quality sense cost net intake? mean per-seed Δ > 2·SE bar => LOAD-BEARING (sensing evolved because it had to)');
