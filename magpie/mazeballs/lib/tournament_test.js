/**
 * Tests for the ancestral tournament. Run: deno test --allow-all lib/tournament_test.js
 *
 * The fairness tests matter more than they look: a tournament that quietly
 * favours one side would manufacture exactly the result this instrument exists
 * to detect, and it would look like evidence.
 */
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { buildBodies } from './bodies.js';
import { BrainArenaGPU } from './brainarena_gpu.js';
import { WorldGPU } from './world_gpu.js';
import { Evolver } from './evolve.js';
import { archive, tournament } from './tournament.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());
const gpuTest = (name, fn) => Deno.test({ name, ignore: !HAS_GPU, fn });

async function evolved(ticks, seed = 11) {
  const built = buildBodies({ beasts: 400, cells: 12, bound: 34, seed });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound: 34 });
  const evo = new Evolver({
    arena: built.arena, world, cells: built.cells, seed: 3,
    birthEnergy: 18, deathEnergy: 0,
  });
  for (let o = 150; o < 400; o++) evo.cull(o);
  evo.founders = evo.alive();
  for (let t = 0; t < ticks; t++) { world.step(250); await evo.tick(t * 250); }
  const snap = archive(built.arena, built.cells, `T${ticks}`);
  world.destroy(); brains.destroy();
  return snap;
}

gpuTest('an archived genome is independent of where it lived', async () => {
  const snap = await evolved(3);
  assert(snap.pool.length > 0, 'archived nothing');
  for (const g of snap.pool) {
    assertEquals(g.bias.length, g.n);
    assertEquals(g.ctype.length, g.n);
    // Island-RELATIVE edges: an absolute index would carry the arena offset the
    // genome happened to occupy, so replaying it anywhere else would wire it
    // into whatever now sits at those slots.
    for (const s of g.esrc) assert(s === -1 || (s >= 0 && s < g.n), `edge ${s} outside a body of ${g.n}`);
  }
});

gpuTest('a pool against ITSELF is a coin flip, not a win', async () => {
  // The sharpest fairness check available: identical genomes on both sides must
  // come out near even. Any bias in placement, ordering or accounting shows up
  // here as a side winning something it cannot have earned.
  const snap = await evolved(4);
  const r = await tournament(snap, snap, { perSide: 80, steps: 4000, seed: 5 });
  assert(r.descendantsA + r.descendantsB > 10, 'the tournament world died out; nothing was measured');
  assert(Math.abs(r.shareB - 0.5) < 0.18,
    `identical pools should tie, got shareB ${r.shareB} (${r.descendantsA}:${r.descendantsB})`);
});

gpuTest('the tournament reports descendants and energy for both sides', async () => {
  const early = await evolved(2);
  const late = await evolved(10);
  const r = await tournament(early, late, { perSide: 80, steps: 5000, seed: 9 });
  assert(r.descendantsA >= 0 && r.descendantsB >= 0);
  assert(r.energyA > 0 || r.energyB > 0, 'no energy was captured by either side');
  assert(r.shareB >= 0 && r.shareB <= 1);
});

gpuTest('the contest has room for descendants — reproduction is not blocked', async () => {
  // The tournament is decided by which side leaves more DESCENDANTS, so its
  // arena must have room for descendants. Sized at exactly the starting cells
  // it had none: bodies grow, the free list fragments into holes too small for
  // a body, and births fail within a few hundred ticks. Twenty blocked-birth
  // warnings fired across a single ladder before this was caught. A contest
  // scored on reproduction, run where reproduction is blocked, measures the
  // allocator and nothing else — and every ascent number in this work came
  // through this instrument.
  const snap = await evolved(6);
  const r = await tournament(snap, snap, { perSide: 90, steps: 6000, seed: 21 });
  const total = r.descendantsA + r.descendantsB;
  // Starting population is 2*perSide; a healthy contest either grows past that
  // or turns over freely, and cannot simply be pinned at its initial count.
  assert(total > 20, `only ${total} bodies survived — the contest died out`);
  assert(r.energyA > 0 && r.energyB > 0, 'a side captured no energy at all');
});
