/**
 * Evolution tests. Run: deno test --allow-all lib/evolve_test.js
 *
 * Two of these encode bugs that cost real time and would be invisible without
 * them: a culled body whose cells stayed in the world still competed with the
 * living (and starved the whole population in one tick), and an offspring's
 * copied edge table has to be rebased into its own island or it wires itself
 * into its parent's brain.
 *
 * The selection test is the one that says whether any of this is doing
 * anything: it asks whether descendants end up on better ground than random
 * placement gives, which is the category-free measure WORLD.md allows —
 * energy captured, by descent, with no species anywhere in it.
 */
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { buildBodies } from './bodies.js';
import { BrainArenaGPU } from './brainarena_gpu.js';
import { WorldGPU } from './world_gpu.js';
import { Evolver } from './evolve.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());
const gpuTest = (name, fn) => Deno.test({ name, ignore: !HAS_GPU, fn });

async function setup({ cap = 400, start = 120, cells = 12, bound = 34 } = {}) {
  const built = buildBodies({ beasts: cap, cells, bound, seed: 11 });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound });
  const evo = new Evolver({
    arena: built.arena, world, cells: built.cells, seed: 3,
    birthEnergy: 18, deathEnergy: 0,
  });
  for (let o = start; o < cap; o++) evo.cull(o);
  evo.founders = evo.alive();
  return { ...built, brains, world, evo, bound };
}

/** The analytic resource field, recomputed CPU-side to score positions. */
function resourceAt(x, y, scale, seed) {
  const h2 = (ix, iy, sd) => {
    let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(sd, 1274126177)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = t => t * t * (3 - 2 * t), lp = (a, b, t) => a + (b - a) * t;
  let f = 0, amp = 1, norm = 0, qx = x * scale, qy = y * scale;
  for (let o = 0; o < 4; o++) {
    const ix = Math.floor(qx), iy = Math.floor(qy);
    const u = sm(qx - ix), v = sm(qy - iy), sd = seed + o * 1013;
    f += amp * lp(lp(h2(ix, iy, sd), h2(ix + 1, iy, sd), u),
                  lp(h2(ix, iy + 1, sd), h2(ix + 1, iy + 1, sd), u), v);
    norm += amp; amp *= 0.5; qx *= 2; qy *= 2;
  }
  const r = f / norm;
  return r * r;
}

async function meanResource(sim) {
  const { pos } = await sim.world.readCells();
  const { resScale, resSeed } = sim.world.params;
  let s = 0, n = 0;
  for (let o = 0; o < sim.arena.P; o++) {
    if (!sim.arena.alive[o]) continue;
    for (let i = sim.arena.off[o]; i < sim.arena.off[o] + sim.arena.cnt[o]; i++) {
      s += resourceAt(pos[i * 2], pos[i * 2 + 1], resScale, resSeed); n++;
    }
  }
  return n ? s / n : 0;
}

gpuTest('a culled body leaves the world, not just the arena', async () => {
  // The bug: arena.death() frees the slot but the cells stay in the GPU buffers
  // at their last positions, where they keep counting toward crowding. With
  // most of the arena culled that inflated competition several-fold and the
  // whole population starved on the first tick.
  const sim = await setup();
  for (let o = 120; o < 400; o++) {
    for (let i = 0; i < sim.meta.cellsPerBeast; i++) {
      const c = o * sim.meta.cellsPerBeast + i;
      assertEquals(sim.cells.ctype[c], -1, `cell ${c} of culled body ${o} is still in the world`);
    }
  }
  // And the living must be able to survive at all, which is the symptom that
  // made the bug visible in the first place.
  sim.world.step(500);
  const r = await sim.evo.tick(500);
  assert(r.alive > 20, `population collapsed to ${r.alive} — corpses are still competing`);
  sim.world.destroy(); sim.brains.destroy();
});

gpuTest('offspring wire into their own island, never the parent\'s', async () => {
  const sim = await setup();
  for (let t = 0; t < 6; t++) { sim.world.step(300); await sim.evo.tick(t * 300); }
  // The decisive check: an edge that still pointed at the parent's slots would
  // be a synapse between two bodies.
  assertEquals(sim.arena.validate(), [], 'an offspring is wired across islands');
  assert(sim.evo.births > 0, 'nothing reproduced, so the test proved nothing');
  sim.world.destroy(); sim.brains.destroy();
});

gpuTest('descent is recorded and generations deepen', async () => {
  const sim = await setup();
  for (let t = 0; t < 8; t++) { sim.world.step(300); await sim.evo.tick(t * 300); }

  // Checked against the birth LOG, not by dereferencing parent slots. Slots are
  // recycled, so by now slot p may hold an unrelated newborn and
  // generation[parent[o]] would be that stranger's depth — which is exactly the
  // bug this test caught. uids are never reused, so the log stays true.
  const byUid = new Map(sim.evo.history.map(h => [h.uid, h]));
  let checked = 0;
  for (const h of sim.evo.history) {
    assert(h.uid !== h.parentUid, 'an organism is its own parent');
    const parent = byUid.get(h.parentUid);
    if (!parent) continue;                       // parent was a founder
    assertEquals(h.generation, parent.generation + 1, `uid ${h.uid} generation`);
    assertEquals(h.lineage, parent.lineage, `uid ${h.uid} lineage`);
    checked++;
  }
  assert(sim.evo.history.length > 0, 'no births were logged');
  assert(checked > 0, 'no parent-child pair had both ends in the log');
  assert(sim.evo.maxGeneration() >= 2, `only reached generation ${sim.evo.maxGeneration()}`);
  sim.world.destroy(); sim.brains.destroy();
});

gpuTest('the population finds better ground than chance', async () => {
  // The whole point. Founders are scattered at random, so the starting mean
  // resource IS the null hypothesis; if selection does nothing this stays flat.
  const sim = await setup({ cap: 600, start: 200 });
  const before = await meanResource(sim);
  for (let t = 0; t < 30; t++) { sim.world.step(250); await sim.evo.tick(t * 250); }
  const after = await meanResource(sim);

  assert(sim.evo.alive() > 20, `population died out (${sim.evo.alive()} left)`);
  assert(after > before * 1.15,
    `no selection: mean resource under cells went ${before.toFixed(4)} -> ${after.toFixed(4)}`);
  sim.world.destroy(); sim.brains.destroy();
});

gpuTest('lineages are displaced — some lines out-reproduce others', async () => {
  const sim = await setup({ cap: 600, start: 200 });
  const founders = sim.evo.alive();
  for (let t = 0; t < 30; t++) { sim.world.step(250); await sim.evo.tick(t * 250); }
  const surviving = sim.evo.countLineages();
  // Lineage count can only fall, and a fall means descent is being sorted
  // rather than every founder drifting along untouched.
  assert(surviving < founders * 0.8,
    `lineages barely moved: ${founders} founders -> ${surviving} surviving lines`);
  sim.world.destroy(); sim.brains.destroy();
});

gpuTest('body TOPOLOGY diversifies, and every body stays connected', async () => {
  // The ring-plus-chord plan was identical in every creature forever, so the
  // only structural freedom was cell count — one dimension with a saturating
  // payoff. This checks that descendants actually explore different graphs, and
  // that none of them fragments: a body IS a connected component of the bond
  // graph, so a disconnected one is not a body at all.
  const sim = await setup({ cap: 600, start: 200 });
  for (let t = 0; t < 25; t++) { sim.world.step(250); await sim.evo.tick(t * 250); }

  const { bond, bondK } = sim.cells;
  const shapes = new Set();
  let bodies = 0, disconnected = 0, degreeSum = 0, cellCount = 0;

  for (let o = 0; o < sim.arena.P; o++) {
    if (!sim.arena.alive[o]) continue;
    bodies++;
    const off = sim.arena.off[o], n = sim.arena.cnt[o];
    const adj = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < bondK; k++) {
        const j = bond[(off + i) * bondK + k];
        if (j < 0) continue;
        const rel = j - off;
        assert(rel >= 0 && rel < n, `body ${o} has a bond leaving its own cells`);
        adj[i].push(rel);
      }
      degreeSum += adj[i].length; cellCount++;
    }
    // connectivity
    const seen = new Uint8Array(n); const st = [0]; seen[0] = 1; let reached = 1;
    while (st.length) {
      const i = st.pop();
      for (const j of adj[i]) if (!seen[j]) { seen[j] = 1; reached++; st.push(j); }
    }
    if (reached < n) disconnected++;
    // a cheap shape signature: sorted degree sequence
    shapes.add(adj.map(a => a.length).sort().join(','));
  }

  assertEquals(disconnected, 0, `${disconnected} of ${bodies} bodies fragmented`);
  assert(shapes.size > 5,
    `only ${shapes.size} distinct body plans among ${bodies} bodies — topology is not evolving`);
  const meanDeg = degreeSum / cellCount;
  assert(meanDeg > 1.2 && meanDeg < bondK,
    `mean degree ${meanDeg.toFixed(2)} looks degenerate`);
});

gpuTest('evolved bodies stay geometrically satisfiable, not frustrated tangles', async () => {
  // A graph whose edges all want the same rest length must be embeddable in the
  // plane at that length, or the body can never satisfy its own bonds and sits
  // stretched forever. Joining arbitrary cell pairs produces exactly that: on a
  // long run the median bond reached 4.7x its rest length with a tail at 56x,
  // while the springs were beating flow drag by three orders of magnitude. The
  // stretch was never a force imbalance — it was a graph with no solution.
  //
  // HONEST LIMIT OF THIS TEST: it does NOT catch that regression. Checked by
  // reintroducing arbitrary-pair bonding, and this still passes — the
  // frustration needs thousands of ticks of accumulated topology mutation to
  // show, and the live server had run ~7000 when it became visible. What this
  // guards is the weaker invariant that bodies relax at a short horizon, which
  // catches gross breakage in the spring law or the repair. Catching the slow
  // version needs tools/shape-report.js against a long run, not a unit test.
  const sim = await setup({ cap: 600, start: 200 });
  for (let t = 0; t < 45; t++) { sim.world.step(250); await sim.evo.tick(t * 250); }

  const { x, y } = await sim.world.readPositions();
  const { bond, brest, bondK } = sim.cells;
  const b = sim.bound;
  const lens = [];
  for (let i = 0; i < x.length; i++) {
    if (sim.cells.ctype[i] < 0) continue;
    for (let k = 0; k < bondK; k++) {
      const j = bond[i * bondK + k];
      if (j < 0 || sim.cells.ctype[j] < 0) continue;
      let dx = x[j] - x[i], dy = y[j] - y[i];
      if (Math.abs(dx) > b) dx -= Math.sign(dx) * 2 * b;
      if (Math.abs(dy) > b) dy -= Math.sign(dy) * 2 * b;
      lens.push(Math.hypot(dx, dy) / Math.max(brest[i * bondK + k], 1e-6));
    }
  }
  assert(lens.length > 100, 'not enough bonds to judge');
  lens.sort((p, q) => p - q);
  const median = lens[lens.length >> 1];
  const p90 = lens[Math.floor(lens.length * 0.9)];
  assert(median < 2.0, `median bond is ${median.toFixed(1)}x its rest length — bodies are frustrated`);
  assert(p90 < 6.0, `p90 bond is ${p90.toFixed(1)}x its rest length — bodies are frustrated`);
  sim.world.destroy(); sim.brains.destroy();
});
