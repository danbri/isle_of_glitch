#!/usr/bin/env node
/**
 * Pool several `tools/policy.js --out` files for the SAME configuration across
 * SEEDS, and optionally compare two pooled arms.
 *
 *   node tools/policy-agg.js p1.json p2.json ... --label baseline --out base.json
 *   node tools/policy-agg.js --compare base.json arm.json
 *
 * Why this exists, and it is not a convenience. `policy.js` reports each
 * statistic with a standard error computed ACROSS AGENTS WITHIN ONE EVOLVED
 * POPULATION. Agents in a converged population share ancestry, a world layout
 * and a seed, so that number is the uncertainty on the mean of one population's
 * agents — not the uncertainty on a claim about what this configuration
 * evolves. Everywhere else this project treats the SEED as the unit of
 * replication, for the measured reason that seed spread is ten times parameter
 * spread here.
 *
 * The gap is not small. Measured on the klinokinesis turn delta over 8 seeds in
 * four configurations, the median within-population SE was 0.0094-0.0110 while
 * the across-seed SD was 0.0403-0.0476: the within-population figure understates
 * the real spread by 3.7x to 4.6x. A two-seed contrast reported at "6.8 SE" and
 * "5.7 SE" against "1.9 SE" and "1.2 SE" therefore said much less than it
 * appeared to, and at 8 seeds that contrast is flat.
 *
 * So: never report a policy contrast from within-population SEs. Run the seeds,
 * pool them here, and read the across-seed bar.
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

const stats = vals => {
  const n = vals.length;
  const m = vals.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
  return { mean: +m.toFixed(5), sd: +sd.toFixed(5), se: n > 1 ? +(sd / Math.sqrt(n)).toFixed(5) : Infinity, n };
};

// The scalar statistics worth pooling, as paths into a policy.js result.
const METRICS = {
  turnDelta: r => r.klinokinesis?.turnDelta?.mean,
  thrustDelta: r => r.klinokinesis?.thrustDelta?.mean,
  turnDeltaTrueFood: r => r.klinokinesisTrueFood?.turnDelta?.mean,
  occupancyDelta: r => r.pairedOutcomes?.occupancyDelta?.mean,
  eatDelta: r => r.pairedOutcomes?.eatDelta?.mean,
  proximityDelta: r => r.pairedOutcomes?.proximityDelta?.mean,
  predProximityDelta: r => r.opponentOutcome?.predProximityDelta?.mean,
};

if (opt.compare) {
  const b = await read(opt.compare), a = await read(files[0]);
  console.log(`${b.label || opt.compare}  vs  ${a.label || files[0]}`);
  console.log('metric\tbaseline\tarm\tdelta\tbar(2xcse)\tverdict');
  for (const k of Object.keys(METRICS)) {
    const B = b.metrics[k], A = a.metrics[k];
    if (!B || !A || !isFinite(B.se) || !isFinite(A.se)) continue;
    const d = A.mean - B.mean, bar = 2 * Math.hypot(A.se, B.se);
    const verdict = Math.abs(d) > bar ? (d > 0 ? 'MOVED UP' : 'MOVED DOWN') : 'NO SIGNIFICANT CHANGE';
    console.log(`${k}\t${B.mean.toFixed(4)} ± ${B.se.toFixed(4)}\t${A.mean.toFixed(4)} ± ${A.se.toFixed(4)}\t` +
      `${d >= 0 ? '+' : ''}${d.toFixed(4)}\t${bar.toFixed(4)}\t${verdict}`);
  }
} else {
  const parts = await Promise.all(files.map(read));
  const seen = new Set();
  for (const p of parts) {
    const s = p.settings?.seed;
    if (s !== undefined) {
      if (seen.has(s)) throw new Error(`seed ${s} appears in more than one file`);
      seen.add(s);
    }
  }
  const metrics = {}, perSeed = [];
  for (const [k, get] of Object.entries(METRICS)) {
    const vals = parts.map(get).filter(v => typeof v === 'number' && isFinite(v));
    if (vals.length) metrics[k] = stats(vals);
  }
  for (const p of parts) {
    const row = { seed: p.settings?.seed };
    for (const [k, get] of Object.entries(METRICS)) {
      const v = get(p); if (typeof v === 'number' && isFinite(v)) row[k] = +v.toFixed(5);
    }
    // Carried so the understatement can be re-checked rather than taken on trust.
    row.withinPopSE = p.klinokinesis?.turnDelta?.se;
    row.signAgrees = undefined;
    perSeed.push(row);
  }
  const td = perSeed.map(r => r.turnDelta).filter(v => v !== undefined);
  const out = {
    label: opt.label || parts[0].label,
    n: parts.length,
    settings: parts[0].settings,
    metrics,
    // The blunt check the project actually relies on: do the seeds agree on a
    // sign at all? A statistic that is many within-population SEs from zero on
    // each of two seeds and splits 4/4 on eight is noise.
    turnDeltaNegativeSeeds: td.filter(v => v < 0).length,
    turnDeltaSeeds: td.length,
    withinPopSEUnderstatement: metrics.turnDelta && perSeed.length > 1
      ? +(metrics.turnDelta.sd / median(perSeed.map(r => r.withinPopSE).filter(Boolean))).toFixed(2)
      : null,
    perSeed,
  };
  if (opt.out) await fs.writeFile(opt.out, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

function median(a) {
  const s = Array.from(a).sort((x, y) => x - y);
  if (!s.length) return NaN;
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
