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
import { resourceField } from './field_cpu.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());
const gpuTest = (name, fn) => Deno.test({ name, ignore: !HAS_GPU, fn });

async function setup({ cap = 400, start = 120, cells = 12, bound = null, maxCells = 60 } = {}) {
  // Bound DERIVED from how much tissue the world will actually hold, so density
  // stays constant whatever a test asks for. A fixed bound was tuned when every
  // body was 12 cells; development builds ~35, so the same number silently
  // tripled the crowding and bodies were pressed through one another hard enough
  // to stretch bonds past 3x rest.
  bound = bound ?? Math.sqrt(cap * 35 / 0.5) / 2;
  // Sized for DEVELOPED bodies. These numbers were chosen when every creature
  // was a 12-cell ring; development routinely builds 35, so the old bound of 34
  // held three times the tissue it was tuned for. Bodies were pressed into each
  // other hard enough to stretch bonds to 3x rest and tear a few apart, and the
  // arena — never given maxCells — fragmented as well. Both showed up as body
  // integrity failures that were really a world too small for its inhabitants.
  const built = buildBodies({ beasts: cap, cells, bound, seed: 11, maxCells });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound });
  const evo = new Evolver({
    arena: built.arena, world, cells: built.cells, seed: 3,
    birthEnergy: 18, deathEnergy: 0, maxCells,
  });
  for (let o = start; o < cap; o++) evo.cull(o);
  evo.founders = evo.alive();
  return { ...built, brains, world, evo, bound };
}

// The resource field comes from lib/field_cpu.js, which is checked against the
// real WGSL by field_cpu_test.js. This file used to hand-copy the noise
// function, with nothing connecting the copy to the original — exactly the
// duplicate-that-drifts problem, and it would have drifted silently.
const resourceAt = (x, y, scale, seed) => resourceField(x, y, scale, seed);

/**
 * Mean fertility at randomly scattered points in the same field — the spatial
 * null. Comparing a run against its own starting value assumes the founders
 * were placed representatively; comparing against fresh random draws does not.
 */
function randomGroundMean(sim, n = 20000) {
  const { resScale, resSeed } = sim.world.params;
  let s = 0, sd = 20260804;
  const rnd = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    s += resourceAt((rnd() * 2 - 1) * sim.bound, (rnd() * 2 - 1) * sim.bound, resScale, resSeed);
  }
  return s / n;
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
  // Long enough for a GRANDCHILD. Under development a hatchling starts on
  // whatever the yolk did not spend building it, so it takes appreciably longer
  // to reach breeding condition than the old copy-the-parent path, where a
  // child appeared fully formed. At the previous 8 ticks every birth in the log
  // still had a founder for a parent and the descent check had nothing to
  // verify.
  for (let t = 0; t < 30; t++) { sim.world.step(300); await sim.evo.tick(t * 300); }

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
  const nullMean = randomGroundMean(sim);

  assert(sim.evo.alive() > 20, `population died out (${sim.evo.alive()} left)`);
  // THE EFFECT SIZE CHANGED, because the world did. This asked for a 15% lift in
  // mean fertility under cells, which a never-depleting analytic field could
  // deliver: rich ground stayed rich however many mouths found it, so the
  // population piled onto it without limit. Grazeable stock cannot. A patch is
  // drawn down as it is occupied until it is worth no more than anywhere else,
  // which is the ideal free distribution, and the equilibrium it produces is a
  // population spread almost evenly across fertility. Measured lift is now ~2%.
  //
  // So the old assertion was reading a 15% signal out of an artefact. What
  // survives is the weaker true claim: cells sit on better ground than randomly
  // scattered points do, tested against a spatial null in the SAME field rather
  // than against the run's own starting value.
  assert(after > nullMean,
    `no selection: fertility under cells ${after.toFixed(4)} vs random ground ` +
    `${nullMean.toFixed(4)} (run started at ${before.toFixed(4)})`);
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
  // A SECOND HONEST LIMIT, and an open problem. A developed body ALONE holds at
  // exactly 1.00 for 30,000 steps under every combination of muscles, flow and
  // contact. In a population it settles near 1.45. Ruled out by measurement:
  // muscle contraction, flow drag, soft-sphere contact and predation (all
  // disabled, effect persists); asymmetric bonds (the written table is symmetric
  // in both direction and rest length, checked exhaustively); bad geometry at
  // birth (CPU data is 1.00 at every yolk size, and freshly born bodies read
  // 1.00 on the GPU too). With every inter-body force off there is no known
  // mechanism left, and the expansion still happens. It is slow, it saturates
  // rather than running away, and bodies stay connected — so it is a real defect
  // being tolerated, not one that has been explained. These thresholds are set
  // from measurement and are deliberately loose enough to admit it.
  assert(median < 2.0, `median bond is ${median.toFixed(1)}x its rest length — bodies are frustrated`);
  assert(p90 < 8.0, `p90 bond is ${p90.toFixed(1)}x its rest length — bodies are frustrated`);
  sim.world.destroy(); sim.brains.destroy();
});

Deno.test('the arena is sized for the bodies evolution can reach, not the ones it starts with', () => {
  // The arena allocates n CONTIGUOUS neuron slots per body, and body size is
  // heritable — a run starting at 12 cells reaches 30-47. An arena sized
  // beasts*12 then fails by EXTERNAL FRAGMENTATION rather than cleanly:
  // measured before the fix, 3325 slots free (12.5% of the arena) across 259
  // holes whose largest was 30, against a mean body of 32. Every birth failed,
  // generations froze at 57, and the population sat there looking healthy while
  // evolution had stopped. Silent failure is what made it dangerous — it
  // invalidated every ascent measurement taken after bodies grew.
  //
  // Driven directly rather than by waiting for evolution to grow bodies, which
  // takes hundreds of ticks and would make this a slow test of the same fact.
  const built = buildBodies({ beasts: 60, cells: 12, maxCells: 40, bound: 20, seed: 4 });
  const { arena } = built;
  assertEquals(arena.N, 60 * 40, 'arena is not sized for the largest evolvable body');
  assert(built.cells.px.length === arena.N, 'per-cell arrays do not span the arena');
  assert(built.cells.bond.length === arena.N * built.cells.bondK, 'bond array does not span the arena');

  // Free every founder, then churn with mixed sizes to fragment the free list,
  // and require that a maximum-size body can still be born throughout.
  for (let o = 0; o < 60; o++) { arena.death(o); }
  let born = 0;
  for (let round = 0; round < 40; round++) {
    const sizes = [40, 5, 33, 12, 27];
    const made = [];
    for (const n of sizes) {
      const o = arena.birth(n);
      if (o >= 0) { made.push(o); born++; }
    }
    // Kill every other one, which is what leaves scattered holes.
    for (let i = 0; i < made.length; i += 2) arena.death(made[i]);
  }
  assert(born > 150, `only ${born} births succeeded across the churn`);
  const big = arena.birth(40);
  assert(big >= 0,
    `a maximum-size body could not be born after churn — free list is ` +
    JSON.stringify(arena.free.map(h => h[1]).sort((a, b) => b - a).slice(0, 5)));
});
