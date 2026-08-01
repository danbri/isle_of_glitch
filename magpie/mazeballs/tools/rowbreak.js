#!/usr/bin/env node
/**
 * How does a prey population's advantage depend on WHICH predator it faces?
 *
 * `tools/tournament-agg.js` reports the prey marginal, which averages a prey
 * generation over every archived predator generation. That average is the right
 * headline — it is the frozen-ancestor yardstick — but it hides the question
 * this tool answers: is the improvement a general lowering of the encounter
 * rate that any pursuer would suffer, or is it tuned to the pursuer it
 * coevolved with?
 *
 * The tournament matrix already contains the answer. Cell [i][j] is prey
 * generation j against predator generation i, so the column difference
 * `preyContact[i][0] - preyContact[i][last]` is the prey's improvement measured
 * against ONE predator generation, and reading it down the rows says whether
 * the improvement survives being pointed at an unevolved pursuer.
 *
 * Pooled across seeds with the seed as the unit of replication, and the project
 * bar of 2x the standard error of the paired difference.
 *
 *   node tools/rowbreak.js runs/t-tk2-s1.json runs/t-tk2-s2.json ... --label tk2
 */
import fs from 'node:fs/promises';
import { mean, sd } from '../lib/evodevo.js';

// Positional files plus flags, split the same way tools/tournament-agg.js does
// it — `parseArgs` swallows the following positional as a flag's value, which
// silently eats the first file name.
const raw = process.argv.slice(2);
const files = [], args = { label: '', out: '' };
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (!a.startsWith('--')) { files.push(a); continue; }
  const eq = a.indexOf('='); const k = eq === -1 ? a.slice(2) : a.slice(2, eq);
  let v = eq === -1 ? undefined : a.slice(eq + 1);
  if (v === undefined) { const n = raw[i + 1]; if (n !== undefined && !n.startsWith('--')) { v = n; i++; } }
  args[k] = v === undefined ? 'true' : v;
}
if (!files.length) { console.error('need tournament json files'); process.exit(2); }

const runs = [];
for (const f of files) runs.push(JSON.parse(await fs.readFile(f, 'utf8')));
const gens = runs[0].generations;
const N = gens.length;
const se = a => sd(a) / Math.sqrt(a.length);

const rows = [];
for (let i = 0; i < N; i++) {
  const first = runs.map(r => r.matrix[i][0].preyContact);
  const last = runs.map(r => r.matrix[i][N - 1].preyContact);
  const d = runs.map((_, k) => last[k] - first[k]);
  rows.push({ predGen: gens[i], preyFirst: mean(first), preyLast: mean(last),
              delta: mean(d), se: se(d), bar: 2 * se(d), sig: Math.abs(mean(d)) > 2 * se(d),
              perSeed: d });
}
const result = { label: args.label || undefined, files, generations: gens, rows };
if (args.out) await fs.writeFile(args.out, JSON.stringify(result, null, 1));
else process.stdout.write(JSON.stringify(result) + '\n');

console.error(`\n${args.label || files[0]} — prey improvement, broken down by the predator generation it is measured against`);
console.error(`  (${runs.length} seeds; prey generation ${gens[0]} vs ${gens[N - 1]}; negative = prey improved)\n`);
console.error('  predator gen | prey g0 contact | prey g32 contact |   delta ± SE      | bar    | verdict');
for (const r of rows)
  console.error(`  ${String(r.predGen).padStart(12)} | ${r.preyFirst.toFixed(4).padStart(15)} | ` +
    `${r.preyLast.toFixed(4).padStart(16)} | ${r.delta.toFixed(4).padStart(8)} ± ${r.se.toFixed(4)} | ` +
    `${r.bar.toFixed(4)} | ${r.sig ? (r.delta < 0 ? 'IMPROVED' : 'DEGRADED') : 'flat'}`);
