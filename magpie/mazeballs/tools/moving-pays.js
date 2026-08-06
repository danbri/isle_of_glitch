/**
 * DOES MOVING PAY? — replicated, with the food-drift question as its arms.
 *
 * `tools/does-moving-pay.js` asks this of the LIVE world in one shot. This asks
 * it of controlled worlds with replicates, because the first pass produced a
 * clean sign flip that did not clear two standard errors at one replicate each,
 * and a sign flip is a hypothesis rather than a result.
 *
 * WHY IT IS UPSTREAM OF EVERYTHING. Sensing can only pay THROUGH movement:
 * knowing where the food is buys nothing if going there is not worth the trip.
 * Measured on the live world, movers ended poorer than sitters. That is a
 * complete explanation of why sense organs are a net loss, and no amount of
 * sensory tuning touches it.
 *
 * THE ARMS. `moteDrift` is how much of the current the standing crop is carried
 * by. The mote buffer's own comment warns that static positions are what make a
 * patch something you can exhaust and have to LEAVE, and that a field refilling
 * under your feet is not a pressure to locomote. Drift was added anyway, for
 * visual coherence. If the warning was right, food arriving on the current is a
 * patch refilling by another route and the incentive to move disappears.
 *
 * THE CONTROL THAT MATTERS. Displacement includes being CARRIED. The population
 * median displacement vector is subtracted, leaving motion relative to the
 * medium — without it this measures the weather. Bodies are tracked by UID and
 * never by arena slot, because slots are recycled and a recycled slot reads as a
 * body teleporting across the world. That mistake cost this project a retracted
 * locomotion result once already.
 *
 *   deno run -A --unstable-webgpu tools/moving-pays.js
 *
 * Env: REPS (4), WARM (70), WIN (60), CAP (110), BOUND (58), VALUES, OUT.
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver } from '../lib/evolve.js';

const REPS = Number(Deno.env.get('REPS') ?? 4);
const WARM = Number(Deno.env.get('WARM') ?? 70);
const WIN = Number(Deno.env.get('WIN') ?? 60);
const CAP = Number(Deno.env.get('CAP') ?? 110);
const BOUND = Number(Deno.env.get('BOUND') ?? 58);
const VALUES = (Deno.env.get('VALUES') ?? '0,0.55').split(',').map(Number);
const OUT = Deno.env.get('OUT') ?? './runs/moving-pays.jsonl';

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
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

async function one(drift, rep) {
  const built = buildBodies({ beasts: CAP, cells: 12, bound: BOUND, seed: 11 + rep * 101,
                              maxCells: 60, bodySlots: CAP * 8 });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: BOUND, moteDrift: drift });
  const evo = new Evolver({ arena: built.arena, world, cells: built.cells,
                            seed: 3 + rep, birthEnergy: 18, deathEnergy: 0 });
  for (let o = Math.round(CAP / 4); o < CAP; o++) evo.cull(o);
  for (let t = 1; t <= WARM; t++) { world.step(250); await evo.tick(t * 250); if (!evo.alive()) break; }

  const A = built.arena, ct = built.cells.ctype;
  const snap = async () => {
    const { pos, energy } = await world.readCells();
    const m = new Map();
    for (let o = 0; o < A.P; o++) {
      if (!A.alive[o]) continue;
      const off = A.off[o], n = A.cnt[o];
      let x = 0, y = 0, e = 0, c = 0;
      for (let i = 0; i < n; i++) {
        if (ct[off + i] < 0) continue;
        x += pos[(off + i) * 2]; y += pos[(off + i) * 2 + 1]; e += energy[off + i]; c++;
      }
      if (c) m.set(evo.uid[o], { x: x / c, y: y / c, e: e / c });
    }
    return m;
  };

  const a = await snap();
  for (let t = 1; t <= WIN; t++) {
    world.step(250); await evo.tick((WARM + t) * 250); if (!evo.alive()) break;
  }
  const b = await snap();
  world.destroy(); brains.destroy();

  const wrap = (d) => (d > BOUND ? d - 2 * BOUND : d < -BOUND ? d + 2 * BOUND : d);
  const rows = [];
  for (const [u, p] of a) {
    const q = b.get(u);
    if (!q) continue;
    rows.push({ dx: wrap(q.x - p.x), dy: wrap(q.y - p.y), dE: q.e - p.e });
  }
  if (rows.length < 20) return null;
  const mx = med(rows.map((r) => r.dx)), my = med(rows.map((r) => r.dy));
  for (const r of rows) r.d = Math.hypot(r.dx - mx, r.dy - my);
  rows.sort((p, q) => p.d - q.d);
  const k = Math.max(1, Math.floor(rows.length / 4));
  const mv = rows.slice(-k).map((r) => r.dE), st = rows.slice(0, k).map((r) => r.dE);
  return { bodies: rows.length, movers: mean(mv), sitters: mean(st),
           diff: mean(mv) - mean(st), drift: Math.hypot(mx, my), alive: evo.alive() };
}

await say({ kind: 'start', values: VALUES, reps: REPS, warm: WARM, win: WIN,
  question: 'do movers end richer than sitters, and does drifting food remove the difference' });

const summary = [];
for (const v of VALUES) {
  const diffs = [];
  for (let r = 0; r < REPS; r++) {
    const res = await one(v, r);
    if (!res) { await say({ kind: 'skip', moteDrift: v, rep: r, why: 'too few surviving bodies' }); continue; }
    diffs.push(res.diff);
    await say({ kind: 'run', moteDrift: v, rep: r,
      ...Object.fromEntries(Object.entries(res).map(([k, x]) => [k, +x.toFixed(4)])) });
  }
  const m = mean(diffs), se = sd(diffs) / Math.sqrt(Math.max(1, diffs.length));
  summary.push({ v, m, se, n: diffs.length });
  await say({ kind: 'summary', moteDrift: v, reps: diffs.length,
    meanDiff: +m.toFixed(4), se: +se.toFixed(4),
    // Positive means movers end richer, which is the incentive locomotion — and
    // therefore perception — needs in order to be worth anything.
    movingPays: m > 2 * se });
}

if (summary.length === 2) {
  const [a, b] = summary;
  const gap = a.m - b.m;
  const se = Math.sqrt(a.se ** 2 + b.se ** 2);
  await say({ kind: 'verdict',
    lower: { moteDrift: a.v, meanDiff: +a.m.toFixed(4) },
    higher: { moteDrift: b.v, meanDiff: +b.m.toFixed(4) },
    gap: +gap.toFixed(4), se: +se.toFixed(4),
    driftRemovesTheIncentive: gap > 2 * se,
    note: 'gap > 2 SE means the food moving with the current measurably removes '
        + 'the reward for moving yourself — the mote comment was right.' });
}
await say({ kind: 'done' });
