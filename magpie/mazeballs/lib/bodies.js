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
import { CELL_NEURON, CELL_SENSOR, CELL_MUSCLE, CELL_ANCHOR } from './world_gpu.js';

/**
 * @param {object} o
 * @param {number} [o.beasts=2000]     how many bodies
 * @param {number} [o.cells=12]        cells per body (= neurons per brain)
 * @param {number} [o.degree=12]       incoming brain edges per neuron
 * @param {number} [o.bondK=4]         bond slots per cell
 * @param {number} [o.radius=1.1]      body radius in world units
 * @param {number} [o.cellR=0.34]      radius of one cell — what contact measures
 * @param {number} [o.bound=64]        world half-extent; bodies scatter inside it
 * @param {number} [o.seed=1]
 * @returns {{arena: BrainArena, cells: object, meta: object}}
 */
export function buildBodies({
  beasts = 2000, cells = 12, degree = 12, bondK = 4,
  radius = 1.1, cellR = 0.34, bound = 64, seed = 1, dt = 0.015,
  maxCells = 40,
} = {}) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

  // SIZE THE ARENA FOR THE BODIES EVOLUTION CAN PRODUCE, not for the ones it
  // starts with.
  //
  // Body size is heritable, so a run that starts at 12 cells reaches 32, and an
  // arena of beasts*12 slots then cannot hold them. What happens next is not a
  // clean "arena full" — it is EXTERNAL FRAGMENTATION. birth() needs n
  // CONTIGUOUS slots, and after enough churn the free space is scattered:
  // measured at 3325 slots free (12.5% of the arena) across 259 holes whose
  // largest was 30, against a mean body of 32. Nothing fits, every birth fails,
  // and evolution stops dead — generations frozen at 57 while the population
  // sits there looking healthy. It is silent, and it invalidated every ascent
  // measurement in this wave once bodies outgrew their starting size.
  const nCells = beasts * cells;
  const arena = new BrainArena({
    neurons: beasts * Math.max(cells, maxCells), degree, organisms: beasts, dt,
  });

  // Every per-cell array spans the ARENA, not the starting population. The
  // arena is sized for the largest bodies evolution can reach, and a body
  // allocated near its end writes at that offset — arrays sized for the initial
  // beasts*cells simply overrun.
  const NC = arena.N;
  const px = new Float32Array(NC), py = new Float32Array(NC);
  const vx = new Float32Array(NC), vy = new Float32Array(NC);
  const rad = new Float32Array(NC);
  // Int32, not Uint32: -1 is a meaningful value here — it marks a cell that has
  // been vacated by death and is no longer part of the world. In a Uint32Array
  // that sentinel silently becomes 4294967295 on the CPU side while the GPU,
  // reading the same bytes as i32, sees -1. Two views disagreeing about whether
  // a cell is alive is exactly the kind of bug that hides.
  const ctype = new Int32Array(NC).fill(-1), cslot = new Int32Array(NC).fill(-1);
  // CONTINUOUS MATERIAL PROPERTIES, alongside the discrete label.
  //
  // `ctype` is a description read off the tissue for the kernel's benefit; the
  // capacities themselves are continuous and a cell has all of them at once.
  // Founders get 1/0 so they reproduce the old behaviour exactly, but a
  // developed cell writes its real contractility here and the kernel scales
  // force by it rather than branching on the label.
  const contractility = new Float32Array(NC), grippiness = new Float32Array(NC);
  // Which body each cell belongs to. Not a category — an identity, the same
  // fact the bond graph already encodes as a connected component, cached so a
  // cell can tell its own tissue from a stranger's in one comparison.
  const body = new Int32Array(NC).fill(-1);
  // How many cells this cell's body has. Carried per cell because the shader
  // has no way to look up an organism's size, and it must not be a constant:
  // body size is heritable now.
  const bodySize = new Int32Array(NC);
  const bond = new Int32Array(NC * bondK).fill(-1);
  const brest = new Float32Array(NC * bondK);

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
      // A cell is a sphere and this is how big it is. Until now the radius was
      // computed here for placement and thrown away, so contact had nothing to
      // measure and every cell was a point. Jittered per cell for the same
      // reason the ring is: identical bodies have nothing to relax from.
      rad[gi] = cellR * (0.85 + rnd() * 0.3);

      // Thirds: sensors feel the medium, muscles contract bonds, the rest are
      // interneurons. Every one of them is a CTRNN node in the same island.
      // Quarters, so an anchor is present from the start and evolution has
      // something to select on rather than having to invent it.
      ctype[gi] = i % 4 === 0 ? CELL_SENSOR
                : i % 4 === 1 ? CELL_MUSCLE
                : i % 4 === 2 ? CELL_ANCHOR : CELL_NEURON;
      contractility[gi] = ctype[gi] === CELL_MUSCLE ? 1 : 0;
      grippiness[gi] = ctype[gi] === CELL_ANCHOR ? 1 : 0;
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
    cells: { px, py, vx, vy, rad, ctype, cslot, body, bodySize, bond, brest, bondK,
             contractility, grippiness },
    // nCells is the ARENA width — every consumer (GPU buffers, frames, the
    // viewer) must agree on it, and it is no longer beasts*cells.
    meta: { beasts, cellsPerBeast: cells, nCells: NC, degree, bound, maxCells },
  };
}

function addBond(bond, brest, bondK, from, to, rest) {
  const base = from * bondK;
  for (let k = 0; k < bondK; k++) {
    if (bond[base + k] === -1) { bond[base + k] = to; brest[base + k] = rest; return true; }
  }
  return false;                                       // out of bond slots; body stays sparser
}
