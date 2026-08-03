#!/usr/bin/env node
/**
 * Aggregate sb-op.js run JSONs into an operator comparison.
 *
 *   node tools/sb-op-agg.js results/op/*.json
 *
 * Groups runs by operator label (op + signRate/moduleRate where they vary),
 * pools across seeds, and reports:
 *   - evolved displacement mean ± SE across seeds (unpaired)
 *   - the ascent curve: median-displacement per generation, mean across seeds
 *   - generations-to-threshold: first gen the per-seed median crosses a fixed
 *     displacement (default 0.30), mean across seeds
 *   - PAIRED-by-seed delta against the gaussian baseline: mean Δ ± SE(Δ), and
 *     whether |Δ| clears 2·SE(Δ). Pairing removes the dominant seed-spread
 *     variance because every operator shares the byte-identical gen-0 population
 *     and evaluation seeds at a given seed.
 */
import { readFileSync } from 'node:fs';

const THRESH = 0.30;
const files = process.argv.slice(2).filter(f => f.endsWith('.json'));
if (!files.length) { console.error('usage: sb-op-agg.js results/op/*.json'); process.exit(2); }

const label = (r) => {
  if (r.op === 'signflip' || r.op === 'signonly') return `${r.op}@${r.signRate}`;
  if (r.op === 'permodule') return `${r.op}@${r.moduleRate}`;
  return r.op;
};

const runs = files.map(f => { const r = JSON.parse(readFileSync(f, 'utf8')); r._f = f; return r; });
const groups = new Map();
for (const r of runs) {
  const L = label(r);
  if (!groups.has(L)) groups.set(L, []);
  groups.get(L).push(r);
}

const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
const se = v => { const m = mean(v), n = v.length; return n < 2 ? 0 : Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1) / n); };
const f = x => (x >= 0 ? ' ' : '') + x.toFixed(4);

// generations-to-threshold from a trajectory's per-gen median
const gensTo = (traj, thr) => { for (const row of traj) if (row.median >= thr) return row.gen; return NaN; };

// evolved displacement per seed, keyed by seed, per group
const bySeed = new Map();   // label -> Map(seed -> evolved displacement)
for (const [L, rs] of groups) {
  const m = new Map();
  for (const r of rs) m.set(r.seed, r.evolved.meanDisp);
  bySeed.set(L, m);
}

console.log(`\n=== operator comparison  (${runs.length} runs, ${groups.size} operators) ===\n`);
console.log('operator          n   evolved disp     gen0 disp     gens->0.30   moving%');
const order = ['gaussian', 'magonly', 'signflip@0.01', 'signflip@0.02', 'signflip@0.04',
               'signonly@0.01', 'signonly@0.02', 'signonly@0.04', 'blockcross', 'permodule@0.5'];
const labels = [...groups.keys()].sort((x, y) => {
  const ix = order.indexOf(x), iy = order.indexOf(y);
  return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
});
for (const L of labels) {
  const rs = groups.get(L);
  const ev = rs.map(r => r.evolved.meanDisp);
  const g0 = rs.map(r => r.gen0.meanDisp);
  const gt = rs.map(r => gensTo(r.traj, THRESH)).filter(x => !Number.isNaN(x));
  const mv = rs.map(r => r.evolved.moveFrac);
  console.log(`${L.padEnd(16)} ${String(rs.length).padStart(2)}   ${f(mean(ev))} ± ${se(ev).toFixed(4)}   ${f(mean(g0))}        ${gt.length ? mean(gt).toFixed(1).padStart(4) : ' n/a'}        ${(mean(mv) * 100).toFixed(0)}`);
}

// Ascent curves: per-gen median, mean across seeds
console.log('\n--- ascent curve: median displacement, mean across seeds, by generation ---');
const maxGen = Math.max(...runs.map(r => r.traj[r.traj.length - 1].gen));
const gcols = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].filter(g => g <= maxGen);
process.stdout.write('operator         ' + gcols.map(g => ('g' + g).padStart(7)).join('') + '\n');
for (const L of labels) {
  const rs = groups.get(L);
  const cells = gcols.map(g => {
    const vals = rs.map(r => { const row = r.traj.find(t => t.gen === g); return row ? row.median : null; }).filter(v => v != null);
    return vals.length ? mean(vals).toFixed(3).padStart(7) : '   -   ';
  });
  console.log(L.padEnd(16) + ' ' + cells.join(''));
}

// Paired vs gaussian
const base = bySeed.get('gaussian');
if (base) {
  console.log('\n--- PAIRED vs gaussian (per-seed Δ = op − gaussian on evolved displacement) ---');
  console.log('operator          n   mean Δ      SE(Δ)    2·SE     verdict');
  for (const L of labels) {
    if (L === 'gaussian') continue;
    const m = bySeed.get(L);
    const seeds = [...m.keys()].filter(s => base.has(s));
    if (!seeds.length) continue;
    const d = seeds.map(s => m.get(s) - base.get(s));
    const md = mean(d), sd = se(d), bar = 2 * sd;
    const verdict = Math.abs(md) <= bar ? 'no sig. difference'
      : (md > 0 ? 'BEATS gaussian' : 'WORSE than gaussian');
    console.log(`${L.padEnd(16)} ${String(seeds.length).padStart(2)}   ${f(md)}   ${sd.toFixed(4)}   ${bar.toFixed(4)}   ${verdict}  [${d.map(x => x.toFixed(2)).join(', ')}]`);
  }
}
