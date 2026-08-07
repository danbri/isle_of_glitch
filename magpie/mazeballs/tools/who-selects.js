/**
 * WHO IS SELECTING WHOM — the standing goal, made into a number.
 *
 * The goal is "make organisms each other's dominant selective pressure, and
 * show it survives deep time". That is two claims and neither has ever been
 * measured here; the escalation result cited before this was about
 * contractility, which is equally explicable by the terrain.
 *
 * THE TRAIT THAT SETTLES IT IS TOUGHNESS. Armour costs energy every second
 * (toughCost) and has exactly one benefit: it reduces what another organism can
 * take from you on contact. It does nothing about mud, slope, altitude, flow or
 * fertility. So toughness rising above the level its own cost would allow is
 * not evidence that something is selecting — it is evidence that OTHER
 * ORGANISMS are, because nothing else in the physics can pay for it.
 *
 * Enzyme and tag are the second witness. A digestive enzyme's value depends
 * entirely on what other organisms are made of (dietWidth matches enzyme
 * against tag); a surface tag's value depends entirely on who is trying to eat
 * you. Both are meaningless in a world of one. If their SPREAD widens, lineages
 * are diverging in how they exploit each other, which is what a guild is.
 *
 * THREE ARMS, one seed, one world, differing in exactly one thing each:
 *
 *   full      everything on
 *   nobiotic  contestRate = 0 — organisms cannot take energy from each other.
 *             The abiotic world is untouched. This is the REQUIRED CONTROL:
 *             any trait that moves here moved for reasons that are not other
 *             organisms.
 *   noabiotic geography flat — no gravity, no altitude cost, no mud, uniform
 *             fertility and a uniform current. Organisms still eat each other.
 *
 * DOMINANCE IS A COMPARISON, NOT A LEVEL. The claim is supported only if the
 * biotic-attributable trait movement exceeds the abiotic-attributable one:
 *
 *     biotic  = |full - nobiotic|      what other organisms account for
 *     abiotic = |full - noabiotic|     what the world accounts for
 *
 * DEEP TIME is the second claim and it is the one that has killed every
 * previous result. Whatever appears at the first horizon must still be there at
 * ten times the ticks, or it is retracted. Checkpoints are written as they
 * happen so a partial run is still evidence, and so a reversal is visible
 * rather than averaged away.
 *
 *   deno run -A --unstable-webgpu tools/who-selects.js
 *
 * Env: TICKS (first horizon, default 3000), DEEP (multiplier, default 10),
 *      REPS (replicates per arm, default 2), OUT.
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver } from '../lib/evolve.js';

const TICKS = Number(Deno.env.get('TICKS') ?? 3000);
const DEEP = Number(Deno.env.get('DEEP') ?? 10);
const REPS = Number(Deno.env.get('REPS') ?? 2);
const OUT = Deno.env.get('OUT') ?? './runs/who-selects.jsonl';

// Sized from the env so the run can be fitted to the time available. Smaller is
// not weaker here: replicates and DEPTH decide whether a result is real, and a
// bigger world spent on one replicate is exactly the trade this project has
// been burned by. See AUTORESEARCH.md.
const CAP = Number(Deno.env.get('CAP') ?? 1200);
const START = Math.max(50, Math.round(CAP / 4));
const BOUND = Number(Deno.env.get('BOUND') ?? 70);
const STEPS_PER_TICK = Number(Deno.env.get('SPT') ?? 250);
// Twelve checkpoints inside the first horizon, then the same cadence through
// deep time — so the shape of a trajectory is visible, not just its endpoints,
// and a smoke run at TICKS=6 still produces rows.
const CHECK_EVERY = Math.max(1, Math.round(TICKS / 12));

// Flat geography. Note what is NOT here: contestRate, toughCost, dietWidth and
// absorbTradeoff are untouched, so the biotic economy is identical. Only the
// world differs.
const FLAT = {
  gravity: 0, highSap: 0, lowLush: 0, mudSlip: 0, mudFlow: 0, mudFog: 0,
  flowDry: 1, flowTerrain: 0, tidalYield: 0, senseTerrain: 0,
};

const ARMS = [
  { name: 'full', params: {} },
  { name: 'nobiotic', params: { contestRate: 0 } },
  { name: 'noabiotic', params: FLAT },
];

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

/** Unpack the material vector of every LIVING cell. Mirrors packSize exactly. */
function traits(meta, n) {
  const tough = [], tag = [], enz = [];
  for (let i = 0; i < n; i++) {
    if (meta[i * 4] < 0) continue;             // vacated slot
    const w = meta[i * 4 + 3];
    tough.push(((w >> 16) & 255) / 255);
    tag.push(((w >> 8) & 255) / 255);
    enz.push(((w >> 24) & 127) / 127);
  }
  return {
    n: tough.length,
    tough: mean(tough), toughSd: sd(tough),
    tag: mean(tag), tagSd: sd(tag),
    enz: mean(enz), enzSd: sd(enz),
  };
}

/**
 * Build one arm's world and hand back something that can be stepped a bit at a
 * time. Arms are then advanced ROUND-ROBIN rather than one after another.
 *
 * That is not a tidiness preference, it is what makes a time-boxed run usable.
 * Run sequentially, a night that ends early leaves `full` complete and
 * `noabiotic` never started — and the verdict is a CONTRAST between arms, so
 * two complete arms and one missing is worth exactly nothing. Interleaved,
 * stopping at any moment leaves all three arms at the same tick, which is a
 * result.
 */
// SEED OFFSET, so a replication batch is a genuinely independent sample rather
// than the same worlds run twice. Batch 1 used SEEDBASE 11; a batch testing a
// hypothesis batch 1 generated must not reuse its seeds, or it is checking
// arithmetic rather than replicating a result.
const SEEDBASE = Number(Deno.env.get('SEEDBASE') ?? 11);

function makeArm(arm, rep) {
  const seed = SEEDBASE + rep * 101;
  return { arm, rep, seed, world: null, brains: null, evo: null, built: null,
           tick: 0, dead: false };
}

async function armInit(a) {
  // BODY SLOTS, SIZED SEPARATELY FROM CELL ISLANDS — the exact bug this project
  // has already paid for once. Without bodySlots the organism table is the same
  // size as the island count, so the population hits an ALLOCATION ceiling with
  // most of the cell memory still free: measured as alive == CAP == 193 while
  // 9,675 cell slots sat empty. Births then equal deaths because the allocator
  // says so, not because the economy does, and every selection measurement
  // taken in that regime is measuring the allocator.
  a.built = buildBodies({ beasts: CAP, cells: 12, bound: BOUND, seed: a.seed,
                          maxCells: 60, bodySlots: CAP * 8 });
  a.brains = await BrainArenaGPU.create(a.built.arena);
  a.world = new WorldGPU(a.brains, a.built.cells, { bound: BOUND, ...a.arm.params });
  a.evo = new Evolver({
    arena: a.built.arena, world: a.world, cells: a.built.cells, seed: 3 + a.rep,
    birthEnergy: 18, deathEnergy: 0,
  });
  for (let o = START; o < CAP; o++) a.evo.cull(o);
}

/** Advance one arm by `n` ticks. Returns false once it is finished or extinct. */
async function armStep(a, n, total, series) {
  if (a.dead) return false;
  for (let k = 0; k < n && a.tick < total; k++) {
    a.tick++;
    a.world.step(STEPS_PER_TICK);
    await a.evo.tick(a.tick * STEPS_PER_TICK);
    if (a.tick % CHECK_EVERY !== 0) continue;

    const m = await a.world.readMeta();
    const tr = traits(m, a.built.cells.ctype.length);
    // WEALTH, because armour is a LUXURY GOOD and the contrast is confounded
    // without it. toughCost is charged every second, so how much armour a
    // population carries depends on what it can afford — and the arms differ in
    // exactly that. Measured on the two-replicate run:
    //
    //   arm         mean alive   mean toughness
    //   nobiotic          1121           0.1241
    //   full               830           0.0582
    //   noabiotic          514           0.0345
    //
    // Monotonic across arms AND within them. So |full - nobiotic| on toughness
    // conflates "other organisms select for armour" with "switching off contest
    // makes the world richer, and rich populations buy more armour" — which is
    // not the question. Logged so the confound is visible and can be divided
    // out, rather than discovered after a claim has been made.
    const { energy } = await a.world.readCells();
    let eSum = 0, eN = 0;
    for (let i = 0; i < a.built.cells.ctype.length; i++) {
      if (a.built.cells.ctype[i] < 0) continue;
      eSum += energy[i]; eN++;
    }
    const meanE = eN ? eSum / eN : 0;
    const row = {
      kind: 'checkpoint', arm: a.arm.name, rep: a.rep, tick: a.tick,
      horizon: a.tick <= TICKS ? 'first' : 'deep',
      alive: a.evo.alive(), lineages: a.evo.countLineages(),
      meanEnergy: +meanE.toFixed(4),
      // Armour per unit of what the population can afford. A level that rises
      // only because everyone got richer is not escalation.
      toughPerE: +(tr.tough / Math.max(0.05, meanE)).toFixed(5),
      generation: a.evo.maxGeneration(), births: a.evo.births, deaths: a.evo.deaths,
      ...Object.fromEntries(Object.entries(tr).map(([kk, v]) =>
        [kk, typeof v === 'number' ? +v.toFixed(4) : v])),
    };
    series.push(row);
    await say(row);
    // An arm whose population is gone tells us nothing further, and continuing
    // to spend hours on it is how a run produces a confident number about an
    // empty world.
    if (a.evo.alive() === 0) {
      await say({ kind: 'extinct', arm: a.arm.name, rep: a.rep, tick: a.tick });
      a.dead = true;
      a.world.destroy(); a.brains.destroy();
      return false;
    }
  }
  if (a.tick >= total) { a.world.destroy(); a.brains.destroy(); a.dead = true; return false; }
  return true;
}

await say({
  kind: 'start', ticks: TICKS, deep: DEEP, reps: REPS,
  arms: ARMS.map(a => a.name),
  claim: 'organisms are each others dominant selective pressure, and it survives deep time',
  decides: 'toughness costs energy and only defends against other organisms; ' +
           'enzyme and tag are meaningless in a world of one',
});

const all = [];
const arms = [];
for (const arm of ARMS) for (let r = 0; r < REPS; r++) arms.push(makeArm(arm, r));
for (const a of arms) await armInit(a);
await say({ kind: 'armed', arms: arms.length, note: 'stepped round-robin so all arms stay at the same tick' });

const total = TICKS * DEEP;
const SLICE = Math.max(1, Math.round(CHECK_EVERY));
for (let live = true; live;) {
  live = false;
  for (const a of arms) {
    if (await armStep(a, SLICE, total, all)) live = true;
  }
}

// ---- the verdict, at both horizons -----------------------------------------
const at = (armName, horizon, field) => {
  // The LAST checkpoint within the horizon, per replicate.
  const byRep = new Map();
  for (const row of all) {
    if (row.arm !== armName) continue;
    if (horizon === 'first' && row.tick > TICKS) continue;
    const cur = byRep.get(row.rep);
    if (!cur || row.tick > cur.tick) byRep.set(row.rep, row);
  }
  return [...byRep.values()].map(r => r[field]);
};

for (const horizon of ['first', 'deep']) {
  // toughPerE alongside tough: if the biotic effect survives dividing out
  // wealth it is about predation, and if it does not it was about wealth.
  for (const field of ['tough', 'toughPerE', 'enzSd', 'tagSd', 'meanEnergy', 'lineages']) {
    const full = at('full', horizon, field);
    const nb = at('nobiotic', horizon, field);
    const na = at('noabiotic', horizon, field);
    if (!full.length || !nb.length || !na.length) continue;
    const biotic = Math.abs(mean(full) - mean(nb));
    const abiotic = Math.abs(mean(full) - mean(na));
    // Pooled SE across the two contrasts, so "bigger" has to clear the noise.
    const se = Math.sqrt(
      (sd(full) ** 2) / Math.max(1, full.length) +
      (sd(nb) ** 2) / Math.max(1, nb.length) +
      (sd(na) ** 2) / Math.max(1, na.length));
    await say({
      kind: 'verdict', horizon, field,
      full: +mean(full).toFixed(4), nobiotic: +mean(nb).toFixed(4),
      noabiotic: +mean(na).toFixed(4),
      bioticEffect: +biotic.toFixed(4), abioticEffect: +abiotic.toFixed(4),
      se: +se.toFixed(4),
      // The bar deliberately requires the gap to clear the noise, not merely to
      // exist. A ratio above 1 with the difference inside one SE is exactly the
      // kind of result this project has retracted before.
      bioticDominates: biotic > abiotic && (biotic - abiotic) > se,
    });
  }
}
await say({ kind: 'done' });
