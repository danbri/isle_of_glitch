/**
 * Score a world configuration across seeds, against its own control.
 *
 *   deno run -A --unstable-webgpu tools/score-config.js --seeds 4 --steps 40000
 *   deno run -A --unstable-webgpu tools/score-config.js --patch '{"maxAge":100000}'
 *   deno run -A --unstable-webgpu tools/score-config.js --patch cfg.json --out results/x.json
 *
 * WHY THIS EXISTS. tools/score.js was the objective for the old stack: it forks
 * a TensorFlow.js runner that predates the WebGPU world and cannot score the
 * simulation this project now runs. Its scoring COMPOSITE is still the right
 * design and is worth porting; this is the multi-seed machinery underneath it.
 *
 * THE CONTROL IS NOT OPTIONAL. CLAUDE.md's fourth law says every score carries a
 * conserved control and that claims without one get retracted - five in one
 * night. So this never reports a bare number for a patched world. It runs the
 * SAME seeds unpatched, reports both with standard errors, and reports the
 * difference with the combined error. A patch that does not clear its own noise
 * is reported as "no effect", not as a small effect.
 *
 * WHY SEEDS AND NOT ONE LONG RUN. Spread across seeds at a fixed config has been
 * measured on this world at ten times the spread across parameter changes. One
 * run against one run is not a result, and this project has retracted claims
 * that were exactly that - including two of mine this week.
 *
 * WHAT IS SCORED. Deliberately several numbers rather than one scalar, because a
 * single fitness figure is what makes a population that squats on a patch look
 * successful. Diversity, body size, differentiation and shape are the
 * diagnostics that distinguish something capable from something lucky, and each
 * is reported on its own so a change that helps one and hurts another cannot
 * hide inside a sum.
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver } from '../lib/evolve.js';

const argStr = (k, d) => {
  const i = Deno.args.indexOf(`--${k}`);
  return i >= 0 ? Deno.args[i + 1] : d;
};
const argNum = (k, d) => {
  const v = argStr(k, null);
  return v === null ? d : Number(v);
};

const SEEDS = argNum('seeds', 4);
const STEPS = argNum('steps', 40000);
const BODIES = argNum('bodies', 300);
const SLOTS = argNum('slots', 900);
const OUT = argStr('out', null);

// The patch may be inline JSON or a file. Empty means "score the defaults",
// which is still worth doing: it is how the noise floor gets measured.
let patch = {};
const praw = argStr('patch', null);
if (praw) {
  try { patch = JSON.parse(praw); }
  catch { patch = JSON.parse(await Deno.readTextFile(praw)); }
}
const patched = Object.keys(patch).length > 0;

/** One world, run to STEPS, reduced to the handful of numbers worth comparing. */
async function runOne(seed, cfg) {
  const built = buildBodies({
    beasts: BODIES, cells: 12, bound: 66, maxCells: 60, bodySlots: SLOTS, seed,
  });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: 66 });
  // Physics parameters in the patch are applied to the world; the rest are
  // constructor options for the evolver. Splitting on which object owns the key
  // rather than on a hand-kept list, so a new parameter works without editing
  // this file.
  const evoOpts = { arena: built.arena, world, cells: built.cells, seed, ageSpread: 0.35 };
  const worldPatch = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (k in world.params) worldPatch[k] = v;
    else evoOpts[k] = v;
  }
  if (Object.keys(worldPatch).length) world.writeParams(worldPatch);
  const evo = new Evolver({ maxAge: 25000, ...evoOpts });

  let done = 0;
  while (done < STEPS) {
    const chunk = Math.min(500, STEPS - done);
    world.step(chunk);
    done += chunk;
    try { await evo.tick(done); } catch { /* a failed tick is not a failed run */ }
    // Eggs are laid by the pump, not by tick. Forgetting this made an earlier
    // sweep measure a world that never reproduced.
    try { evo.pump(done, 4); } catch { /* same */ }
  }

  const L = evo.lineageStats();
  const { pos, energy } = await world.readCells();
  // Body sizes and shape, from the arena rather than the wire, since this runs
  // headless with no server to ask.
  const A = built.arena, C = built.cells;
  const sizes = [];
  let mixed = 0, bodies = 0;
  for (let o = 0; o < A.P; o++) {
    if (!A.alive[o]) continue;
    const slots = A.slotsOf(o);
    let n = 0;
    const kinds = [0, 0, 0, 0];
    for (let i = 0; i < slots.length; i++) {
      const t = C.ctype[slots[i]];
      if (t >= 0 && t < 4) { kinds[t]++; n++; }
    }
    if (!n) continue;
    bodies++; sizes.push(n);
    if (kinds.filter((v) => v > 0).length >= 3) mixed++;
  }
  sizes.sort((a, b) => a - b);
  const med = sizes.length ? sizes[sizes.length >> 1] : 0;
  const p90 = sizes.length ? sizes[Math.floor(0.9 * (sizes.length - 1))] : 0;

  world.destroy?.(); brains.destroy?.();
  return {
    alive: evo.alive(),
    effective: L.effective,
    entropyBits: L.entropyBits,
    bodyMedian: med,
    bodyP90: p90,
    mixedFrac: bodies ? mixed / bodies : 0,
    births: evo.births,
    agedFrac: evo.deaths ? (evo.agedOut ?? 0) / evo.deaths : 0,
  };
}

const METRICS = ['effective', 'entropyBits', 'bodyMedian', 'bodyP90', 'mixedFrac', 'alive', 'births', 'agedFrac'];
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const se = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1) / a.length);
};

const seeds = Array.from({ length: SEEDS }, (_, i) => 1000 + i * 37);
console.log(`score-config: ${SEEDS} seeds x ${STEPS.toLocaleString()} steps` +
  (patched ? `, patch ${JSON.stringify(patch)}` : ', defaults (measuring the noise floor)'));

const control = [];
for (const s of seeds) control.push(await runOne(s, {}));
const treat = [];
if (patched) for (const s of seeds) treat.push(await runOne(s, patch));

console.log('');
console.log(patched
  ? 'metric          control            patched            difference'
  : 'metric          value              (spread across seeds IS the noise floor)');

const out = { steps: STEPS, seeds, patch, control: {}, treatment: {}, net: {} };
for (const k of METRICS) {
  const c = control.map((r) => r[k]);
  const cm = mean(c), cs = se(c);
  out.control[k] = { mean: +cm.toFixed(4), se: +cs.toFixed(4) };
  if (!patched) {
    console.log(`${k.padEnd(14)} ${cm.toFixed(3).padStart(9)} ± ${cs.toFixed(3)}`);
    continue;
  }
  const t = treat.map((r) => r[k]);
  const tm = mean(t), ts = se(t);
  const d = tm - cm, ds = Math.sqrt(cs * cs + ts * ts);
  out.treatment[k] = { mean: +tm.toFixed(4), se: +ts.toFixed(4) };
  out.net[k] = { diff: +d.toFixed(4), se: +ds.toFixed(4), clears: Math.abs(d) > 2 * ds };
  // "Clears" means two combined standard errors. Anything less is reported as
  // no effect rather than as a small one, which is the only honest reading when
  // the spread across seeds is this wide.
  const verdict = Math.abs(d) > 2 * ds ? (d > 0 ? 'UP' : 'DOWN') : 'no effect';
  console.log(`${k.padEnd(14)} ${cm.toFixed(3).padStart(9)} ± ${cs.toFixed(3)}` +
    `   ${tm.toFixed(3).padStart(9)} ± ${ts.toFixed(3)}` +
    `   ${(d >= 0 ? '+' : '') + d.toFixed(3)} ± ${ds.toFixed(3)}  ${verdict}`);
}

if (OUT) {
  await Deno.mkdir(OUT.replace(/\/[^/]*$/, ''), { recursive: true }).catch(() => {});
  await Deno.writeTextFile(OUT, JSON.stringify(out, null, 1));
  console.log(`\nwritten to ${OUT}`);
}
console.log('\nA difference that does not clear two combined standard errors is not a');
console.log('result, however much it looks like one. Raise --seeds before believing it.');
