/**
 * Does the world select for locomotion?
 *
 * Run: deno run -A tools/locomotion-assay.js [--ticks 4000] [--every 200]
 *
 * The world is run normally — nothing here rewards movement — and periodically
 * the living genomes are lifted out and measured in a SEPARATE, still world:
 * each body alone, far from any other, no flow, no food, nothing born or dying.
 * Whatever it does there it did by itself.
 *
 * WHY THE ASSAY IS SEPARATE. Measuring displacement in the live world is
 * worthless, and this project already published a retraction for doing it: bodies
 * drift on the current, get shoved by neighbours, and — when something is wrong —
 * fall apart and scatter, which moves a centre of mass beautifully while nothing
 * swims. The control that caught it was muscles-off, and it is built in here as a
 * paired measurement rather than something to remember to run.
 *
 * WHAT WOULD COUNT. Locomotion is selected if median self-propulsion in the
 * assay rises across generations while the muscles-off control stays at zero.
 * A rise in both is dismemberment. A rise in neither is no result. The
 * null is not "zero movement" — it is "the same movement the founders had".
 *
 * FIRST RESULT, and it is negative. Over 100 ticks the measurement and the
 * control both sit at 0.064, identical to three decimals in median AND p90 —
 * which is not a coincidence, it is the population having converged onto a
 * single genome, so all 96 sampled bodies are the same body. That genome moves
 * a little and moves exactly as much with its muscles disabled, so it is not
 * swimming.
 *
 * Two things to fix before this instrument can answer its question: the sample
 * needs to span lineages rather than take the first 96 living slots, and a
 * converged population has nothing to measure anyway. Recorded here rather than
 * quietly retuned, because "the assay reported no locomotion" and "the assay was
 * pointed at 96 copies of one animal" are very different statements.
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver } from '../lib/evolve.js';
import { develop, bond, morphology, largestPiece } from '../lib/devo.js';

const args = (() => {
  const a = { ticks: 4000, every: 200, beasts: 900, spf: 250, bound: 70, seed: 11,
              maxCells: 60, out: 'runs/locomotion.jsonl' };
  for (let i = 0; i < Deno.args.length; i += 2) {
    const k = Deno.args[i].replace(/^--/, '');
    const v = Deno.args[i + 1];
    a[k] = isNaN(+v) ? v : +v;
  }
  return a;
})();

/**
 * Self-propulsion of a set of genomes, and the muscles-off control.
 *
 * Bodies sit on a lattice with several body-lengths of empty space around each,
 * so a body that never touches another cannot be pushed by one.
 */
async function selfPropulsion(genomes, contract) {
  const n = genomes.length;
  if (!n) return { median: 0, p90: 0, n: 0 };
  const side = Math.ceil(Math.sqrt(n));
  // Generous, and it matters. At 14 units the control (muscles off) tracked the
  // measurement almost exactly and both climbed together, because bodies expand
  // over a run — see RESEARCH.md, unexplained — until neighbours touch and shove
  // each other. A body is ~6 units across; 48 leaves seven body-lengths of empty
  // space, and the control then reads a clean zero.
  const gap = 48;
  const bound = Math.max(60, side * gap / 2);

  const built = buildBodies({ beasts: n + 8, cells: 12, bound, seed: 5, maxCells: args.maxCells });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, {
    bound, flowStr: 0, drag: 0, nMotes: 0, ...(contract === 0 ? { contract: 0 } : {}),
  });
  const evo = new Evolver({
    arena: built.arena, world, cells: built.cells, seed: 2,
    birthEnergy: 1e9, deathEnergy: -1e9, maxCells: args.maxCells, devo: true,
  });
  for (let o = 1; o < n + 8; o++) evo.cull(o);
  evo.lastEnergy = new Float32Array(built.arena.P).fill(45);

  const born = [];
  for (let k = 0; k < n; k++) {
    evo.genome[0] = genomes[k];
    evo.lastEnergy[0] = 45;
    const gx = -bound + gap * (0.5 + (k % side));
    const gy = -bound + gap * (0.5 + Math.floor(k / side));
    // mutRate 0: the assay must measure the genome it was given, not a mutant.
    const saved = evo.mutRate; evo.mutRate = 0;
    const c = evo.divide(0, gx, gy, 0);
    evo.mutRate = saved;
    if (c >= 0) born.push(c);
  }
  evo.cull(0);

  const A = built.arena;
  const centres = async () => {
    const f = await world.readPositions();
    const m = new Map();
    for (const o of born) {
      if (!A.alive[o]) continue;
      let sx = 0, sy = 0;
      const cnt = A.cnt[o], off = A.off[o];
      for (let i = 0; i < cnt; i++) { sx += f.x[off + i]; sy += f.y[off + i]; }
      m.set(o, [sx / cnt, sy / cnt]);
    }
    return m;
  };

  world.step(2000);                                 // let the body settle first
  const a = await centres();
  world.step(20000);
  const b = await centres();

  const d = [];
  for (const [o, p] of a) {
    const q = b.get(o);
    if (!q) continue;
    let dx = q[0] - p[0], dy = q[1] - p[1];
    if (dx > bound) dx -= 2 * bound; if (dx < -bound) dx += 2 * bound;
    if (dy > bound) dy -= 2 * bound; if (dy < -bound) dy += 2 * bound;
    const v = Math.hypot(dx, dy);
    // A body that has come apart is not locomoting; drop it rather than let it
    // dominate a median. Its cells scatter to arbitrary distance.
    if (Number.isFinite(v) && v < bound * 0.5) d.push(v);
  }
  world.destroy(); brains.destroy();
  d.sort((x, y) => x - y);
  return {
    median: d.length ? d[d.length >> 1] : 0,
    p90: d.length ? d[Math.floor(d.length * 0.9)] : 0,
    n: d.length,
  };
}

// ---------------------------------------------------------------- the world
const built = buildBodies({
  beasts: args.beasts, cells: 12, bound: args.bound, seed: args.seed, maxCells: args.maxCells,
});
const brains = await BrainArenaGPU.create(built.arena);
const world = new WorldGPU(brains, built.cells, {
  bound: args.bound, driftX: 0.06, driftY: 0.037, morphRate: 0.0075,
});
const evo = new Evolver({
  arena: built.arena, world, cells: built.cells, seed: 3,
  birthEnergy: 16, deathEnergy: 0, maxCells: args.maxCells, devo: true,
});
for (let o = Math.floor(args.beasts / 3); o < args.beasts; o++) evo.cull(o);

await Deno.mkdir('runs', { recursive: true }).catch(() => {});
const out = await Deno.open(args.out, { write: true, create: true, append: true });
const enc = new TextEncoder();
const log = async (rec) => { await out.write(enc.encode(JSON.stringify(rec) + '\n')); };

const sample = (k) => {
  const A = built.arena, g = [];
  for (let o = 0; o < A.P && g.length < k; o++) if (A.alive[o] && evo.genome[o]) g.push(evo.genome[o]);
  return g;
};

console.log('tick   alive  gen  cells  symmetry  segments   swim(median/p90)   control(median/p90)');
for (let t = 0; t <= args.ticks; t++) {
  world.step(args.spf);
  await evo.tick(t * args.spf);

  if (t % args.every === 0) {
    const gs = sample(96);
    const A = built.arena;
    let sym = 0, seg = 0, cells = 0, m = 0;
    for (const g of gs) {
      const d = develop(g);
      const w = largestPiece(d.cells, bond(d.cells));
      const mo = morphology(w.cells, w.bonds);
      if (!mo.n) continue;
      sym += mo.symmetry; seg += mo.segments; cells += mo.n; m++;
    }
    const swim = await selfPropulsion(gs, undefined);
    const ctrl = await selfPropulsion(gs, 0);
    const rec = {
      tick: t, step: t * args.spf, alive: evo.alive(), gen: evo.maxGeneration(),
      lineages: evo.lineages ? evo.lineages() : null,
      meanCells: m ? cells / m : 0, symmetry: m ? sym / m : 0, segments: m ? seg / m : 0,
      swimMedian: swim.median, swimP90: swim.p90,
      ctrlMedian: ctrl.median, ctrlP90: ctrl.p90, sampled: swim.n,
    };
    await log(rec);
    console.log(
      `${String(t).padStart(5)} ${String(rec.alive).padStart(6)} ${String(rec.gen).padStart(4)} ` +
      `${rec.meanCells.toFixed(1).padStart(6)} ${rec.symmetry.toFixed(2).padStart(9)} ` +
      `${rec.segments.toFixed(1).padStart(9)}   ${rec.swimMedian.toFixed(3)}/${rec.swimP90.toFixed(3)}` +
      `        ${rec.ctrlMedian.toFixed(3)}/${rec.ctrlP90.toFixed(3)}`);
  }
}
world.destroy(); brains.destroy(); out.close();
