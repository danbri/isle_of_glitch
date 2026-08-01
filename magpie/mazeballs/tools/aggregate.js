#!/usr/bin/env node
/**
 * Merge several `score.js --out` summaries for the SAME configuration into one,
 * and optionally compare two merged arms.
 *
 *   node tools/aggregate.js a1.json a2.json --label baseline --out base.json
 *   node tools/aggregate.js --compare base.json arm.json
 *
 * Why this exists: score.js runs its seeds inside one process, and on a shared
 * box with EVODEVO_WORKERS=1 an 8- or 16-seed arm takes longer than the harness
 * will let a single foreground command run. Splitting the seed list across
 * calls and merging afterwards is arithmetically identical — the score is a
 * mean over independent seeds either way — provided no seed is counted twice,
 * which this checks.
 *
 * It computes nothing new. The per-seed scores come from score.js unchanged;
 * this only pools them, with the same mean / sd / standard-error definitions
 * and the same `delta > 2 x combined se` bar.
 */
import fs from 'node:fs/promises';

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
const read = async f => JSON.parse(await fs.readFile(f, 'utf8'));

const stats = (vals) => {
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = vals.length > 1
    ? Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1)) : 0;
  return { mean: m, sd, se: vals.length > 1 ? sd / Math.sqrt(vals.length) : Infinity };
};

if (opt.compare) {
  const b = await read(opt.compare), a = await read(files[0]);
  const diff = a.score - b.score;
  const cse = Math.sqrt((a.se || 0) ** 2 + (b.se || 0) ** 2);
  const verdict = diff > 2 * cse ? 'IMPROVEMENT' : diff < -2 * cse ? 'REGRESSION' : 'NO SIGNIFICANT CHANGE';
  console.log(`${b.label || opt.compare} ${b.score.toFixed(4)} ± ${(b.se || 0).toFixed(4)} (n=${b.n})`);
  console.log(`${a.label || files[0]} ${a.score.toFixed(4)} ± ${(a.se || 0).toFixed(4)} (n=${a.n})`);
  console.log(`delta ${diff >= 0 ? '+' : ''}${diff.toFixed(4)}  (2×combined se = ${(2 * cse).toFixed(4)})  ⇒  ${verdict}`);
  process.exitCode = verdict === 'IMPROVEMENT' ? 0 : verdict === 'REGRESSION' ? 2 : 1;
} else {
  const parts = await Promise.all(files.map(read));
  const perSeed = parts.flatMap(p => p.perSeed);
  const seen = new Set();
  for (const s of perSeed) {
    if (seen.has(s.seed)) throw new Error(`seed ${s.seed} appears in more than one chunk`);
    seen.add(s.seed);
  }
  const n = perSeed.length;
  const S = stats(perSeed.map(s => s.score));
  const wavg = (get) => parts.reduce((a, p) => a + get(p) * p.n, 0) / parts.reduce((a, p) => a + p.n, 0);
  const keys = ['sensing', 'taxis', 'generalisation', 'selection', 'diversity'];
  const out = {
    label: opt.label || parts[0].label,
    score: +S.mean.toFixed(4), se: +S.se.toFixed(4), sd: +S.sd.toFixed(4), n,
    failed: parts.reduce((a, p) => a + (p.failed || 0), 0),
    settings: parts[0].settings,
    components: Object.fromEntries(keys.map(k => [k, +wavg(p => p.components[k]).toFixed(4)])),
    forage: +wavg(p => p.forage).toFixed(4),
    viability: +wavg(p => p.viability).toFixed(4),
    perSeed,
  };
  if (parts.every(p => p.drops)) out.drops = Object.fromEntries(
    ['noFood','noToxin','blindConst','noFoodDir','noFoodMass']
      .map(k => [k, +wavg(p => p.drops[k] ?? 0).toFixed(4)]));
  if (parts.every(p => p.odour)) out.odour = Object.fromEntries(
    ['ambiguity','stakes','toxDose','toxDoseTop','intake','intakeTop','toxRatio',
     'toxDoseTopIntake','toxRatioIntake','hazCost','hazCostTop','toxShare']
      .map(k => [k, +wavg(p => p.odour[k] ?? 0).toFixed(4)]));
  if (parts.every(p => p.central)) out.central = {
    nestShare: +wavg(p => p.central.nestShare).toFixed(4),
    visitedFrac: +wavg(p => p.central.visitedFrac).toFixed(4),
    nestTime: +wavg(p => p.central.nestTime).toFixed(4),
  };
  if (opt.out) await fs.writeFile(opt.out, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
