/**
 * The category-free ancestral tournament — the "is it still climbing?" instrument.
 *
 * WHY THE OTHER MEASURES CANNOT ANSWER THIS. Every absolute measure used so far
 * has a ceiling built into it. Mean resource under cells cannot exceed the best
 * ground in the field. Body size cannot exceed the cap, and its payoff saturates
 * before that. So when one of them flattens, there are two indistinguishable
 * explanations — adaptation stopped, or the measure ran out of room — and the
 * flattening looks identical either way. Reading a plateau in a bounded measure
 * as "evolution stopped" is a mistake about the ruler, not a finding.
 *
 * This measure has no ceiling because it is RELATIVE. Freeze the genomes alive
 * at time T1 and at time T2, drop equal numbers of both into the same fresh
 * neutral world, and see which captures more energy and leaves more descendants.
 * Nothing is scored against a fixed scale; a later population is measured
 * against the one it descended from. If T2 beats T1, and T3 beats T2, that is
 * ongoing adaptation whatever the absolute numbers are doing.
 *
 * It is also the only comparison WORLD.md permits. There are no species here to
 * compare, and no fitness function to consult — only energy captured and who
 * divided from whom, both of which are physical facts. The tournament asks a
 * question the world can actually answer: put these two lineages in the same
 * place under the same conditions, and see what happens.
 *
 * WHAT A FAIR TOURNAMENT REQUIRES, and each of these is a way to get it wrong:
 *   - The world must be NEW, not the one either side evolved in, or the later
 *     genomes are simply being tested at home.
 *   - Both sides must start at equal number and equal energy.
 *   - Starting positions must be interleaved, not segregated, or the result
 *     measures which half of the map is richer.
 *   - Neither side may be the incumbent: the arena is built from scratch.
 */
import { BrainArena } from './brainarena.js';
import { BrainArenaGPU } from './brainarena_gpu.js';
import { WorldGPU } from './world_gpu.js';
import { Evolver } from './evolve.js';

/**
 * Freeze every living organism's genome.
 *
 * A genome here is what descent actually copies: the body's cell count and cell
 * types, and the brain's per-neuron dynamics and full edge table. Position,
 * velocity and energy are NOT part of it — they are where a body happened to be,
 * not what it is.
 */
export function archive(arena, cells, label = '') {
  const pool = [];
  for (let o = 0; o < arena.P; o++) {
    if (!arena.alive[o]) continue;
    const n = arena.cnt[o], off = arena.off[o], K = arena.K;
    const g = {
      n,
      bias: Float32Array.from(arena.bias.subarray(off, off + n)),
      invTau: Float32Array.from(arena.invTau.subarray(off, off + n)),
      ctype: Int32Array.from(cells.ctype.subarray(off, off + n)),
      esrc: new Int32Array(n * K),
      ew: Float32Array.from(arena.ew.subarray(off * K, (off + n) * K)),
    };
    // Store edges island-RELATIVE so a genome is independent of where it lived.
    for (let i = 0; i < n * K; i++) {
      const s = arena.esrc[off * K + i];
      g.esrc[i] = s < 0 ? -1 : s - off;
    }
    pool.push(g);
  }
  return { label, pool, K: arena.K };
}

/** Deterministic PRNG, so a tournament is a pure function of its seed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Build one world containing `perSide` genomes from each pool, interleaved.
 * Returns the built world plus which side each organism slot came from.
 */
function buildMixed(poolA, poolB, { perSide, bound, seed, bondK = 4 }) {
  const r = rng(seed);
  const pick = (pool) => pool.pool[(r() * pool.pool.length) | 0];

  // Alternate sides so neither gets a contiguous region of the map.
  const chosen = [];
  for (let i = 0; i < perSide; i++) {
    chosen.push({ side: 0, g: pick(poolA) });
    chosen.push({ side: 1, g: pick(poolB) });
  }

  const K = poolA.K;
  const totalCells = chosen.reduce((s, c) => s + c.g.n, 0);
  const arena = new BrainArena({ neurons: totalCells, degree: K, organisms: chosen.length });

  const px = new Float32Array(totalCells), py = new Float32Array(totalCells);
  const vx = new Float32Array(totalCells), vy = new Float32Array(totalCells);
  const ctype = new Int32Array(totalCells), cslot = new Int32Array(totalCells).fill(-1);
  const body = new Int32Array(totalCells).fill(-1);
  const bodySize = new Int32Array(totalCells);
  const bond = new Int32Array(totalCells * bondK).fill(-1);
  const brest = new Float32Array(totalCells * bondK);
  const sideOf = new Int32Array(chosen.length).fill(-1);

  const addBond = (from, to, rest) => {
    const base = from * bondK;
    for (let k = 0; k < bondK; k++)
      if (bond[base + k] === -1) { bond[base + k] = to; brest[base + k] = rest; return; }
  };

  for (const { side, g } of chosen) {
    const o = arena.birth(g.n);
    if (o < 0) break;
    sideOf[o] = side;
    const off = arena.off[o];

    // Both sides are scattered over the WHOLE world from the same generator, so
    // no side gets a better neighbourhood than the other.
    const cx = (r() * 2 - 1) * bound * 0.9, cy = (r() * 2 - 1) * bound * 0.9;
    const spin = r() * Math.PI * 2;

    for (let i = 0; i < g.n; i++) {
      const gi = off + i;
      const a = spin + (i / g.n) * Math.PI * 2;
      const rad = 1.1 * (0.9 + r() * 0.2);
      px[gi] = cx + Math.cos(a) * rad; py[gi] = cy + Math.sin(a) * rad;
      ctype[gi] = g.ctype[i];
      body[gi] = o; bodySize[gi] = g.n;
      cslot[gi] = arena.bindCell(o, i, gi);
      arena.bias[gi] = g.bias[i];
      arena.invTau[gi] = g.invTau[i];
    }
    for (let i = 0; i < g.n; i++) {
      for (let k = 0; k < K; k++) {
        const s = g.esrc[i * K + k];
        arena.esrc[(off + i) * K + k] = s < 0 ? -1 : off + s;
        arena.ew[(off + i) * K + k] = g.ew[i * K + k];
      }
    }
    for (let i = 0; i < g.n; i++) {
      const gi = off + i, gj = off + ((i + 1) % g.n);
      const rest = Math.hypot(px[gi] - px[gj], py[gi] - py[gj]);
      addBond(gi, gj, rest); addBond(gj, gi, rest);
    }
    if (g.n >= 6) {
      const gi = off, gj = off + (g.n >> 1);
      const rest = Math.hypot(px[gi] - px[gj], py[gi] - py[gj]);
      addBond(gi, gj, rest); addBond(gj, gi, rest);
    }
  }

  return {
    arena, sideOf,
    cells: { px, py, vx, vy, ctype, cslot, body, bodySize, bond, brest, bondK },
    meta: { nCells: totalCells, bound },
  };
}

/**
 * Run poolA against poolB in a fresh neutral world.
 *
 * @returns {object} energy captured and descendants left, per side. A side wins
 *          on descendants — leaving more copies of yourself is what selection
 *          actually is; energy is reported alongside because it is the currency
 *          descendants are bought with, and the two disagreeing is informative.
 */
export async function tournament(poolA, poolB, {
  perSide = 150, bound = 46, seed = 99, steps = 20000, tickEvery = 250, worldParams = {},
} = {}) {
  const built = buildMixed(poolA, poolB, { perSide, bound, seed });
  const brains = await BrainArenaGPU.create(built.arena);
  const world = new WorldGPU(brains, built.cells, { bound, seed: seed * 7 + 1, ...worldParams });
  const evo = new Evolver({
    arena: built.arena, world, cells: built.cells,
    seed, birthEnergy: 18, deathEnergy: 0,
  });

  // Carry each founder's side down its lineage, so a descendant counts for the
  // pool it came from. This is descent doing the bookkeeping, not a label.
  const side = Int32Array.from(built.sideOf);

  let energyA = 0, energyB = 0;
  for (let t = 0; t * tickEvery < steps; t++) {
    world.step(tickEvery);
    const before = new Int32Array(built.arena.P);
    for (let o = 0; o < built.arena.P; o++) before[o] = built.arena.alive[o] ? 1 : 0;

    await evo.tick(t * tickEvery);

    // Newly born slots inherit their parent's side.
    for (const h of evo.history) {
      if (h.step !== t * tickEvery) continue;
      const parentSlot = evo.parent[h.slot];
      if (parentSlot >= 0 && side[parentSlot] >= 0) side[h.slot] = side[parentSlot];
    }

    const { energy } = await world.readCells();
    for (let o = 0; o < built.arena.P; o++) {
      if (!built.arena.alive[o] || side[o] < 0) continue;
      let e = 0;
      for (let i = built.arena.off[o]; i < built.arena.off[o] + built.arena.cnt[o]; i++) e += energy[i];
      if (side[o] === 0) energyA += e; else energyB += e;
    }
  }

  let aliveA = 0, aliveB = 0, cellsA = 0, cellsB = 0;
  for (let o = 0; o < built.arena.P; o++) {
    if (!built.arena.alive[o] || side[o] < 0) continue;
    if (side[o] === 0) { aliveA++; cellsA += built.arena.cnt[o]; }
    else { aliveB++; cellsB += built.arena.cnt[o]; }
  }

  world.destroy(); brains.destroy();
  return {
    a: poolA.label, b: poolB.label,
    descendantsA: aliveA, descendantsB: aliveB,
    cellsA, cellsB,
    energyA: +energyA.toFixed(1), energyB: +energyB.toFixed(1),
    // Share of the surviving population, which is the honest summary: 0.5 is a
    // tie, above 0.5 means B displaced A.
    shareB: (aliveA + aliveB) ? +(aliveB / (aliveA + aliveB)).toFixed(3) : 0.5,
  };
}
