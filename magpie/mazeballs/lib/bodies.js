/**
 * Builds bodies: bonded cell clusters whose cells ARE the brain's neurons.
 *
 * This is the join between lib/brainarena.js (which knows about slots) and
 * lib/world_gpu.js (which knows about positions and bonds). A creature here is
 * a ring of cells held by division bonds, each cell bound to exactly one neuron
 * slot in its organism's island — so `cell[slot]` and `cslot[cell]` are two
 * directions of one relation, and neither side has to guess.
 *
 * Nothing about "creature" is a primitive: a body is just a connected component
 * of the bond graph, and the ring is only how THIS builder happens to place
 * cells. Types are a per-cell tag selecting which kernel touches it — sensors
 * write their brain's input, muscles contract their bonds — not a role knob
 * setting behaviour. What the muscle does is whatever its neuron's activation
 * says, which is whatever the wiring evolved to say.
 *
 * The wiring is random here. That is deliberate: this builds a POPULATION for
 * the physics and rendering to run at scale, not an evolved one. Evolution
 * mutates these weights; it does not need a different body builder.
 */
import { BrainArena } from './brainarena.js';
import { CELL_NEURON, CELL_SENSOR, CELL_MUSCLE } from './world_gpu.js';

/**
 * @param {object} o
 * @param {number} [o.beasts=2000]     how many bodies
 * @param {number} [o.cells=12]        cells per body (= neurons per brain)
 * @param {number} [o.degree=12]       incoming brain edges per neuron
 * @param {number} [o.bondK=4]         bond slots per cell
 * @param {number} [o.radius=1.1]      body radius in world units
 * @param {number} [o.bound=64]        world half-extent; bodies scatter inside it
 * @param {number} [o.seed=1]
 * @returns {{arena: BrainArena, cells: object, meta: object}}
 */
export function buildBodies({
  beasts = 2000, cells = 12, degree = 12, bondK = 4,
  radius = 1.1, bound = 64, seed = 1, dt = 0.015,
} = {}) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

  const nCells = beasts * cells;
  const arena = new BrainArena({
    neurons: nCells, degree, organisms: beasts, dt,
  });

  const px = new Float32Array(nCells), py = new Float32Array(nCells);
  const vx = new Float32Array(nCells), vy = new Float32Array(nCells);
  // Int32, not Uint32: -1 is a meaningful value here — it marks a cell that has
  // been vacated by death and is no longer part of the world. In a Uint32Array
  // that sentinel silently becomes 4294967295 on the CPU side while the GPU,
  // reading the same bytes as i32, sees -1. Two views disagreeing about whether
  // a cell is alive is exactly the kind of bug that hides.
  const ctype = new Int32Array(nCells), cslot = new Int32Array(nCells).fill(-1);
  // Which body each cell belongs to. Not a category — an identity, the same
  // fact the bond graph already encodes as a connected component, cached so a
  // cell can tell its own tissue from a stranger's in one comparison.
  const body = new Int32Array(nCells).fill(-1);
  // How many cells this cell's body has. Carried per cell because the shader
  // has no way to look up an organism's size, and it must not be a constant:
  // body size is heritable now.
  const bodySize = new Int32Array(nCells);
  const bond = new Int32Array(nCells * bondK).fill(-1);
  const brest = new Float32Array(nCells * bondK);

  for (let b = 0; b < beasts; b++) {
    const o = arena.birth(cells);
    if (o < 0) throw new Error('arena too small for the requested population');

    const cx = (rnd() * 2 - 1) * bound * 0.92;
    const cy = (rnd() * 2 - 1) * bound * 0.92;
    const spin = rnd() * Math.PI * 2;
    const base = b * cells;

    for (let i = 0; i < cells; i++) {
      const gi = base + i;
      const a = spin + (i / cells) * Math.PI * 2;
      // A ring, slightly jittered so no two bodies are identical and the spring
      // network has something to relax from.
      const r = radius * (0.85 + rnd() * 0.3);
      px[gi] = cx + Math.cos(a) * r;
      py[gi] = cy + Math.sin(a) * r;

      // Thirds: sensors feel the medium, muscles contract bonds, the rest are
      // interneurons. Every one of them is a CTRNN node in the same island.
      ctype[gi] = i % 3 === 0 ? CELL_SENSOR : (i % 3 === 1 ? CELL_MUSCLE : CELL_NEURON);
      body[gi] = o;
      bodySize[gi] = cells;
      cslot[gi] = arena.bindCell(o, i, gi);          // both directions of one relation
      arena.setNeuron(o, i, {
        tau: 0.24 + rnd() * 1.65,                    // evodevo.js's evolved range
        bias: rnd() * 1.2 - 0.6,
      });
    }

    // Ring bonds (i <-> i+1), stored BOTH ways so the spring force each cell
    // gathers is symmetric without any cross-thread write.
    for (let i = 0; i < cells; i++) {
      const gi = base + i, gj = base + ((i + 1) % cells);
      const rest = Math.hypot(px[gi] - px[gj], py[gi] - py[gj]);
      addBond(bond, brest, bondK, gi, gj, rest);
      addBond(bond, brest, bondK, gj, gi, rest);
    }
    // One chord across the ring per body, so it has some rigidity and does not
    // collapse into a line the moment a muscle pulls.
    if (cells >= 6) {
      const gi = base, gj = base + (cells >> 1);
      const rest = Math.hypot(px[gi] - px[gj], py[gi] - py[gj]);
      addBond(bond, brest, bondK, gi, gj, rest);
      addBond(bond, brest, bondK, gj, gi, rest);
    }

    // Random recurrent wiring inside the island. connect() takes island-relative
    // indices, so a cross-body synapse cannot be expressed here even by mistake.
    for (let to = 0; to < cells; to++)
      for (let k = 0; k < degree; k++)
        if (rnd() < 0.45)
          arena.connect(o, (rnd() * cells) | 0, to, (rnd() * 2 - 1) * 1.6, k);

    arena.state[arena.off[o]] = rnd() * 0.6 - 0.3;    // break symmetry
  }

  return {
    arena,
    cells: { px, py, vx, vy, ctype, cslot, body, bodySize, bond, brest, bondK },
    meta: { beasts, cellsPerBeast: cells, nCells, degree, bound },
  };
}

function addBond(bond, brest, bondK, from, to, rest) {
  const base = from * bondK;
  for (let k = 0; k < bondK; k++) {
    if (bond[base + k] === -1) { bond[base + k] = to; brest[base + k] = rest; return true; }
  }
  return false;                                       // out of bond slots; body stays sparser
}
