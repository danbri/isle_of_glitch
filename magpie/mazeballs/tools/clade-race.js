/**
 * CLADE RACE — does who you meet decide who wins, and does it hold at 10×?
 *
 * The standing goal is *organisms are each other's dominant selective pressure,
 * and it survives deep time*. Every measurement of it so far has gone through a
 * TRAIT — toughness, tag spread, enzyme diversity — and asked whether the biotic
 * channel moved that trait more than the world did. All of them either failed at
 * deep time or failed to replicate.
 *
 * This asks the question directly instead. Two real clades from the live world,
 * put in the same world in equal numbers, and the only thing that differs
 * between the arms is WHO ELSE IS THERE. If a clade's fate is decided by the
 * other clade rather than by the ground, that IS organisms being each other's
 * dominant selective pressure, measured on survival rather than on a proxy.
 *
 * THE CONTROL IS THE POINT, and this project requires it: a monoculture in the
 * same world. A clade that doubles against a rival and also doubles alone has
 * told you about the world, not about the rival. So each clade is run
 *
 *   MIXED   — against the other clade, equal founders
 *   ALONE   — against itself, same founder count, same world, same seed
 *
 * and the claim is about the DIFFERENCE. Without the monoculture arm this is a
 * fitness measurement wearing a coevolution costume, which is the mistake that
 * cost this project five retractions in one night.
 *
 * DEEP TIME IS A SEPARATE HORIZON, not a longer run reported once. Everything
 * measured in this world so far that cleared at a first horizon has failed at
 * ten times it, so a race that is not run at both is not evidence.
 *
 *   deno run -A --unstable-webgpu tools/clade-race.js --a 284 --b 192
 *
 * Env: REPS (3), FIRST (4000 steps), DEEP (10), PERSIDE (60), BOUND (46), OUT.
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver } from '../lib/evolve.js';

const opt = (n, d) => {
  const i = Deno.args.indexOf(`--${n}`);
  return i >= 0 && Deno.args[i + 1] ? Deno.args[i + 1] : d;
};
const REPS = Number(Deno.env.get('REPS') ?? 3);
const FIRST = Number(Deno.env.get('FIRST') ?? 4000);
const DEEPX = Number(Deno.env.get('DEEP') ?? 10);
const PERSIDE = Number(Deno.env.get('PERSIDE') ?? 60);
const BOUND = Number(Deno.env.get('BOUND') ?? 46);
const OUT = Deno.env.get('OUT') ?? './runs/clade-race.jsonl';
const LIN_A = opt('a', '284'), LIN_B = opt('b', '192');

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

const lib = JSON.parse(await Deno.readTextFile('./lib/creatures.json'));
const pick = (lin) => lib.creatures.filter((c) => c.provenance?.lineage === Number(lin));
const poolA = pick(LIN_A), poolB = pick(LIN_B);
if (!poolA.length || !poolB.length) {
  console.error(`need wild genomes from both lineages in the zoo; have ` +
    `${poolA.length} from ${LIN_A} and ${poolB.length} from ${LIN_B}. ` +
    `Capture more with tools/zoo-capture.js.`);
  Deno.exit(1);
}

/**
 * Seed a world with `perSide` founders from each pool and run it.
 *
 * Side is carried down the lineage by DESCENT — a newborn inherits its parent's
 * side — rather than by relabelling, because a slot is recycled and a label on a
 * slot is a lie the moment somebody dies in it.
 */
// Seeds offset so a replication batch is an independent sample, not the same
// worlds run twice — the mistake caught before the enzSd replication.
const SEEDBASE = Number(Deno.env.get('SEEDBASE') ?? 700);

async function race(poolLeft, poolRight, steps, rep, tag) {
  const N = PERSIDE * 2;
  const built = buildBodies({ beasts: Math.max(64, N * 4), cells: 12, bound: BOUND,
                              seed: SEEDBASE + rep * 37, maxCells: 60,
                              bodySlots: Math.max(256, N * 12) });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: BOUND });
  const evo = new Evolver({ arena: built.arena, world, cells: built.cells,
                            seed: 3 + rep, birthEnergy: 18, deathEnergy: 0 });

  // Everything above the founders is culled, then the founders are given the
  // two pools' genomes alternately so neither side gets the better ground.
  for (let o = N; o < built.arena.P; o++) evo.cull(o);
  const side = new Int8Array(built.arena.P).fill(-1);
  for (let o = 0; o < N; o++) {
    if (!built.arena.alive[o]) continue;
    const left = (o % 2) === 0;
    const pool = left ? poolLeft : poolRight;
    const g = pool[(o >> 1) % pool.length];
    evo.genome[o] = Float32Array.from(g.genome);
    side[o] = left ? 0 : 1;
  }

  const ticks = Math.max(1, Math.round(steps / 250));
  for (let t = 1; t <= ticks; t++) {
    const before = new Uint8Array(built.arena.P);
    for (let o = 0; o < built.arena.P; o++) before[o] = built.arena.alive[o] ? 1 : 0;
    world.step(250);
    await evo.tick(t * 250);
    // A slot that came alive this tick inherits its parent's side.
    for (let o = 0; o < built.arena.P; o++) {
      if (built.arena.alive[o] && !before[o]) {
        const p = evo.parent[o];
        side[o] = (p >= 0 && side[p] >= 0) ? side[p] : -1;
      }
    }
    if (!evo.alive()) break;
  }

  let a = 0, b = 0;
  for (let o = 0; o < built.arena.P; o++) {
    if (!built.arena.alive[o]) continue;
    if (side[o] === 0) a++; else if (side[o] === 1) b++;
  }
  world.destroy(); brains.destroy();
  return { a, b, alive: evo.alive(), shareLeft: a / Math.max(1, a + b) };
}

await say({ kind: 'start', lineages: [LIN_A, LIN_B], reps: REPS,
  first: FIRST, deep: FIRST * DEEPX, perSide: PERSIDE,
  poolA: poolA.length, poolB: poolB.length,
  question: 'is a clade\'s fate decided by WHO ELSE IS THERE, and does it hold at 10x' });

for (const [label, steps] of [['first', FIRST], ['deep', FIRST * DEEPX]]) {
  const mixed = [], aloneA = [], aloneB = [];
  for (let r = 0; r < REPS; r++) {
    const m = await race(poolA, poolB, steps, r, label);
    mixed.push(m.shareLeft);
    // THE CONTROL. Same world, same seed, same founder count — each clade
    // against ITSELF. Its share is 0.5 by construction, so what is compared is
    // how much of the world it holds, not who won.
    const ca = await race(poolA, poolA, steps, r, label);
    const cb = await race(poolB, poolB, steps, r, label);
    aloneA.push(ca.alive); aloneB.push(cb.alive);
    await say({ kind: 'run', horizon: label, rep: r,
      mixedShareA: +m.shareLeft.toFixed(4), mixedAlive: m.alive,
      aloneA: ca.alive, aloneB: cb.alive });
  }
  const share = mean(mixed), se = sd(mixed) / Math.sqrt(Math.max(1, mixed.length));
  // Does A beat B when they meet, beyond what each does alone? If A simply
  // grows better in this world, its monoculture says so too.
  const soloRatio = mean(aloneA) / Math.max(1, mean(aloneB));
  const expected = soloRatio / (1 + soloRatio);
  await say({ kind: 'summary', horizon: label,
    mixedShareA: +share.toFixed(4), se: +se.toFixed(4),
    aloneA: Math.round(mean(aloneA)), aloneB: Math.round(mean(aloneB)),
    expectedFromSoloGrowth: +expected.toFixed(4),
    // The claim: meeting the other clade changes the outcome by more than
    // their solo growth rates predict.
    interactionMatters: Math.abs(share - expected) > 2 * se,
    excess: +(share - expected).toFixed(4) });
}
await say({ kind: 'done' });
