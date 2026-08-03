#!/usr/bin/env node
/**
 * Run a batch of discrimination sb-evolve configs with bounded concurrency, all
 * inside ONE foreground process (child processes are awaited — nothing detaches).
 * Each config writes its own results/discrim/*.json and *.txt. Used to run the
 * H × operator × seed matrix across the 4 cores without background execution.
 *
 *   node tools/sb-discrim-batch.js --H 2,3,4 --ops gaussian,signflip --seeds 1,2,3 --conc 3
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { parseArgs } from './backend.js';

const a = parseArgs(process.argv.slice(2), {
  H: '3', ops: 'gaussian,signflip', seeds: '1,2,3', conc: 3,
  pop: 48, gens: 20, steps: 500, curriculum: 6, starve: 0.005, consume: 1.2,
  relocateThresh: 0.30, food: 42, clusters: 9, toxicFrac: 0.5, signRate: 0.02,
  outdir: 'results/discrim',
});
mkdirSync(a.outdir, { recursive: true });
const Hs = String(a.H).split(',');
const ops = String(a.ops).split(',');
const seeds = String(a.seeds).split(',').map(Number);

const jobs = [];
for (const H of Hs) for (const op of ops) for (const seed of seeds)
  jobs.push({ H, op, seed, tag: `H${H}-${op}-s${seed}` });

function run(job) {
  const out = `${a.outdir}/${job.tag}.json`;
  const args = [
    'tools/sb-evolve.js', '--pop', a.pop, '--gens', a.gens, '--steps', a.steps,
    '--seed', job.seed, '--fitness', 'netintake', '--curriculum', a.curriculum,
    '--toxicFrac', a.toxicFrac, '--toxinHarsh', job.H, '--starve', a.starve,
    '--consume', a.consume, '--relocateThresh', a.relocateThresh,
    '--food', a.food, '--clusters', a.clusters, '--op', job.op,
    ...(job.op === 'signflip' ? ['--signRate', a.signRate] : []),
    '--quiet', '--out', out,
  ].map(String);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn('node', args, { env: { ...process.env, EVODEVO_WORKERS: '1' }, stdio: ['ignore', 'ignore', 'ignore'] });
    p.on('exit', (code) => { console.log(`  done ${job.tag}  exit ${code}  ${((Date.now() - t0) / 1000).toFixed(0)}s`); resolve(); });
  });
}

console.log(`[batch] ${jobs.length} jobs, concurrency ${a.conc}`);
let idx = 0;
async function worker() { while (idx < jobs.length) { const j = jobs[idx++]; await run(j); } }
await Promise.all(Array.from({ length: Math.min(a.conc, jobs.length) }, worker));
console.log('[batch] complete');
