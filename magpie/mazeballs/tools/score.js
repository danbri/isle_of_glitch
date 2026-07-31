#!/usr/bin/env node
/**
 * The objective for autoresearch-style experiments on this simulation.
 *
 *   node tools/score.js --seeds 1,2,3,4 --generations 12
 *   node tools/score.js --seeds 1,2,3,4 --compare baseline.json
 *
 * Why not fitness: a 24-cell sweep on this code measured spread-across-seeds of
 * 0.250 against spread-across-parameters of 0.026. Optimising a single-run
 * fitness number here is optimising noise. So every score is the mean over K
 * independent seeds and carries a standard error, and --compare refuses to call
 * a change an improvement unless it clears the combined noise.
 *
 * Why this composite: the question is not "does it score highly" but "has
 * anything capable evolved". A population that squats on a patch scores well on
 * fitness and badly here. The terms are the diagnostics that distinguish real
 * capability from luck, and they are gated by viability so that a dead
 * population cannot win by having no measurable anything.
 */
import fs from 'node:fs/promises';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, 'run.js');

const raw = process.argv.slice(2);
const opt = {};
for (let i = 0; i < raw.length; i++) {
  const a = raw[i]; if (!a.startsWith('--')) continue;
  const eq = a.indexOf('='); const k = eq === -1 ? a.slice(2) : a.slice(2, eq);
  let v = eq === -1 ? undefined : a.slice(eq + 1);
  if (v === undefined) { const n = raw[i + 1]; if (n !== undefined && !n.startsWith('--')) { v = n; i++; } }
  opt[k] = v === undefined ? 'true' : v;
}
const seeds = String(opt.seeds || '1,2,3,4').split(',').map(s => Number(s.trim()));
const generations = Number(opt.generations || 12);
const steps = Number(opt.steps || 400);
const restarts = Number(opt.restarts || 2);
// Default to leaving a core free, and cap by seed count. When several research
// agents share one box each of them should ask for a slice, not the whole
// machine — EVODEVO_WORKERS lets a fleet launcher set that centrally.
const workers = Number(opt.workers || process.env.EVODEVO_WORKERS ||
  Math.max(1, Math.min(seeds.length, os.cpus().length - 1)));
const passthrough = [];
for (const [k, v] of Object.entries(opt))
  if (!['seeds','generations','steps','restarts','workers','compare','out','label','quiet'].includes(k))
    passthrough.push(`--${k}`, v);

const clamp01 = x => Math.max(0, Math.min(1, x));

/**
 * Components, each in [0,1]:
 *   sensing        fraction of top-quartile fitness lost when every sense is
 *                  scrambled. The single most informative number available: a
 *                  railed or open-loop population loses nothing.
 *   taxis          steering-to-bearing correlation in excess of the empirical
 *                  null measured under the scrambled condition.
 *   generalisation holding up on a field layout never selected on.
 *   selection      elites beating the population median when re-evaluated from
 *                  fresh spawns, in sd — i.e. selection tracking genotype.
 *   diversity      distinct ancestries holding a *selected* slot, so an
 *                  immigration scheme cannot saturate it by construction.
 * Gated by viability so a population that forages nothing scores nothing.
 */
export function scoreReport(r) {
  const base = r.table.find(t => t.key === 'baseline');
  const nullR = r.taxisNull ? Math.abs(r.taxisNull.food) : 0;
  const obsR = r.taxis ? Math.abs(r.taxis.food) : 0;
  const c = {
    sensing: clamp01(r.drops.blind),
    taxis: clamp01((obsR - nullR) / 0.30),
    generalisation: clamp01(1 - Math.max(0, r.drops.novel)),
    selection: clamp01((r.eliteAdvantage ?? 0) / 2),
    // eliteFounders, not founders. `founders` counts distinct ancestries anywhere
    // in the population, which any immigration scheme saturates by construction:
    // inject N fresh random genomes per generation and the count can never fall
    // below N, whether or not those lineages are any good. eliteFounders counts
    // an ancestry only if it holds a selected slot, so it measures diversity the
    // evolutionary process actually sustained rather than randomness poured in.
    diversity: clamp01(r.population.eliteFounders / 10),
  };
  const capability = 0.40 * c.sensing + 0.20 * c.taxis + 0.15 * c.generalisation
                   + 0.15 * c.selection + 0.10 * c.diversity;
  const viability = clamp01(base.top / 1.0);
  return { score: viability * capability, capability, viability, forage: base.top, components: c };
}

function runSeed(seed) {
  return new Promise(resolve => {
    const argv = [...passthrough, '--quiet', '--seed', String(seed),
      '--generations', String(generations), '--steps', String(steps), '--restarts', String(restarts)];
    const child = fork(RUN, argv, { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      if (code !== 0) return resolve({ seed, error: err.trim().split('\n').slice(-1)[0] || `exit ${code}` });
      try { resolve({ seed, ...scoreReport(JSON.parse(out).report) }); }
      catch (e) { resolve({ seed, error: 'unparseable child output' }); }
    });
  });
}

const results = [];
const queue = seeds.slice();
await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
  while (queue.length) results.push(await runSeed(queue.shift()));
}));

const ok = results.filter(r => !r.error);
if (!ok.length) {
  console.error('all seeds failed:\n  ' + results.map(r => `seed ${r.seed}: ${r.error}`).join('\n  '));
  process.exit(1);
}
const vals = ok.map(r => r.score);
const m = vals.reduce((a, b) => a + b, 0) / vals.length;
const sdv = vals.length > 1
  ? Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1)) : 0;
const se = vals.length > 1 ? sdv / Math.sqrt(vals.length) : Infinity;
const avg = k => ok.reduce((a, r) => a + r.components[k], 0) / ok.length;

const summary = {
  label: opt.label || undefined,
  score: +m.toFixed(4), se: +se.toFixed(4), sd: +sdv.toFixed(4), n: ok.length,
  failed: results.length - ok.length,
  settings: { seeds, generations, steps, restarts },
  components: Object.fromEntries(['sensing','taxis','generalisation','selection','diversity'].map(k => [k, +avg(k).toFixed(4)])),
  forage: +(ok.reduce((a, r) => a + r.forage, 0) / ok.length).toFixed(4),
  viability: +(ok.reduce((a, r) => a + r.viability, 0) / ok.length).toFixed(4),
  perSeed: ok.map(r => ({ seed: r.seed, score: +r.score.toFixed(4), forage: +r.forage.toFixed(3) })),
};

if (opt.out) await fs.writeFile(opt.out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

if (opt.compare) {
  const b = JSON.parse(await fs.readFile(opt.compare, 'utf8'));
  const diff = summary.score - b.score;
  // Combined standard error of two independent means. A change has to clear
  // twice this to count — the whole reason this harness exists.
  const cse = Math.sqrt(summary.se ** 2 + (b.se || 0) ** 2);
  const verdict = diff > 2 * cse ? 'IMPROVEMENT' : diff < -2 * cse ? 'REGRESSION' : 'NO SIGNIFICANT CHANGE';
  console.error(`\nbaseline ${b.score.toFixed(4)} ± ${(b.se||0).toFixed(4)}  →  ${summary.score.toFixed(4)} ± ${summary.se.toFixed(4)}`);
  console.error(`delta ${diff >= 0 ? '+' : ''}${diff.toFixed(4)}  (2×combined se = ${(2*cse).toFixed(4)})  ⇒  ${verdict}`);
  process.exitCode = verdict === 'IMPROVEMENT' ? 0 : verdict === 'REGRESSION' ? 2 : 1;
}
