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
// ARMS AS WORLD FEATURES, not just as a mote-drift number.
//
// The question sharpened: crowding suppression was tuned specifically to make
// movers out-earn sitters (this project's ledger: crowdK 2.0, movers +1.9
// against sitters -4.8) and no longer does. The world has since gained several
// things that could each have restored the value of sitting still, and one of
// them was written to do exactly that — TIDAL INCOME PAYS FOR HOLDING STATION
// AGAINST THE CURRENT. That is an anti-locomotion subsidy in plain sight.
const ARMS = JSON.parse(Deno.env.get('ARMS') ?? JSON.stringify([
  { name: 'as shipped', params: {} },
  { name: 'no tidal income', params: { tidalYield: 0 } },
  { name: 'no geography', params: { gravity: 0, highSap: 0, lowLush: 0, mudSlip: 0,
                                    mudFlow: 0, flowDry: 1, flowTerrain: 0, senseTerrain: 0 } },
  { name: 'no contest', params: { contestRate: 0 } },
]));
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

async function one(arm, rep) {
  const built = buildBodies({ beasts: CAP, cells: 12, bound: BOUND, seed: 11 + rep * 101,
                              maxCells: 60, bodySlots: CAP * 8 });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: BOUND, ...arm.params });
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

await say({ kind: 'start', arms: ARMS.map((a) => a.name), reps: REPS, warm: WARM, win: WIN,
  question: 'which addition restored the value of sitting still' });

const summary = [];
for (const arm of ARMS) {
  const diffs = [];
  for (let r = 0; r < REPS; r++) {
    const res = await one(arm, r);
    if (!res) { await say({ kind: 'skip', arm: arm.name, rep: r, why: 'too few surviving bodies' }); continue; }
    diffs.push(res.diff);
    await say({ kind: 'run', arm: arm.name, rep: r,
      ...Object.fromEntries(Object.entries(res).map(([k, x]) => [k, +x.toFixed(4)])) });
  }
  const m = mean(diffs), se = sd(diffs) / Math.sqrt(Math.max(1, diffs.length));
  summary.push({ name: arm.name, m, se, n: diffs.length });
  await say({ kind: 'summary', arm: arm.name, reps: diffs.length,
    meanDiff: +m.toFixed(4), se: +se.toFixed(4),
    // Positive means movers end richer, which is the incentive locomotion — and
    // therefore perception — needs in order to be worth anything.
    movingPays: m > 2 * se });
}

// Each arm against the shipped world. A feature is implicated if removing it
// makes moving measurably more rewarding than it is with the feature present.
const base = summary[0];
for (const s of summary.slice(1)) {
  const gap = s.m - base.m;
  const se = Math.sqrt(s.se ** 2 + base.se ** 2);
  await say({ kind: 'verdict', removed: s.name,
    withFeature: +base.m.toFixed(4), without: +s.m.toFixed(4),
    gap: +gap.toFixed(4), se: +se.toFixed(4),
    implicated: gap > 2 * se,
    note: 'implicated = removing this makes moving measurably more rewarding, '
        + 'i.e. the feature is part of why sitting still pays' });
}
await say({ kind: 'done' });
