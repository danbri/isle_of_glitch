#!/usr/bin/env node
/**
 * Run the exploration-vs-fitness comparison on the DISCRIMINATION task with
 * bounded concurrency, all inside ONE foreground process (children are awaited —
 * nothing detaches). One sb-evolve run per (select scheme × seed), each writing
 * results/qd/<scheme>-s<seed>.json. The canonical discrimination regime matches
 * sb-discrim-batch (pop 48, gens 20, steps 500, curriculum 6, starve 0.005,
 * consume 1.2, relocateThresh 0.30, food 42, clusters 9, toxicFrac 0.5, H=3) so
 * the tournament arm re-measures the six-experiments baseline on this worktree
 * HEAD and novelty / mapelites are compared against it with only the selection
 * scheme changed.
 *
 *   node tools/sb-qd-batch.js --schemes tournament,novelty,mapelites --seeds 1,2,3,4 --conc 2
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { parseArgs } from './backend.js';

const a = parseArgs(process.argv.slice(2), {
  schemes: 'tournament,novelty,mapelites', seeds: '1,2,3,4', conc: 2,
  pop: 48, gens: 20, steps: 500, curriculum: 6, starve: 0.005, consume: 1.2,
  relocateThresh: 0.30, food: 42, clusters: 9, toxicFrac: 0.5, H: 3, spawns: 2,
  noveltyK: 15, noveltyW: 1.0, bdBins: 5, evals: 6,
  outdir: 'results/qd',
});
mkdirSync(a.outdir, { recursive: true });
const schemes = String(a.schemes).split(',');
const seeds = String(a.seeds).split(',').map(Number);

const jobs = [];
for (const s of schemes) for (const seed of seeds) jobs.push({ scheme: s, seed, tag: `${s}-s${seed}` });

function run(job) {
  const out = `${a.outdir}/${job.tag}.json`;
  const args = [
    'tools/sb-evolve.js', '--pop', a.pop, '--gens', a.gens, '--steps', a.steps,
    '--seed', job.seed, '--fitness', 'netintake', '--curriculum', a.curriculum,
    '--toxicFrac', a.toxicFrac, '--toxinHarsh', a.H, '--starve', a.starve,
    '--consume', a.consume, '--relocateThresh', a.relocateThresh,
    '--food', a.food, '--clusters', a.clusters, '--spawns', a.spawns,
    '--select', job.scheme, '--evals', a.evals,
    ...(job.scheme === 'novelty' ? ['--noveltyK', a.noveltyK, '--noveltyW', a.noveltyW] : []),
    ...(job.scheme === 'mapelites' ? ['--bdBins', a.bdBins] : []),
    '--quiet', '--out', out,
  ].map(String);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn('node', args, { env: { ...process.env, EVODEVO_WORKERS: '1' }, stdio: ['ignore', 'ignore', 'ignore'] });
    p.on('exit', (code) => { console.log(`  done ${job.tag}  exit ${code}  ${((Date.now() - t0) / 1000).toFixed(0)}s`); resolve(); });
  });
}

console.log(`[qd-batch] ${jobs.length} jobs (${schemes.join(',')} x seeds ${seeds.join(',')}), concurrency ${a.conc}, H ${a.H}`);
let idx = 0;
async function worker() { while (idx < jobs.length) { const j = jobs[idx++]; await run(j); } }
await Promise.all(Array.from({ length: Math.min(a.conc, jobs.length) }, worker));
console.log('[qd-batch] complete');
