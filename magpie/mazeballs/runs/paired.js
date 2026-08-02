#!/usr/bin/env node
/**
 * Paired intact-vs-blinded contrast on the tournament's prey marginal.
 *
 * Both files in a pair are phase-2 runs off the SAME archive with the SAME
 * world, spawns and frozen predators; only the prey's predator channels differ.
 * The per-seed difference is therefore a within-seed paired quantity, and the
 * statistic is its mean across seeds with a SEED-level standard error, against
 * this project's 2x-SE bar.
 *
 *   node runs/paired.js <label> <seed>...
 *
 * A NEGATIVE delta (intact minus blinded) means the prey suffer LESS contact
 * when they can see predators, i.e. the predator channel is causally reducing
 * contact. That is the signature of evasion.
 */
import fs from 'node:fs/promises';

const [label, ...seeds] = process.argv.slice(2);
const read = async f => JSON.parse(await fs.readFile(f, 'utf8'));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1));
};

const rows = [];
for (const s of seeds) {
  const intact = await read(`runs/t-${label}-s${s}.json`);
  const blind = await read(`runs/t-blind${label}-s${s}.json`);
  const last = c => c[c.length - 1].vsAll;
  const all = c => mean(c.map(r => r.vsAll));
  rows.push({
    seed: +s,
    intactLast: last(intact.preyVulnerability), blindLast: last(blind.preyVulnerability),
    deltaLast: last(intact.preyVulnerability) - last(blind.preyVulnerability),
    intactAll: all(intact.preyVulnerability), blindAll: all(blind.preyVulnerability),
    deltaAll: all(intact.preyVulnerability) - all(blind.preyVulnerability),
    forageIntact: last(intact.preyForageUnderThreat), forageBlind: last(blind.preyForageUnderThreat),
  });
}
const stat = k => {
  const v = rows.map(r => r[k]), m = mean(v), se = sd(v) / Math.sqrt(v.length);
  return { mean: m, se, verdict: Math.abs(m) > 2 * se ? (m < 0 ? 'EVASION' : 'ANTI') : 'FLAT' };
};
const dl = stat('deltaLast'), da = stat('deltaAll');
console.log(`\n${label}: intact vs predator-channel-blinded, ${rows.length} seeds`);
console.log('  seed |  intact  |  blinded |   delta  | forage intact/blind');
for (const r of rows)
  console.log(`  ${String(r.seed).padStart(4)} | ${r.intactLast.toFixed(4)} | ${r.blindLast.toFixed(4)} | ` +
    `${(r.deltaLast >= 0 ? '+' : '') + r.deltaLast.toFixed(4)} | ${r.forageIntact.toFixed(3)} / ${r.forageBlind.toFixed(3)}`);
console.log(`  final snapshot   delta ${dl.mean >= 0 ? '+' : ''}${dl.mean.toFixed(4)} +- ${dl.se.toFixed(4)}  ${dl.verdict}`);
console.log(`  all snapshots    delta ${da.mean >= 0 ? '+' : ''}${da.mean.toFixed(4)} +- ${da.se.toFixed(4)}  ${da.verdict}`);
