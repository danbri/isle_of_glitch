/**
 * Read an ascent-ladder results file and say whether the margin is decaying.
 *
 * Usage: deno run -A tools/ascent-report.js [results.jsonl]
 *
 * Works on a partial file, which is the point — the ladder writes each rung as
 * it completes and the run takes hours.
 *
 * THE ONE STATISTIC THAT MATTERS is the slope of the margin across rungs
 * measured against its own standard error. Three separate times in this project
 * a slope from ONE tournament per rung looked like a clean trend and was noise;
 * the spread on a single draw is about +/-0.15, which swamps any real decay.
 * A slope is only worth reporting next to how uncertain it is.
 */
const path = Deno.args[0] ?? '/tmp/longrun-results.jsonl';
const lines = (await Deno.readTextFile(path)).trim().split('\n').filter(Boolean);
const recs = lines.map(l => JSON.parse(l));

const checkpoints = recs.filter(r => r.kind === 'checkpoint');
const rungs = recs.filter(r => r.kind === 'rung');
const far = recs.find(r => r.kind === 'far');
const start = recs.find(r => r.kind === 'start');

if (start) console.log(`plan: ${start.ticks} ticks, checkpoint every ${start.every}, ${start.replicates} replicates/rung`);
console.log(`have: ${checkpoints.length} checkpoints, ${rungs.length} rungs measured\n`);

if (checkpoints.length) {
  const f = checkpoints[0], l = checkpoints[checkpoints.length - 1];
  console.log(`body size   ${f.meanSize} -> ${l.meanSize}`);
  console.log(`generation  ${f.generation} -> ${l.generation}`);
  console.log(`lineages    ${f.lineages} -> ${l.lineages}`);
  console.log(`population  ${f.alive} -> ${l.alive}, ${l.births} births\n`);
}

if (!rungs.length) Deno.exit(0);
console.log('  rung                 margin   SE');
for (const r of rungs) {
  const flag = r.mean - 2 * r.se > 0.5 ? '  above 0.5' : (r.mean + 2 * r.se < 0.5 ? '  BELOW 0.5' : '  ~tie');
  console.log(`  ${(r.from + '->' + r.to).padEnd(20)} ${r.mean.toFixed(3)}   ${r.se.toFixed(3)}${flag}`);
}

// Drop the first rung: founders adapt fast to a world they were dropped into,
// and that transient is not what the question is about.
const post = rungs.slice(1).map(r => r.mean);
if (post.length >= 3) {
  const n = post.length, mx = (n - 1) / 2;
  const my = post.reduce((s, v) => s + v, 0) / n;
  const sxx = post.reduce((s, _, i) => s + (i - mx) ** 2, 0);
  const slope = post.reduce((s, v, i) => s + (i - mx) * (v - my), 0) / sxx;
  const resid = post.map((v, i) => v - (my + slope * (i - mx)));
  const s2 = resid.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2);
  const seSlope = Math.sqrt(s2 / sxx);
  const seMean = Math.sqrt(post.reduce((s, v) => s + (v - my) ** 2, 0) / (n - 1) / n);

  console.log(`\npost-transient (${n} rungs, first dropped)`);
  console.log(`  mean margin  ${my.toFixed(3)} +/- ${seMean.toFixed(3)}   ` +
              `${((my - 0.5) / seMean).toFixed(1)} SE above 0.5`);
  console.log(`  slope        ${slope >= 0 ? '+' : ''}${slope.toFixed(4)} +/- ${seSlope.toFixed(4)} per rung`);
  const t = Math.abs(slope / seSlope);
  console.log(`  ${t > 2 ? `DECAYING (${t.toFixed(1)} SE from flat)` : `not distinguishable from flat (${t.toFixed(2)} SE)`}`);
  console.log(`  rungs above 0.5: ${post.filter(v => v > 0.5).length}/${n}`);
}
if (far) console.log(`\nlongest baseline ${far.from} vs ${far.to}: ` +
  `${far.descendantsA}:${far.descendantsB} descendants, shareB ${far.shareB}`);
