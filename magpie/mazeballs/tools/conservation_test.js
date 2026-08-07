/**
 * DOES THE WORLD MINT? — the friction law, as a test that runs.
 *
 * `energy-speculative-friction.md` is the second of two laws: every joule traces
 * to the fixed sun and dissipates to heat, one currency, global-uniform inflow
 * legitimate and local-targeted grants fiction. It has been enforced by reading
 * code and arguing in commit messages. Nothing checks it.
 *
 * That is a gap with teeth, because minting is SILENT. Energy appearing from
 * nowhere does not throw; it shows up as a population that thrives for reasons
 * nobody can name, and every measurement taken on that world is reward-shaping
 * in disguise. This project has already found one transfer that destroyed energy
 * on every contact (contest, before it was bounded) and one field that granted
 * it (tidal income, before the trait factor came off) — both by argument, after
 * the fact.
 *
 * WHAT IT CHECKS. Over a window, with births and deaths suppressed so the
 * bookkeeping is closed:
 *
 *     Δ(energy in cells)  +  Δ(energy in motes)   ==   what the sun put in
 *
 * The sun is the only source: `moteRegrow` against fertility, bounded by
 * `moteCap`. Everything else — grazing, contest, sap, tidal — is a TRANSFER and
 * must net to zero across the pair. Metabolism is a sink and can only remove.
 *
 * So the test is one-sided and precise: **the total may fall freely (heat), and
 * it may rise by no more than the sun delivered.** A rise beyond that is a mint,
 * wherever it came from.
 *
 * WHY THE CLAMPS MATTER. `eCap` and `eFloor` are the known conservation
 * leak: a transfer bounded by what the loser can afford and the winner can hold
 * is exact, but a cell already at the ceiling silently drops what it cannot
 * take. That is a SINK, so it can only make the world poorer, and the test
 * treats a shortfall as legitimate.
 *
 *   deno run -A --unstable-webgpu tools/conservation_test.js
 *
 * Env: STEPS (4000), TOL (0.02 = 2% of the sun's delivery), plus ARMS to check
 * a specific configuration.
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';

const STEPS = Number(Deno.env.get('STEPS') ?? 4000);
const TOL = Number(Deno.env.get('TOL') ?? 0.001);

const ARMS = JSON.parse(Deno.env.get('ARMS') ?? JSON.stringify([
  { name: 'as shipped', params: {} },
  { name: 'contest hot', params: { contestRate: 4.0 } },
  { name: 'sap on', params: { sapRate: 0.9 } },
  { name: 'tidal hot', params: { tidalYield: 0.5 } },
  { name: 'body-share grazing', params: { grazeBodyShare: 1.0 } },
  { name: 'shelter on', params: { shelterK: 0.1 } },
]));

async function totals(world, cells) {
  const { energy } = await world.readCells();
  let cellE = 0;
  for (let i = 0; i < cells.ctype.length; i++) {
    if (cells.ctype[i] < 0) continue;
    cellE += energy[i];
  }
  let moteE = 0;
  try {
    const m = await world.readMotes();
    for (let i = 0; i < m.stock.length; i++) moteE += m.stock[i];
  } catch { /* no motes in this world */ }
  return { cellE, moteE, total: cellE + moteE };
}

/**
 * THE SUN IS TURNED OFF, and that is what makes this test worth running.
 *
 * The first version bounded the gain by what regrowth COULD deliver at full
 * rate with no suppression and no logistic ceiling. It passed everything,
 * because the bound came out at 2.6 million against real movements of about
 * 1,600 — a test whose tolerance is a thousand times its signal detects
 * nothing and is worse than no test, since it reports "ok".
 *
 * With `moteRegrow = 0` there is no inflow at all. Every remaining mechanism is
 * either a TRANSFER, which must net to zero across the pair, or a SINK, which
 * can only remove. So the total may fall freely and **must never rise, by
 * anything, ever**. No bound to estimate, no fertility or suppression to argue
 * about, and a tolerance that can sit at floating-point noise instead of at a
 * thousand times the effect.
 *
 * It costs one thing worth stating: it cannot catch a mint that is proportional
 * to regrowth, because regrowth is off. Nothing in the world is written that
 * way — tidal, contest and sap all act on cells — but a future mechanism that
 * hid inside the mote pass would slip through, and would need its own arm here.
 */

/**
 * PAIRED, because the one-sided version has a hole big enough to lose a star in.
 *
 * "Total must never rise" only catches a mint LARGER than total metabolism.
 * Every arm above lost ~1,500 to heat, so a mechanism quietly adding 1,000
 * would still show a loss and still read "ok". That is the same defect as the
 * first version wearing different clothes: a test that cannot fail is not a
 * test.
 *
 * So each mechanism is run twice, same seed, same window, ON and OFF, and the
 * DIFFERENCE is what it contributed. A transfer — contest, sap, shelter,
 * body-share grazing — moves energy between cells and must contribute nothing.
 * Tidal income is the exception and the positive control: it is a declared
 * second star (planetary dynamics, harvesting drag dissipation), so it MUST
 * show up as a source. If the test cannot see tidal adding energy, it cannot
 * see a mint either, and its passes mean nothing.
 */
const PAIRS = [
  { name: 'contest',            on: { contestRate: 4.0 },     off: { contestRate: 0 },     source: false },
  { name: 'sap',                on: { sapRate: 0.9 },         off: { sapRate: 0 },         source: false },
  { name: 'shelter',            on: { shelterK: 0.1 },        off: { shelterK: 0 },        source: false },
  { name: 'body-share grazing', on: { grazeBodyShare: 1.0 },  off: { grazeBodyShare: 0 },  source: false },
  { name: 'tidal income',       on: { tidalYield: 0.5 },      off: { tidalYield: 0 },      source: true },
];

let failures = 0;
console.log(`window ${STEPS} steps, SUN OFF (moteRegrow 0). Total must never rise.`);
console.log(`tolerance ${(100 * TOL).toFixed(1)}% of the energy present, for f32 rounding\n`);
console.log(`${'arm'.padEnd(20)} ${'change'.padStart(12)} ${'energy at t0'.padStart(12)}  verdict`);

for (const arm of ARMS) {
  const built = buildBodies({ beasts: 120, cells: 12, bound: 60, seed: 7,
                              maxCells: 60, bodySlots: 960 });
  const brains = await BrainArenaGPU.create(built.arena);
  // moteRegrow 0 LAST, so an arm cannot accidentally switch the sun back on.
  const world = new WorldGPU(brains, built.cells,
    { bound: 60, ...arm.params, moteRegrow: 0 });

  // Settle first: the opening steps include the founder placement transient.
  world.step(400);
  const before = await totals(world, built.cells);
  world.step(STEPS);
  const after = await totals(world, built.cells);

  // NO EVOLVER. Births mint by design — an egg is given yolk the parent paid
  // for, but development also spends, and cull() deletes a body's energy
  // outright. Both are bookkeeping outside the physics, and including them
  // would make this a test of the Evolver rather than of the kernel.
  const gained = after.total - before.total;
  // Tolerance as a fraction of the energy PRESENT, not of an imagined inflow:
  // f32 accumulation over millions of cell-steps has real rounding, and the
  // question is whether the world grew, not whether it grew by exactly zero.
  const slack = before.total * TOL;
  const ok = gained <= slack;
  if (!ok) failures++;
  console.log(`${arm.name.padEnd(20)} ${gained.toFixed(2).padStart(12)} ${before.total.toFixed(1).padStart(12)}  ` +
    `${ok ? 'ok' : 'MINTS — total ROSE with the sun off'}`);
  world.destroy(); brains.destroy();
}

// ---- the paired test ------------------------------------------------------
async function totalChange(params) {
  const built = buildBodies({ beasts: 120, cells: 12, bound: 60, seed: 7,
                              maxCells: 60, bodySlots: 960 });
  const brains = await BrainArenaGPU.create(built.arena);
  // CLAMPS DISABLED, and this is what makes the paired test mean what it says.
  //
  // eCap and eFloor DESTROY energy: a cell at the ceiling silently drops what it
  // cannot take. So a transfer that spreads energy out leaves fewer cells at the
  // ceiling, wastes less, and shows up as a positive contribution — without
  // having created anything. That is a false positive, and it is what "sap
  // mints" turned out to be: two attempted fixes moved the number by nothing
  // because there was no leak to fix.
  //
  // With the bounds pushed far outside the range any cell reaches, clamping
  // cannot destroy or create, and a transfer must then contribute EXACTLY zero.
  const world = new WorldGPU(brains, built.cells,
    { bound: 60, ...params, moteRegrow: 0, eCap: 1e6, eFloor: -1e6 });
  world.step(400);
  const a = await totals(world, built.cells);
  world.step(STEPS);
  const b = await totals(world, built.cells);
  world.destroy(); brains.destroy();
  return b.total - a.total;
}

console.log(`\npaired: each mechanism ON minus OFF, same seed. A TRANSFER must`);
console.log(`contribute nothing; tidal is a declared source and is the control.\n`);
console.log(`${'mechanism'.padEnd(20)} ${'on'.padStart(10)} ${'off'.padStart(10)} ${'contributed'.padStart(12)}  verdict`);
let sawSource = false;
for (const p of PAIRS) {
  const on = await totalChange(p.on), off = await totalChange(p.off);
  const d = on - off;
  const slack = Math.abs(off) * 0.05;          // 5% of the metabolic loss
  let verdict;
  if (p.source) {
    sawSource = d > slack;
    verdict = sawSource ? 'source, as declared (test can see one)'
                        : 'NOT VISIBLE — the test cannot detect a source';
    if (!sawSource) failures++;
  } else if (d > slack) {
    verdict = 'MINTS — a transfer added energy'; failures++;
  } else {
    verdict = 'ok';
  }
  console.log(`${p.name.padEnd(20)} ${on.toFixed(1).padStart(10)} ${off.toFixed(1).padStart(10)} ` +
    `${d.toFixed(1).padStart(12)}  ${verdict}`);
}

console.log('');
if (failures) {
  console.log(`${failures} configuration(s) GAINED energy with no sun.`);
  console.log('Under energy-speculative-friction.md that is a mint, and a mint invalidates');
  console.log('every measurement taken on that configuration.');
  Deno.exit(1);
}
console.log('No configuration gained energy with the sun switched off, no transfer added');
console.log('any, and the declared source was detected — so the passes mean something.');
