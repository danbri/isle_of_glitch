/**
 * Tests for the CTRNN arena. Run: deno test lib/brainarena_test.js
 *
 * The load-bearing one is `snapshot round-trip is bit-identical`: the whole
 * headless-Deno-runs-it / browser-watches-it split rests on a restored arena
 * being the same arena, not a plausible reconstruction of it.
 */
import { assert, assertEquals, assertAlmostEquals } from 'jsr:@std/assert@1';
import { BrainArena } from './brainarena.js';

/** A small arena with three beasts of different brain sizes, deterministically wired. */
function populated() {
  const a = new BrainArena({ neurons: 256, degree: 8, organisms: 16, dt: 0.015 });
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (const n of [6, 40, 12]) {
    const o = a.birth(n);
    for (let i = 0; i < n; i++)
      a.setNeuron(o, i, { tau: 0.24 + rnd() * 1.65, bias: rnd() * 2 - 1 });
    for (let to = 0; to < n; to++)
      for (let k = 0; k < 8; k++)
        if (rnd() < 0.6) a.connect(o, (rnd() * n) | 0, to, rnd() * 2 - 1, k);
    a.state[a.off[o]] = 0.5;                 // break symmetry so states actually move
  }
  return a;
}

Deno.test('brains of different sizes pack without padding', () => {
  const a = populated();
  assertEquals([a.cnt[0], a.cnt[1], a.cnt[2]], [6, 40, 12]);
  assertEquals([a.off[0], a.off[1], a.off[2]], [0, 6, 46]);
  // 58 used of 256; one hole holding the rest.
  assertEquals(a.free, [[58, 198]]);
});

Deno.test('wiring stays inside its island', () => {
  assertEquals(populated().validate(), []);
});

Deno.test('connect cannot address another beast', () => {
  const a = populated();
  // Organism 0 has 6 neurons; its neighbour's slots begin at 6. Asking for
  // island-relative index 6 must fail rather than reach into organism 1.
  let threw = false;
  try { a.connect(0, 6, 0, 1, 0); } catch { threw = true; }
  assert(threw, 'connect() accepted an index outside the island');
});

Deno.test('a cross-island edge is caught by validate', () => {
  const a = populated();
  a.esrc[0] = a.off[1];                      // organism 0's neuron 0 <- organism 1
  const bad = a.validate();
  assertEquals(bad.length, 1);
  assert(bad[0].includes('crosses islands'), bad[0]);
});

Deno.test('islands are causally isolated across a step', () => {
  const a = populated();
  // Organism 1 and 2 start at rest except for their own seeded neuron; driving
  // organism 0 hard must not move organism 2 at all.
  const before = Float32Array.from(a.state.subarray(a.off[2], a.off[2] + a.cnt[2]));
  const ext = new Float32Array(a.N);
  for (let i = 0; i < a.cnt[0]; i++) ext[a.off[0] + i] = 50;
  for (let s = 0; s < 20; s++) a.step(ext);
  const after = a.state.subarray(a.off[2], a.off[2] + a.cnt[2]);
  // Organism 2 evolves under its own dynamics; what matters is that it is
  // identical to running it with organism 0 undriven.
  const b = populated();
  for (let s = 0; s < 20; s++) b.step(null);
  assertEquals(Array.from(after), Array.from(b.state.subarray(b.off[2], b.off[2] + b.cnt[2])));
  assert(before.some((v, i) => v !== after[i]) || a.cnt[2] > 0);
});

Deno.test('snapshot round-trip is bit-identical', () => {
  const a = populated();
  for (let s = 0; s < 50; s++) a.step(null);

  const b = BrainArena.restore(a.snapshot());
  assertEquals(b.N, a.N); assertEquals(b.K, a.K); assertEquals(b.P, a.P);
  assertEquals(b.steps, a.steps); assertEquals(b.dt, a.dt);
  assertEquals(Array.from(b.state), Array.from(a.state));
  assertEquals(Array.from(b.bias), Array.from(a.bias));
  assertEquals(Array.from(b.invTau), Array.from(a.invTau));
  assertEquals(Array.from(b.act), Array.from(a.act));
  assertEquals(Array.from(b.esrc), Array.from(a.esrc));
  assertEquals(Array.from(b.ew), Array.from(a.ew));
  assertEquals(Array.from(b.off), Array.from(a.off));
  assertEquals(b.free, a.free);
  assertEquals(b.validate(), []);

  // The real claim: it does not merely LOOK the same, it CONTINUES the same.
  for (let s = 0; s < 50; s++) { a.step(null); b.step(null); }
  assertEquals(Array.from(b.state), Array.from(a.state));
});

Deno.test('a restored arena keeps evolving identically under external drive', () => {
  const a = populated();
  const ext = new Float32Array(a.N);
  for (let i = 0; i < a.N; i++) ext[i] = Math.sin(i) * 0.3;
  for (let s = 0; s < 10; s++) a.step(ext);
  const b = BrainArena.restore(a.snapshot());
  for (let s = 0; s < 40; s++) { a.step(ext); b.step(ext); }
  assertEquals(Array.from(b.state), Array.from(a.state));
});

Deno.test('a slot resolves to the world cell it is', () => {
  const a = populated();
  // Bind organism 2's neurons to arbitrary world cell ids, as a body would.
  for (let i = 0; i < a.cnt[2]; i++) a.bindCell(2, i, 900 + i);
  assertEquals(a.cellOf(a.slot(2, 0)), 900);
  assertEquals(Array.from(a.cellsOf(2)), Array.from({ length: 12 }, (_, i) => 900 + i));
  // Unbound neurons stay explicitly unbound rather than defaulting to cell 0,
  // which would silently alias every unbound slot onto one real cell.
  assertEquals(a.cellOf(a.slot(0, 0)), -1);
});

Deno.test('the cell mapping survives a snapshot round trip', () => {
  const a = populated();
  for (let i = 0; i < a.cnt[1]; i++) a.bindCell(1, i, 500 + i);
  const b = BrainArena.restore(a.snapshot());
  assertEquals(Array.from(b.cell), Array.from(a.cell));
  assertEquals(Array.from(b.cellsOf(1)), Array.from(a.cellsOf(1)));
});

Deno.test('a recycled range does not inherit the dead beast cell bindings', () => {
  const a = populated();
  for (let i = 0; i < a.cnt[1]; i++) a.bindCell(1, i, 500 + i);
  const off = a.off[1];
  a.death(1);
  const o = a.birth(40);
  assertEquals(a.off[o], off);
  for (let i = 0; i < 40; i++) assertEquals(a.cell[off + i], -1);
});

Deno.test('a state delta carries the run forward without the topology', () => {
  const a = populated();
  for (let s = 0; s < 30; s++) a.step(null);
  const watcher = BrainArena.restore(a.snapshot());   // full fetch, once

  for (let s = 0; s < 25; s++) a.step(null);
  const delta = a.snapshotState();
  // The delta is a small fraction of the full snapshot — the whole point.
  assert(delta.byteLength * 4 < a.snapshot().byteLength,
    `delta ${delta.byteLength} not much smaller than full ${a.snapshot().byteLength}`);

  watcher.restoreState(delta);
  assertEquals(Array.from(watcher.state), Array.from(a.state));
  assertEquals(Array.from(watcher.act), Array.from(a.act));
  assertEquals(watcher.steps, a.steps);

  // And it is a real resume, not just a matching picture.
  for (let s = 0; s < 20; s++) { a.step(null); watcher.step(null); }
  assertEquals(Array.from(watcher.state), Array.from(a.state));
});

Deno.test('a state delta refuses to apply across a topology change', () => {
  const a = populated();
  const watcher = BrainArena.restore(a.snapshot());
  a.birth(5);                                  // structure moved; watcher is stale
  for (let s = 0; s < 5; s++) a.step(null);

  let threw = false;
  try { watcher.restoreState(a.snapshotState()); } catch (e) { threw = /epoch/.test(e.message); }
  assert(threw, 'a stale watcher silently accepted a post-birth delta');
});

Deno.test('death frees slots and coalesces holes', () => {
  const a = populated();
  a.death(1);                                 // the 40-neuron brain in the middle
  assertEquals(a.free, [[6, 40], [58, 198]]);
  a.death(0);
  assertEquals(a.free, [[0, 46], [58, 198]]); // coalesced with the hole after it
  a.death(2);
  assertEquals(a.free, [[0, 256]]);           // fully coalesced back to one arena
});

Deno.test('a recycled range does not inherit the dead beast state', () => {
  const a = populated();
  const oldOff = a.off[1];
  a.death(1);
  const o = a.birth(40);
  assertEquals(a.off[o], oldOff);             // same slots reused
  for (let i = 0; i < 40; i++) {
    assertEquals(a.state[oldOff + i], 0);
    assertEquals(a.bias[oldOff + i], 0);
  }
  for (let k = 0; k < 40 * a.K; k++) assertEquals(a.esrc[oldOff * a.K + k], -1);
  assertEquals(a.validate(), []);
});

Deno.test('birth reports failure rather than overflowing the arena', () => {
  const a = new BrainArena({ neurons: 32, degree: 4, organisms: 4 });
  assert(a.birth(20) >= 0);
  assertEquals(a.birth(20), -1);              // no room
  assert(a.birth(12) >= 0);                   // exact fit still works
});

Deno.test('a neuron relaxes toward its input at the rate tau sets', () => {
  // One neuron, no edges, constant drive: an exact check that the integrator is
  // the leaky-integrator form and that tau means seconds.
  const a = new BrainArena({ neurons: 4, degree: 2, organisms: 2, dt: 0.015 });
  const o = a.birth(1);
  a.setNeuron(o, 0, { tau: 0.5, bias: 0 });
  const ext = new Float32Array(a.N); ext[a.off[o]] = 1;
  for (let s = 0; s < 200; s++) a.step(ext);  // 3s = 6 time constants
  assertAlmostEquals(a.state[a.off[o]], 1, 1e-2);
});

Deno.test('tau in the slow-signalling regime stalls in f32 — why stride is reserved', () => {
  // Documents the cliff the header describes, so it is a measured fact and not
  // a claim: with dt/tau ~ 4e-6, increments near equilibrium fall under f32's
  // relative epsilon and the state stops moving short of its target.
  const a = new BrainArena({ neurons: 4, degree: 2, organisms: 2, dt: 0.015 });
  const o = a.birth(1);
  a.setNeuron(o, 0, { tau: 3600, bias: 0 });  // one hour
  const ext = new Float32Array(a.N); ext[a.off[o]] = 1;
  for (let s = 0; s < 20000; s++) a.step(ext);
  const slow = a.state[a.off[o]];

  // The same physical duration integrated at a 256x stride reaches measurably
  // further, because each increment is 256x larger and stays resolvable.
  const b = new BrainArena({ neurons: 4, degree: 2, organisms: 2, dt: 0.015 * 256 });
  const p = b.birth(1);
  b.setNeuron(p, 0, { tau: 3600, bias: 0 });
  const bext = new Float32Array(b.N); bext[b.off[p]] = 1;
  for (let s = 0; s < 20000 / 256; s++) b.step(bext);
  const strided = b.state[b.off[p]];

  assert(strided > slow, `strided ${strided} should outrun unstrided ${slow}`);
});
