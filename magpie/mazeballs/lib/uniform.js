/**
 * One declaration of the world's uniform block, from which both the WGSL struct
 * and the JS writer are generated.
 *
 * This exists because the two were maintained by hand and drifted. A field once
 * called `bodyCells` was renamed away, but its writer line survived as
 * `setUint32(92, p.bodyCells)` — and offset 92 had since become `contactK`, the
 * soft-sphere repulsion stiffness. The u32 12 sitting in those four bytes reads
 * as the f32 1.68e-44: positive, so the `contactK <= 0` guard never tripped, and
 * every contact force in the world was multiplied by a denormal. Cells did not
 * collide, for the entire life of the code, and nothing anywhere reported an
 * error. A DataView offset is just a number; there is no type to disagree with.
 *
 * Generating both sides from this table means an offset cannot be wrong, because
 * nobody writes one. Adding, removing or reordering a field moves the struct and
 * the writer together or not at all. `writeUniform` additionally refuses to
 * publish a block containing a missing or non-finite value, which is the other
 * half of the same bug: `contactK` had no default anywhere and nothing noticed.
 *
 * std140-ish rule that applies here: a struct of scalars packs tightly at 4-byte
 * stride, and the block is rounded up to 16. The blank lines in the old hand-
 * written struct were cosmetic grouping, not padding, and are reproduced as such.
 */

/** [name, type, comment] — declaration order IS memory order. */
export const WORLD_FIELDS = [
  ['nCells', 'u32', 'how many cell slots exist'],
  ['bondK', 'u32', 'bond slots per cell'],
  ['dt', 'f32', 'seconds per step'],
  ['flowScale', 'f32', 'spatial frequency of the flow field'],

  ['flowStr', 'f32', 'how hard the medium pushes'],
  ['drag', 'f32', 'coupling to the medium'],
  ['springK', 'f32', 'bond stiffness'],
  ['contract', 'f32', 'how far a muscle shortens its bonds'],

  ['seed', 'u32', 'flow field seed'],
  ['senseGain', 'f32', 'sensor sensitivity'],
  ['damp', 'f32', 'velocity damping'],
  ['bound', 'f32', 'half-width of the torus'],

  ['bondDamp', 'f32', 'bond velocity damping'],
  ['harvest', 'f32', 'energy gained per unit resource per second'],
  ['brainTax', 'f32', 'energy a cell costs just by existing and thinking'],
  ['muscleCost', 'f32', 'energy a muscle spends in proportion to work done'],

  ['resScale', 'f32', 'spatial frequency of the fertility field'],
  ['resSeed', 'u32', 'fertility field seed'],
  ['eCap', 'f32', 'most energy one cell can hold'],
  ['eFloor', 'f32', 'most debt one cell can run up before it is simply dead'],

  ['hashCell', 'f32', 'spatial-hash query radius, world units'],
  ['hashSize', 'u32', 'buckets in the cell hash'],
  ['crowdK', 'f32', 'how sharply a shared patch is discounted'],
  ['contactK', 'f32', 'soft-sphere repulsion stiffness; 0 disables contact'],

  ['bucketM', 'u32', 'neighbour slots listed per bucket'],
  ['contestRate', 'f32', 'energy moved on contact per unit of effort difference, per second'],
  ['contactR', 'f32', 'how close counts as contact'],
  ['sizeScale', 'f32', 'unused; retained so the block layout is stable'],

  ['sizeNorm', 'f32', 'unused; retained so the block layout is stable'],
  ['worldTime', 'f32', 'seconds; the fertility field is a function of it'],
  ['driftX', 'f32', 'fertility field drift'],
  ['driftY', 'f32', 'fertility field drift'],

  ['morphRate', 'f32', 'how fast the terrain becomes a different terrain'],
  ['gripBase', 'f32', 'traction every cell has, before modulation'],
  ['gripMod', 'f32', 'how far activation may raise or lower a cell grip'],
  ['fricK', 'f32', 'Coulomb velocity decrement per unit grip per second'],

  ['gripAnchor', 'f32', 'an ANCHOR cell grip: a sucker, not a skin'],
  ['nMotes', 'u32', 'how many standing-crop motes exist'],
  ['moteR', 'f32', 'how far a cell can reach to graze a mote'],
  ['grazeRate', 'f32', 'stock one cell draws from one mote per second'],

  ['moteRegrow', 'f32', 'solar inflow: stock a mote regains per second at full fertility'],
  ['moteCap', 'f32', 'the most stock one mote can hold'],
  ['moteHashSize', 'u32', 'buckets in the mote hash'],
  ['gritScale', 'f32', 'spatial frequency of the substrate grit field'],

  ['gritSeed', 'u32', 'grit field seed'],
  ['slipBase', 'f32', 'drag a cell feels on frictionless ground'],
  ['gripAniso', 'f32', 'how much harder sideways slip is than along-axis slip'],
  ['regrowCrowdK', 'f32', 'how sharply local crowding suppresses regrowth'],

  // Imposed travelling wave. A DIAGNOSTIC, not a world parameter: it drives
  // muscles from sin(axial*k - omega*t) instead of from the brain, so a body
  // plan can be tested for whether it CAN locomote independently of whether
  // its controller does. waveAmp 0 is off and is the shipped world.
  ['waveAmp', 'f32', 'imposed-wave drive amplitude; 0 = off (brain drives)'],
  ['waveK', 'f32', 'imposed-wave spatial frequency along the body axis'],
  ['waveOmega', 'f32', 'imposed-wave angular frequency, rad/s'],
  ['wavePhase', 'f32', 'phase offset of the GRIP wave against the muscle wave'],

  // How much grip anchors a cell against motion in ANY direction, as opposed
  // to gripAniso which only resists sideways slip. See the traction block.
  ['gripHold', 'f32', 'grip resistance to translation along the body axis too'],
];

/** Byte offset of each field, and the total block size rounded up to 16. */
export function layout(fields = WORLD_FIELDS) {
  const off = new Map();
  fields.forEach(([name], i) => off.set(name, i * 4));
  return { off, size: Math.ceil(fields.length * 4 / 16) * 16 };
}

/** The WGSL struct declaration, blank-line grouped in fours as written above. */
export function wgslStruct(name = 'W', fields = WORLD_FIELDS) {
  const w = Math.max(...fields.map(([n]) => n.length));
  const lines = fields.map(([n, t, c], i) => {
    const body = `  ${n.padEnd(w)} : ${t},`;
    const line = c ? `${body}   // ${c}` : body;
    return i > 0 && i % 4 === 0 ? `\n${line}` : line;
  });
  return `struct ${name} {\n${lines.join('\n')}\n};`;
}

/**
 * Write a value object into an ArrayBuffer according to the table.
 *
 * Throws on a missing or non-finite field rather than publishing it. A uniform
 * block is the one place where a bad number is completely silent: the shader
 * reads whatever bytes are there, produces plausible-looking output, and the
 * only symptom is that some physics quietly does nothing.
 */
export function writeUniform(values, fields = WORLD_FIELDS) {
  const { size } = layout(fields);
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const bad = [];
  fields.forEach(([name, type], i) => {
    const v = values[name];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      if (name.startsWith('pad')) { dv.setFloat32(i * 4, 0, true); return; }
      bad.push(`${name}=${v === undefined ? 'missing' : v}`);
      return;
    }
    if (type === 'u32') dv.setUint32(i * 4, v, true);
    else dv.setFloat32(i * 4, v, true);
  });
  if (bad.length) {
    throw new Error(`uniform block would be published with bad values: ${bad.join(', ')}`);
  }
  return buf;
}
