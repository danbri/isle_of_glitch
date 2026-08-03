#!/usr/bin/env node
/**
 * Pool sb-plastic runs across seeds and apply the project's 2·SE bar to the
 * decisive quantities: the quality-ablation Δ on net intake (is the sense
 * load-bearing), the within-life learning attribution (plastic − frozen), and the
 * frozen-selectivity assimilation ascent. Plastic vs non-plastic side by side.
 *
 *   node tools/sb-plastic-agg.js results/plastic/H3-plastic-s*.json
 *   node tools/sb-plastic-agg.js --tag "control" results/plastic/H3-control-s*.json
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
let tag = 'runs';
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tag') { tag = args[++i]; continue; }
  files.push(args[i]);
}
const runs = files.map(f => JSON.parse(readFileSync(f, 'utf8')));
const mean = v => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const se = v => { const m = mean(v), n = v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1) / n); };
const f = x => (x >= 0 ? '+' : '') + x.toFixed(4);
const g = x => x.toFixed(4);

function agg(vals) { const m = mean(vals), s = se(vals); return { m, s, bar: 2 * s }; }

const K = runs.length;
const plastic = runs[0].plastic;

// Decisive: quality-ablation Δ on net intake, per seed, pooled.
const qAbl = agg(runs.map(r => r.qualAblDrop));
// Selectivity of the evolved population (plastic remeasure).
const selEvo = agg(runs.map(r => r.plasticIntact.meanSelv));
const selQAbl = agg(runs.map(r => r.plasticQualAbl.meanSelv));
// Net intake evolved.
const netEvo = agg(runs.map(r => r.plasticIntact.meanNet));
// Assimilation: frozen selectivity, gen0 vs evolved, per-seed ascent pooled.
const frSelGen0 = agg(runs.map(r => r.gen0Frozen.meanSelv));
const frSelEvo = agg(runs.map(r => r.frozenIntact.meanSelv));
const frSelAscent = agg(runs.map(r => r.frozenIntact.meanSelv - r.gen0Frozen.meanSelv));
// Frozen quality ablation (developed-weight sense load-bearing).
const frQAbl = agg(runs.map(r => r.frozenIntact.meanNet - r.frozenQualAbl.meanNet));
// Degenerate census.
const squat = agg(runs.map(r => r.plasticIntact.squatterFrac));
const anos = agg(runs.map(r => r.plasticIntact.anosmiaFrac));
const netNeg = agg(runs.map(r => r.plasticIntact.netNegFrac));

console.log(`\n=== ${tag}: ${K} seeds, plastic=${plastic} ===`);
console.log(`  quality-ablation Δnet (DECISIVE, load-bearing if > bar):  ${f(qAbl.m)} ± ${g(qAbl.s)}  (2·SE bar ${g(qAbl.bar)})  -> ${qAbl.m > qAbl.bar ? 'LOAD-BEARING' : 'incidental'}`);
console.log(`  evolved selectivity (0.5 = indiscriminate):              ${g(selEvo.m)} ± ${g(selEvo.s)}   (qual-ablated ${g(selQAbl.m)})`);
console.log(`  evolved net intake (good − H·toxic − starve):            ${f(netEvo.m)} ± ${g(netEvo.s)}`);

if (plastic) {
  // Within-life learning attribution: per seed, (last−first) plastic − (last−first) frozen.
  const learn = agg(runs.map(r => {
    const c = r.curve, cf = r.curveFrozen;
    const dP = c[c.length - 1].selectivity - c[0].selectivity;
    const dF = cf[cf.length - 1].selectivity - cf[0].selectivity;
    return dP - dF;
  }));
  console.log(`  within-life learning attributable (plastic−frozen Δsel): ${f(learn.m)} ± ${g(learn.s)}  (2·SE bar ${g(learn.bar)})  -> ${learn.m > learn.bar ? 'REAL learning' : 'no robust within-life learning'}`);
  const etaS = agg(runs.map(r => r.plastEvolved.etaSens));
  const etaR = agg(runs.map(r => r.plastEvolved.etaRec));
  const etaS0 = agg(runs.map(r => r.plastGen0.etaSens));
  console.log(`  evolved etaSens ${g(etaS.m)} ± ${g(etaS.s)} (gen0 ${g(etaS0.m)}),  etaRec ${g(etaR.m)} ± ${g(etaR.s)}   [selection kept plasticity if ~unchanged, killed it if →0]`);
}

console.log(`  ASSIMILATION frozen selectivity: gen0 ${g(frSelGen0.m)} -> evolved ${g(frSelEvo.m)},  ascent ${f(frSelAscent.m)} ± ${g(frSelAscent.s)} (bar ${g(frSelAscent.bar)})  -> ${frSelAscent.m > frSelAscent.bar ? 'ASSIMILATED' : 'no assimilation'}`);
console.log(`  frozen quality-ablation Δnet: ${f(frQAbl.m)} ± ${g(frQAbl.s)} (bar ${g(frQAbl.bar)})  -> ${frQAbl.m > frQAbl.bar ? 'developed sense load-bearing' : 'developed sense inert'}`);
console.log(`  degenerate census: squatter ${(squat.m * 100).toFixed(0)}%  anosmia ${(anos.m * 100).toFixed(0)}%  net-negative ${(netNeg.m * 100).toFixed(0)}%`);
