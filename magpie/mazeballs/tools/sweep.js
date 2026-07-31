#!/usr/bin/env node
/**
 * Runs a grid of configurations as parallel child processes and tabulates them.
 *
 *   node tools/sweep.js --gain 0.3,0.5,1.0,2.0 --seed 1,2,3 --generations 20 --workers 5
 *   node tools/sweep.js --mutation 0.05,0.1,0.2 --consume 0.2,0.4 --generations 15
 *
 * Any --key with a comma-separated value becomes a swept axis; everything else
 * is passed through to run.js unchanged. Each cell is a separate process, so a
 * crash or an OOM in one config cannot take the sweep down with it.
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, 'run.js');

const SWEEPABLE = ['gain', 'mutation', 'seed', 'generations', 'consume', 'regrow', 'elites', 'pop', 'epoch', 'steps', 'restarts'];

const raw = process.argv.slice(2);
const opts = {}; const passthrough = [];
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
  let val = eq === -1 ? undefined : a.slice(eq + 1);
  if (val === undefined) { const n = raw[i + 1]; if (n !== undefined && !n.startsWith('--')) { val = n; i++; } }
  opts[key] = val === undefined ? 'true' : val;
}

const workers = Number(opts.workers || Math.max(1, Math.min(5, os.cpus().length - 1)));
const outFile = opts.out || '';
delete opts.workers; delete opts.out;

// Build the grid from every comma-containing sweepable option.
const axes = [];
for (const [k, v] of Object.entries(opts)) {
  if (SWEEPABLE.includes(k) && String(v).includes(',')) axes.push([k, String(v).split(',').map(s => s.trim())]);
  else passthrough.push(`--${k}`, String(v));
}
if (!axes.length) { console.error('Nothing to sweep. Give at least one comma-separated axis, e.g. --gain 0.5,1.0,2.0'); process.exit(1); }

let grid = [{}];
for (const [k, vals] of axes) grid = grid.flatMap(c => vals.map(v => ({ ...c, [k]: v })));

const label = c => Object.entries(c).map(([k, v]) => `${k}=${v}`).join(' ');
console.error(`[sweep] ${grid.length} cells over ${axes.map(a => a[0]).join(' × ')}, ${workers} workers`);

const results = []; let started = 0, finished = 0;
const startedAt = Date.now();

function runCell(cell) {
  return new Promise(resolve => {
    const argv = [...passthrough, '--quiet', '--label', label(cell)];
    for (const [k, v] of Object.entries(cell)) argv.push(`--${k}`, v);
    const child = fork(RUN, argv, { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      finished++;
      if (code !== 0) {
        console.error(`[${finished}/${grid.length}] FAILED  ${label(cell)}\n${err.trim().split('\n').slice(-3).join('\n')}`);
        return resolve({ cell, error: err.trim().split('\n').slice(-1)[0] || `exit ${code}` });
      }
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* fall through */ }
      if (!parsed) {
        console.error(`[${finished}/${grid.length}] UNPARSEABLE  ${label(cell)}`);
        return resolve({ cell, error: 'could not parse child output' });
      }
      const r = parsed.report, base = r.table.find(x => x.key === 'baseline');
      console.error(`[${finished}/${grid.length}] ${label(cell).padEnd(28)} top25 ${base.top.toFixed(3)}  railed ${(r.network.saturation * 100).toFixed(1)}%  blindΔ ${(r.drops.blind * -100).toFixed(1)}%`);
      resolve({ cell, result: parsed });
    });
  });
}

// Simple worker pool: keep `workers` children alive until the grid is drained.
async function pool() {
  const queue = grid.slice();
  const runners = Array.from({ length: Math.min(workers, queue.length) }, async () => {
    while (queue.length) { started++; results.push(await runCell(queue.shift())); }
  });
  await Promise.all(runners);
}
await pool();

const ok = results.filter(r => r.result);
console.error(`\n[sweep] ${ok.length}/${grid.length} succeeded in ${((Date.now() - startedAt) / 1000).toFixed(0)}s\n`);

if (ok.length) {
  const cols = axes.map(a => a[0]);
  const head = [...cols.map(c => c.padEnd(9)), 'top25'.padStart(8), 'popMean'.padStart(8), 'railed'.padStart(7),
                'blindΔ'.padStart(8), 'lesionΔ'.padStart(8), 'novelΔ'.padStart(8), 'founders'.padStart(9), 'sig'.padStart(4)].join(' ');
  console.log(head);
  console.log('-'.repeat(head.length));
  const rows = ok.map(({ cell, result }) => {
    const r = result.report, b = r.table.find(x => x.key === 'baseline');
    return {
      cell, top: b.top,
      line: [...cols.map(c => String(cell[c]).padEnd(9)),
        b.top.toFixed(3).padStart(8), b.pop.toFixed(3).padStart(8),
        ((r.network.saturation * 100).toFixed(1) + '%').padStart(7),
        ((r.drops.blind * -100).toFixed(1) + '%').padStart(8),
        ((r.drops.lesion * -100).toFixed(1) + '%').padStart(8),
        ((r.drops.novel * -100).toFixed(1) + '%').padStart(8),
        String(r.population.founders).padStart(9),
        (r.interpretable ? 'yes' : 'NO').padStart(4)].join(' '),
    };
  });
  rows.sort((a, b) => b.top - a.top);
  for (const r of rows) console.log(r.line);
  console.log('\nΔ columns are the change in top-quartile fitness when that condition is applied.');
  console.log('sig=NO means baseline fitness is below the interpretability floor — ignore that row.');
}

if (outFile) { await fs.writeFile(outFile, JSON.stringify(results, null, 2)); console.error(`[out] ${outFile}`); }
