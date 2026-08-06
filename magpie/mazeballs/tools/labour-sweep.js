/**
 * WHAT PRICE DIVISION OF LABOUR?
 *
 * The population monocultures whatever the economy pays for: it was 59.7%
 * anchor while tidal income was subsidising grip, and 73% muscle within 17,000
 * steps of that subsidy being removed. Bodies carrying both a sensor and a
 * muscle — the minimum parts for a sensorimotor loop — sit at 3.9%.
 *
 * The suspected cause is that CONTRACTION IS PAID TWICE. It moves the body, and
 * it is also the effort a cell brings to taking energy from another, since the
 * attack capability in contest is the attacker's own contraction. Nothing else
 * has two uses: a sensor costs senseCost and returns nothing directly, a neuron
 * is pure brainTax. A body of pure muscle is then the correct answer, and
 * evolution keeps finding it.
 *
 * The lawful counterweight already exists and is not a role rule:
 * absorbTradeoff makes force capacity crowd out UPTAKE, so a cell specialised
 * for producing force is not also specialised for feeding. It is currently 0.4;
 * the note beside it says 0.7 buys genuine four-way differentiation and the
 * world could not carry it. The world has since gained geography, a fertile
 * shore, tidal income and a proximity-range biotic channel, so "could not carry
 * it" is a claim about a world that no longer exists.
 *
 * TWO THINGS MEASURED TOGETHER, because either alone is misleading:
 *
 *   senseAndMove  fraction of BODIES holding both a sensor and a muscle. The
 *                 target. Not the tissue mix — a population can be 25% of each
 *                 type and still be a million identical bodies.
 *   alive         whether the world can carry it. A setting that produces
 *                 beautiful differentiation in a population of nine is a
 *                 setting that has killed the world, and this project has
 *                 shipped that mistake before.
 *
 * A run reports both, and a value only wins if it improves the first WITHOUT
 * collapsing the second.
 *
 *   deno run -A --unstable-webgpu tools/labour-sweep.js
 *
 * Env: TICKS (default 260), REPS (2), CAP (193), BOUND (90), OUT.
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver, describe } from '../lib/evolve.js';

const TICKS = Number(Deno.env.get('TICKS') ?? 260);
const REPS = Number(Deno.env.get('REPS') ?? 2);
const CAP = Number(Deno.env.get('CAP') ?? 193);
const BOUND = Number(Deno.env.get('BOUND') ?? 90);
const OUT = Deno.env.get('OUT') ?? './runs/labour-sweep.jsonl';

const VALUES = (Deno.env.get('VALUES') ?? '0.0,0.4,0.7,0.9').split(',').map(Number);

const say = async (o) => {
  console.log(JSON.stringify(o));
  await Deno.writeTextFile(OUT, JSON.stringify(o) + '\n', { append: true });
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

function census(arena, cells) {
  const tot = [0, 0, 0, 0];
  let bodies = 0, mono = 0, senseAndMove = 0, three = 0;
  for (let o = 0; o < arena.P; o++) {
    if (!arena.alive[o]) continue;
    const off = arena.off[o], n = arena.cnt[o];
    const b = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const t = cells.ctype[off + i];
      if (t >= 0 && t < 4) { tot[t]++; b[t]++; }
    }
    if (!b.some((v) => v > 0)) continue;
    bodies++;
    const kinds = b.filter((v) => v > 0).length;
    if (kinds === 1) mono++;
    if (kinds >= 3) three++;
    if (b[1] > 0 && b[2] > 0) senseAndMove++;
  }
  const n = tot.reduce((s, v) => s + v, 0) || 1;
  const B = bodies || 1;
  return {
    bodies, cells: n,
    neuron: tot[0] / n, sensor: tot[1] / n, muscle: tot[2] / n, anchor: tot[3] / n,
    mono: mono / B, three: three / B, senseAndMove: senseAndMove / B,
  };
}

async function run(absorb, rep) {
  // See the note in who-selects.js: without bodySlots the population is capped
  // by the organism table rather than by the economy, and the measurement then
  // describes the allocator.
  const built = buildBodies({ beasts: CAP, cells: 12, bound: BOUND, seed: 11 + rep * 101,
                              maxCells: 60, bodySlots: CAP * 8 });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: BOUND, absorbTradeoff: absorb });
  const evo = new Evolver({
    arena: built.arena, world, cells: built.cells, seed: 3 + rep,
    birthEnergy: 18, deathEnergy: 0,
  });
  for (let o = Math.round(CAP / 4); o < CAP; o++) evo.cull(o);
  for (let t = 1; t <= TICKS; t++) {
    world.step(250);
    await evo.tick(t * 250);
    if (evo.alive() === 0) break;
  }
  const c = census(built.arena, built.cells);
  world.destroy(); brains.destroy();
  return { ...c, alive: evo.alive(), lineages: evo.countLineages(), gen: evo.maxGeneration() };
}

await say({ kind: 'start', values: VALUES, ticks: TICKS, reps: REPS, cap: CAP, bound: BOUND,
  target: 'senseAndMove (bodies with both a sensor and a muscle), without collapsing the population' });

const results = [];
for (const v of VALUES) {
  const draws = [];
  for (let r = 0; r < REPS; r++) {
    const res = await run(v, r);
    draws.push(res);
    await say({ kind: 'run', absorbTradeoff: v, rep: r,
      ...Object.fromEntries(Object.entries(res).map(([k, x]) =>
        [k, typeof x === 'number' && !Number.isInteger(x) ? +x.toFixed(4) : x])) });
  }
  const g = (k) => draws.map((d) => d[k]);
  results.push({ v, sm: mean(g('senseAndMove')), smSd: sd(g('senseAndMove')),
                 alive: mean(g('alive')), aliveSd: sd(g('alive')),
                 mono: mean(g('mono')), three: mean(g('three')),
                 muscle: mean(g('muscle')), anchor: mean(g('anchor')) });
  await say({ kind: 'summary', absorbTradeoff: v,
    senseAndMove: +mean(g('senseAndMove')).toFixed(4),
    se: +(sd(g('senseAndMove')) / Math.sqrt(REPS)).toFixed(4),
    alive: Math.round(mean(g('alive'))), monoBodies: +mean(g('mono')).toFixed(3),
    threeTissue: +mean(g('three')).toFixed(3),
    muscle: +mean(g('muscle')).toFixed(3), anchor: +mean(g('anchor')).toFixed(3) });
}

// The verdict, with the viability condition stated as a requirement rather than
// noticed afterwards.
const base = results.find((r) => r.v === 0.4) ?? results[0];
const viable = results.filter((r) => r.alive >= 0.5 * base.alive);
const best = viable.slice().sort((a, b) => b.sm - a.sm)[0];
await say({
  kind: 'verdict',
  baseline: { absorbTradeoff: base.v, senseAndMove: +base.sm.toFixed(4), alive: Math.round(base.alive) },
  best: best ? { absorbTradeoff: best.v, senseAndMove: +best.sm.toFixed(4), alive: Math.round(best.alive) } : null,
  improves: !!best && best.sm - base.sm > (base.smSd + best.smSd) / Math.sqrt(REPS),
  note: 'viable = population at least half the baseline. A setting that differentiates '
      + 'beautifully in a world of nine has killed the world, which has shipped before.',
});
