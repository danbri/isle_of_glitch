#!/usr/bin/env node
/**
 * Soft-body substrate, correctness probe. Grows N random genomes, prints what
 * development produced, runs one episode, prints what the bodies did, and
 * times a step. No claims are made here — this exists so that a broken solver
 * is caught before it becomes a repeatability number.
 *
 *   node tools/sb-probe.js --organisms 24 --steps 900 --seed 1
 */
import { parseArgs } from './backend.js';
import { DEFAULTS, makeRng, randomGenome, develop, makeWorld, Colony, episode }
  from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  // gain/devCycles default to the library's values rather than to literals.
  // They were hardcoded here, so this probe silently tested GAIN 0.5 whatever
  // DEFAULTS said, and reported no locomotion from a build that had it.
  organisms: 24, steps: 900, seed: 1, gain: DEFAULTS.GAIN, devCycles: DEFAULTS.DEV_CYCLES, ascii: false,
});

const cfg = { ...DEFAULTS, GAIN: a.gain, DEV_CYCLES: a.devCycles };
const rng = makeRng(a.seed);
const t0 = Date.now();
const phenos = [];
for (let i = 0; i < a.organisms; i++) {
  const gen = randomGenome(rng, cfg);
  // Development is deterministic given the genome: its RNG is seeded from the
  // genome index, not from the spawn. Same rule as the incumbent, where
  // develop() has no stochastic component at all.
  phenos.push(develop(gen, cfg, makeRng(0x51b0 ^ (i * 2654435761))));
}
const tDev = Date.now() - t0;

const num = k => phenos.map(p => p.stats[k]);
const stat = (v) => {
  const s = Array.from(v).sort((x, y) => x - y);
  const m = v.reduce((t, x) => t + x, 0) / v.length;
  return `mean ${m.toFixed(3)}  min ${s[0].toFixed(2)}  med ${s[s.length >> 1].toFixed(2)}  max ${s[s.length - 1].toFixed(2)}`;
};
console.log(`[develop] ${a.organisms} organisms in ${tDev} ms (${(tDev / a.organisms).toFixed(1)} ms each)`);
for (const k of ['cells', 'edges', 'muscles', 'sensors', 'extent'])
  console.log(`  ${k.padEnd(9)} ${stat(num(k))}`);

const world = makeWorld(cfg, makeRng(a.seed ^ 0x1234));
const col = new Colony(phenos, world, cfg);
col.spawn(makeRng(a.seed ^ 0xbeef));
const t1 = Date.now();
const tr = episode(col, a.steps);
const dt = Date.now() - t1;
console.log(`[episode] ${a.steps} steps in ${(dt / 1000).toFixed(2)} s  ` +
            `= ${(dt / a.steps).toFixed(2)} ms/step  ` +
            `(${(dt / a.steps / a.organisms * 1000).toFixed(1)} us/step/organism)`);
for (const k of ['displacement', 'path', 'speed', 'occupancy', 'intake'])
  console.log(`  ${k.padEnd(13)} ${stat(tr.map(t => t[k]))}`);

const moved = tr.filter(t => t.displacement > 0.02).length;
console.log(`[moving] ${moved}/${a.organisms} organisms displaced more than 0.02 world units`);

if (a.ascii) {
  // A body, drawn. Cheapest possible check that morphology is a shape and not
  // a blob or a line.
  const p = phenos.reduce((b, q) => q.stats.cells > b.stats.cells ? q : b);
  const W = 41, H = 21;
  const grid = Array.from({ length: H }, () => new Array(W).fill(' '));
  const s = Math.max(1e-6, p.stats.extent) * 1.15;
  for (let e = 0; e < p.nE; e++) {
    for (let t = 0; t <= 8; t++) {
      const f = t / 8;
      const X = p.x[p.ei[e]] * (1 - f) + p.x[p.ej[e]] * f;
      const Y = p.y[p.ei[e]] * (1 - f) + p.y[p.ej[e]] * f;
      const cx = Math.round((X / s * 0.5 + 0.5) * (W - 1));
      const cy = Math.round((0.5 - Y / s * 0.5) * (H - 1));
      if (cx >= 0 && cx < W && cy >= 0 && cy < H && grid[cy][cx] === ' ')
        grid[cy][cx] = p.kind[e] === 2 ? '~' : '.';
    }
  }
  for (let i = 0; i < p.n; i++) {
    const cx = Math.round((p.x[i] / s * 0.5 + 0.5) * (W - 1));
    const cy = Math.round((0.5 - p.y[i] / s * 0.5) * (H - 1));
    if (cx >= 0 && cx < W && cy >= 0 && cy < H) grid[cy][cx] = p.isSensor[i] ? 'S' : 'o';
  }
  console.log(`\n[body] largest of the sample: ${p.stats.cells} cells, ${p.stats.muscles} muscles ` +
              `(o cell, S sensor, ~ muscle edge, . passive edge)`);
  for (const row of grid) console.log('  ' + row.join(''));
}
