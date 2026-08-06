/**
 * The world the brains live in — cells, bonds, flow — entirely on the GPU.
 *
 * This closes the loop that lib/brainarena_gpu.js leaves open. There, `ext` was
 * uploaded from the CPU and held constant, which forfeits the batching win the
 * moment sensing is live. Here the sense -> brain -> muscle -> move cycle runs
 * as four dispatches with nothing crossing the bus: sensor cells WRITE `ext`
 * GPU-side, the arena kernels consume it, muscle cells READ `act`, and the
 * physics moves the bodies. The CPU sees the world only when something asks —
 * a snapshot, the inspector, a log line.
 *
 * NO GRID, ANYWHERE. A cell's location is (px, py) in continuous f32, never a
 * cell index, and the flow field is not stored — it is an ANALYTIC function of
 * continuous position, evaluated per cell at its exact coordinates. `flowAt(p)`
 * is the curl of an fbm potential, which is divergence-free by construction
 * (the curl of any scalar potential is), so the flow is incompressible without
 * a projection solve and without a lattice. There is no resolution to zoom past
 * and no sampling artifact to alias: zoom in far enough and you are evaluating
 * the same smooth function at finer coordinates. This is the "continuous
 * spatial extent" commitment taken seriously rather than approximated on a fine
 * mesh.
 *
 * f32 AND WORLD SPAN. Everything here is f32 because WGSL has no f64. f32 holds
 * ~7 significant digits, and precision is RELATIVE to magnitude: at |x| ~ 1e4
 * the spacing between representable values is ~1e-3, which is far below cell
 * size and therefore invisible. That is why WORLD_SPAN below is bounded at a
 * few thousand units rather than left open — past ~1e6 the spacing exceeds a
 * cell radius and bodies would visibly quantise and interact asymmetrically.
 * A larger world than that needs region-relative coordinates (a coarse region
 * id plus a small local offset), which is a real feature, not a constant change.
 *
 * A BODY IS A BOND GRAPH. Cells are held together by persistent pair springs;
 * a "creature" is a connected component of that graph and is never declared
 * anywhere. Muscle cells work by CONTRACTING their bonds (activation shortens
 * the rest length), which is what a muscle physically is — so locomotion is a
 * consequence of body geometry deforming, not a velocity that gets assigned.
 * Bonds are fixed-degree per cell for the same reason brain edges are: a
 * ragged graph does not parallelise.
 */

import { wgslStruct, writeUniform, layout, WORLD_FIELDS } from './uniform.js';

const WORKGROUP = 256;

/**
 * Cell subtypes. A cell is a cell; these only select which kernels act on it.
 *
 * ANCHOR is a muscle of a different kind — a sucker, a holdfast, whatever the
 * flatland equivalent of a tube foot is. Where a muscle converts activation into
 * a shorter bond, an anchor converts it into GRIP on the substrate. Making it a
 * type rather than a property every cell carries is the lawful version: how much
 * of a body is given over to holding on becomes a heritable decision the genome
 * makes, and different lineages can answer it differently, instead of being a
 * constant chosen here.
 *
 * It also matters mechanically. A body that grips everywhere cannot crawl any
 * better than one that grips nowhere — locomotion needs SOME cells anchored
 * while others are dragged, and that asymmetry has to come from somewhere.
 */
export const CELL_NEURON = 0;
export const CELL_SENSOR = 1;
export const CELL_MUSCLE = 2;

/**
 * Pack a cell's label and its continuous capacities into one i32.
 *
 * Chrome caps a compute stage at 10 storage buffers and the world uses all 10,
 * so the material vector cannot have a binding of its own — see
 * device_limits_test.js, which enforces that and tells you to pack instead.
 * Type in the low 2 bits, contractility and grippiness as 8-bit fixed point.
 *
 * The sign bit is never set, so `meta.x < 0` still means "vacated slot"
 * everywhere in the shader. Dead cells are written as -1 as before.
 */

/** Body size plus the two consumption axes, into cmeta.w. Size lives in the low
 *  byte (bodies never approach 255 cells), nutrition and toughness above it. */
export function packSize(bodySize, _unusedNutrition, toughness) {
  // Nutrition is no longer stored: it is read from the cell's own energy at use
  // time. The argument is kept so callers do not silently shift their toughness
  // into the wrong byte.
  const q = (v) => Math.max(0, Math.min(255, Math.round((v || 0) * 255)));
  return (Math.max(0, Math.min(255, bodySize | 0))) | (q(toughness) << 16);
}
export function packMeta(type, contractility, grippiness, apNorm = 0.5, senseTune = 0) {
  const q = (v) => Math.max(0, Math.min(255, Math.round((v || 0) * 255)));
  // Bits 24-30: the cell's position along its own body axis, 0 head to 1 tail,
  // 7 bits. A travelling wave is a phase GRADIENT along that axis, so without
  // a per-cell axial coordinate the kernel cannot express one at all. Bit 31
  // stays clear so the '< 0' vacated-slot checks are untouched.
  const a = Math.max(0, Math.min(127, Math.round((apNorm || 0) * 127)));
  // Bits 2-7: the sensor's tuning. Magnitude is ACUITY (how much of the true
  // bearing it gets, the rest being noise); bit 7 selects which world axis it
  // reads. A cell is a north-detector or an east-detector, and how good a one
  // is a matter of degree.
  const t = senseTune || 0;
  const acu = Math.max(0, Math.min(31, Math.round(Math.abs(t) * 31)));
  const axisBit = t < 0 ? 0 : 1;
  return (type & 3) | (acu << 2) | (axisBit << 7)
       | (q(contractility) << 8) | (q(grippiness) << 16) | (a << 24);
}

export const CELL_ANCHOR = 3;

/**
 * The field itself, as WGSL, shared verbatim by the simulation and any renderer.
 *
 * Exported rather than duplicated because a renderer that draws a DIFFERENT
 * field from the one the cells swim in is a debugging trap: the picture would
 * be a plausible lie, and every reading taken from it would be wrong in a way
 * that looks fine. One definition, two consumers.
 *
 * Parameterised by explicit arguments (not a uniform) so the two callers can
 * bind whatever uniform layout suits them.
 */
export const WGSL_FIELD = /* wgsl */`
fn hash2(ix: i32, iy: i32, seed: u32) -> f32 {
  var h : u32 = (u32(ix) * 374761393u) ^ (u32(iy) * 668265263u) ^ (seed * 1274126177u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32(h ^ (h >> 16u)) / 4294967296.0;
}

fn smooth3(t: f32) -> f32 { return t * t * (3.0 - 2.0 * t); }

fn vnoise(p: vec2<f32>, seed: u32) -> f32 {
  let i = floor(p);
  let f = p - i;
  let ix = i32(i.x); let iy = i32(i.y);
  let u = smooth3(f.x); let v = smooth3(f.y);
  return mix(mix(hash2(ix, iy, seed),     hash2(ix + 1, iy, seed),     u),
             mix(hash2(ix, iy + 1, seed), hash2(ix + 1, iy + 1, seed), u), v);
}

// Band-limited fbm: the caller says how many octaves to sum.
//
// This is the level-of-detail control. Octave o has features of size 1/2^o in
// noise units; summing an octave whose features are finer than the sampling
// interval does not add detail, it adds ALIASING — which is what turns a smooth
// field into television snow when drawn zoomed out. The simulation always wants
// full detail (a cell samples at a point, so there is nothing to alias), but a
// renderer must stop at the octave that reaches its pixel size. Same function
// either way; the renderer just views a band-limited version of it, exactly as
// a mipmap does.
// The octave count is FRACTIONAL, and that matters: an integer octave count
// snaps as the camera moves, so detail pops into existence at threshold zooms
// and the world visibly changes when only the view did. A fractional count
// fades the finest octave in by weight instead, so zoom is continuous in the
// same sense position is — there is no level to cross, only a smooth increase
// in how much of the same function is being resolved.
//
// The loop bound is fixed so every invocation costs the same; octaves past the
// requested depth contribute with weight zero rather than being skipped.
fn fbmOct(p: vec2<f32>, seed: u32, octF: f32) -> f32 {
  var f = 0.0; var amp = 1.0; var norm = 0.0; var q = p;
  for (var o = 0u; o < 6u; o = o + 1u) {
    let w = clamp(octF - f32(o), 0.0, 1.0);
    f = f + amp * w * vnoise(q, seed + o * 1013u);
    norm = norm + amp * w;
    amp = amp * 0.5; q = q * 2.0;
  }
  return f / max(norm, 1e-6);
}

// The simulation always wants full detail: a cell samples the field at a POINT,
// so there is no pixel to alias against and nothing to band-limit.
fn fbm(p: vec2<f32>, seed: u32) -> f32 { return fbmOct(p, seed, 4.0); }

// Flow = curl of a scalar potential => divergence-free with no projection solve,
// and defined at EVERY real coordinate rather than on a lattice. There is no
// resolution to zoom past: finer coordinates evaluate the same smooth function.
fn flowField(p: vec2<f32>, scale: f32, strength: f32, seed: u32) -> vec2<f32> {
  let e = 0.35 / scale;
  let q = p * scale;
  let dx = fbm(q + vec2<f32>(e * scale, 0.0), seed) - fbm(q - vec2<f32>(e * scale, 0.0), seed);
  let dy = fbm(q + vec2<f32>(0.0, e * scale), seed) - fbm(q - vec2<f32>(0.0, e * scale), seed);
  return vec2<f32>(dy, -dx) * strength / (2.0 * e);
}

// Where the energy is. A static analytic field, like the flow and for the same
// reason: it is defined at every real coordinate, so a cell reads it at its
// exact position and there is no lattice to sit on. Squared to make the good
// ground scarce and patchy rather than a gentle everywhere-gradient — a fitness
// landscape needs somewhere worth being and somewhere not worth being.
// The resource field, and it MOVES.
//
// Every mechanism tried before this drew on a field that never changed, and a
// static landscape has a top: whatever the organisms are competing over —
// ground, each other, body size, body shape — the optimum sits still and can be
// reached. That is why each of them climbed and then stopped, on four
// independent axes. The environment being fixed is the premise underneath all
// four plateaus, not a property of any one of them.
//
// So the field drifts and morphs: sample points translate with time, and the
// pattern blends between two independent noise seeds. The optimum is therefore
// somewhere else tomorrow, and tracking it is a task that is never finished.
// This is still an ANALYTIC function of continuous position — now of (x, y, t)
// — so there is no stored state, no lattice, and nothing to zoom past. The
// world is non-stationary without becoming a grid.
// Parameterised by EXPLICIT arguments, like flowField above and for the same
// reason: this block is shared verbatim by the simulation and by any renderer,
// and they bind different uniform structs. An earlier version read P.worldTime
// and friends straight from the simulation's uniform, which made the whole
// shared block unparseable inside the render shader ("unresolved value 'P'")
// and took the renderer down with it. Nothing in here may name a uniform.
fn resourceField(p: vec2<f32>, scale: f32, seed: u32,
                 t: f32, drift: vec2<f32>, morphRate: f32) -> f32 {
  let q = p * scale + t * drift;
  let a = fbm(q, seed);
  let b = fbm(q, seed + 7777u);
  // Slow crossfade between two patterns: the terrain does not merely slide past,
  // it becomes a different terrain, so a lineage cannot simply learn one map.
  let w = 0.5 + 0.5 * sin(t * morphRate);
  let r = mix(a, b, w);
  return r * r;
}
`;

const SHADER = /* wgsl */`
${WGSL_FIELD}

${wgslStruct('W')}


// Positions and velocities are packed vec2, and (type, slot) into one vec2<i32>.
// Not cosmetic: WebGPU guarantees only 8 storage buffers per stage, and the
// unpacked form needed 10 — this shader would simply refuse to run on a
// conformant device. Packing also makes each cell's position one coalesced
// 8-byte load instead of two strided 4-byte ones.
@group(0) @binding(0) var<uniform>             P     : W;
@group(0) @binding(1) var<storage, read_write> pos   : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> vel   : array<vec4<f32>>;  // xy=velocity, z=radius, w=next energy
@group(0) @binding(3) var<storage, read>       cmeta : array<vec4<i32>>;  // x=packed, y=slot, z=body, w=packed

// THE MATERIAL VECTOR, PACKED INTO cmeta.x.
//
// A cell's continuous capacities live in the same i32 as its label because
// there is no room for another binding: Chrome caps the compute stage at 10
// storage buffers and the world already uses all 10 (device_limits_test
// enforces it). So: type in the low 2 bits, contractility and grippiness as
// 8-bit fixed point above them.
//
// The sign bit is never set for a live cell, so the '< 0' vacated-slot checks
// throughout this shader keep working unchanged. Max packed value is
// 0xFFFF03, comfortably positive.
//
// 8 bits is 1/255 resolution on force, which is far finer than anything the
// physics distinguishes.
fn cellType(m: i32) -> i32 { return m & 3; }
fn contractility(m: i32) -> f32 { return f32((m >> 8u) & 255) / 255.0; }
fn grippiness(m: i32) -> f32 { return f32((m >> 16u) & 255) / 255.0; }
// Position along the body axis, 0 head to 1 tail. See packMeta.
fn axialPos(m: i32) -> f32 { return f32((m >> 24u) & 127) / 127.0; }
// cmeta.w carries body size in the low byte and two material axes above it.
// NUTRITION is what a cell is worth to whatever eats it; TOUGHNESS is how hard
// it is to take. Both are continuous capacities, not labels — 'armour' and
// 'meat' are regions of this space, never types the kernel branches on.
fn bodySizeOf(w: i32) -> f32 { return f32(max(w & 255, 1)); }
// NUTRITION IS NOT A CHOICE. It was an evolved output, and selection removed it
// in thirty generations flat — seeded at 0.396, measured at 0.006 by generation
// 33 — because being edible is a pure liability with no upside. A free parameter
// for "how much am I worth eating" has exactly one evolutionary answer.
//
// It is a CONSEQUENCE. A cell is worth eating in proportion to what it is
// carrying: you cannot be simultaneously energy-rich enough to live and worthless
// as a meal, because it is the same energy. That closes the loophole and creates
// the tradeoff the arms race needs — reserves make you viable AND make you a
// target, and toughness becomes the way to hold reserves safely.
fn nutritionOf(idx: u32) -> f32 { return clamp(energy[idx] / max(0.001, P.eCap), 0.0, 1.0); }
fn toughnessOf(w: i32) -> f32 { return f32((w >> 16u) & 255) / 255.0; }
// Sensor tuning: acuity 0..1, and which world axis this cell reads.
fn senseAcuity(m: i32) -> f32 { return f32((m >> 2u) & 31) / 31.0; }
fn senseNorth(m: i32) -> bool { return ((m >> 7u) & 1) == 1; }
// bond index and rest length packed into one vec2 — WebGPU guarantees only 8
// storage buffers per stage and the crowding hash needs one, so the pair that
// is always read together shares a binding. .x holds an i32 index bitcast into
// the float slot; .y is the rest length.
// x = neighbour index (bitcast i32), y = rest length, z = stiffness multiplier,
// w = brittleness. A bond is MATERIAL, not a generic spring: stiffness comes
// from the cells it joins, so a run of stiff cells is a strut and a compliant
// cell between two stiff ones is a joint. Bone and sinew are descriptions of
// regions of this continuum rather than types the kernel branches on.
@group(0) @binding(4) var<storage, read>       bondD  : array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> ext    : array<f32>;
@group(0) @binding(6) var<storage, read>       act    : array<f32>;
@group(0) @binding(7) var<storage, read_write> energy : array<f32>;
// Spatial hash: per bucket, an occupancy count followed by up to bucketM cell
// indices. One buffer with stride (1 + bucketM) rather than two, because
// WebGPU guarantees only 8 storage buffers per stage and this is the eighth.
//
// An ACCELERATION INDEX, not a world representation: rebuilt from continuous
// positions every step, never stored as identity, and nothing is ever addressed
// by bucket. It answers "who is near me", which is a question about positions.
// A bucket that overflows simply lists fewer neighbours — an approximation in
// how much contact is seen, never a wrong answer about who exists.
@group(0) @binding(8) var<storage, read_write> hashData : array<atomic<u32>>;

// STANDING CROP. The resource field used to be an analytic function sampled
// without depletion — infinite free energy, everywhere, forever, which is the
// thing energy-speculative-friction.md is entirely about not doing.
//
// Now the field is FERTILITY (where crop regrows, and how fast) and the actual
// energy is stock held on motes: particles with a position and an amount. A
// cell grazes what is near it, the stock goes down, and it regrows from a
// bounded solar inflow. Grazing is a TRANSFER — what the cell gains, the mote
// loses — so harvest no longer creates anything. Total energy in the world is
// bounded by nMotes * moteCap plus what is standing in tissue.
//
// Motes are particles, not a grid: positions are continuous, they are found
// through a hash exactly as cells are, and nothing is ever addressed by bucket.
// Their positions do not move, which is what makes a patch something you can
// exhaust and have to leave — the pressure to locomote has to come from
// somewhere, and a field that refills under your feet is not it.
// ONE buffer, not three: (x, y, stock, demanders). Position is static and rides
// alongside the state, and the per-cell offer is DERIVED from stock and demanders
// by the same formula on both sides rather than stored — which is what lets this
// fit. WebGPU guarantees only 8 storage buffers per stage and real browsers
// commonly cap at 10; this shader was binding 11 and simply failed to create its
// bind group layout in Chrome, while the Deno adapter (31) ran it happily. That
// asymmetry is why it reached a user rather than a test.
@group(0) @binding(9)  var<storage, read_write> mote      : array<vec4<f32>>;
@group(0) @binding(10) var<storage, read_write> moteHash  : array<atomic<u32>>;

/** What one cell may take from this mote this step. Derived, never stored. */
fn moteOfferOf(m: vec4<f32>) -> f32 {
  if (m.w <= 0.0) { return 0.0; }
  return min(P.grazeRate * P.dt, max(0.0, m.z) / m.w);
}

fn moteBucketOf(p: vec2<f32>) -> u32 {
  let gx = i32(floor(p.x / P.moteR));
  let gy = i32(floor(p.y / P.moteR));
  let h = u32(gx * 73856093) ^ u32(gy * 19349663);
  return h % P.moteHashSize;
}

// SUBSTRATE GRIT: how much purchase the ground offers here. Analytic, like every
// other field — sampled at a continuous position, never stored, no grid. This is
// the thing a cell shoves against; where it is zero the world is open water and
// nothing can push off anything.
fn gritAt(p: vec2<f32>) -> f32 {
  return clamp(fbm(p * P.gritScale, P.gritSeed) * 1.6, 0.0, 1.0);
}

fn flowAt(p: vec2<f32>) -> vec2<f32> {
  return flowField(p, P.flowScale, P.flowStr, P.seed);
}

// Shortest displacement on a torus (minimum image). A body straddling the wrap
// seam has neighbours that are CLOSE through the edge and ~2*bound away in raw
// coordinates. Using the raw difference makes its springs pull outward with
// enormous force and tears the body apart, scattering its cells across the
// world — which then reads as long bond lines through the map. That was
// diagnosed once as a rendering artifact and suppressed in the renderer; the
// renderer was telling the truth and the physics was wrong. 36% of live bonds
// were stretched past 5 units against a rest length of 0.62.
fn minImage(d: vec2<f32>) -> vec2<f32> {
  var r = d;
  let b = P.bound;
  if (r.x >  b) { r.x = r.x - 2.0 * b; }
  if (r.x < -b) { r.x = r.x + 2.0 * b; }
  if (r.y >  b) { r.y = r.y - 2.0 * b; }
  if (r.y < -b) { r.y = r.y + 2.0 * b; }
  return r;
}

fn resourceAt(p: vec2<f32>) -> f32 {
  return resourceField(p, P.resScale, P.resSeed, P.worldTime,
                       vec2<f32>(P.driftX, P.driftY), P.morphRate);
}

// How much cell i is currently contracting, 0 for anything that is not a muscle.
//
// Read for BOTH endpoints of every bond, which is the whole point. A muscle
// that shortened only its own view of a shared bond would have its neighbour
// still pulling toward the uncontracted rest length: the pair's forces would
// not be equal and opposite, Newton's third law would be violated, and each
// step would inject a little energy into the body. That is a slow explosion
// with no bound on it, and it is what drove a fraction of bodies to infinite
// velocity (and thence to NaN) once sensing closed the loop around the muscles.
// Averaging the two endpoints' contraction gives both sides the SAME rest
// length, so the forces cancel exactly and the muscle can still shorten a bond.
fn contractionOf(i: u32) -> f32 {
  let m = cmeta[i];
  if (m.y < 0) { return 0.0; }
  // PROPORTIONAL TO THE CAPACITY, not gated on the label.
  //
  // This used to read 'if (m.x == 2)' — only cells whose argmax happened to
  // land on MUSCLE contracted, and every other cell contributed exactly zero
  // however contractile it was. Measured over 64 living genomes: 366.9 units
  // of contractility existed in the tissue and 192.9 of it could be used, so
  // the labelling threw away 47%. 351 cells had contract > 0.15 and were not
  // muscle; 151 of those lost the argmax by less than 0.2. Eighteen of
  // sixty-four bodies had no muscle at all and therefore could not move a
  // bond, despite carrying contractile tissue.
  //
  // It is also the First Law violation the design documents keep naming: the
  // kernel branched on a discrete type where primitives.md claims a
  // continuum. A cell is now as strong as it is, and "muscle" goes back to
  // being a description of a region of that continuum.
  // IMPOSED WAVE, an experiment knob and not a world parameter.
  //
  // swim-verify.js moves a chain 36 body-lengths with a travelling wave,
  // sin(axial*k - omega*t), so the physics can certainly locomote. Driving
  // REAL developed bodies with the same wave isolates which half is missing:
  // if they move, the body plan is fine and the brain is the blocker; if they
  // do not, no controller would have helped.
  //
  // waveAmp 0 is off, which is the shipped world.
  if (P.waveAmp > 0.0) {
    return P.contract * contractility(m.x) * P.waveAmp *
           sin(axialPos(m.x) * P.waveK - P.worldTime * P.waveOmega);
  }
  return P.contract * contractility(m.x) * act[u32(m.y)];
}

// A spatial hash over CONTINUOUS position. cellSize is a query radius, not a
// lattice the world lives on: a body straddling two buckets is in both, and
// moving half a bucket changes nothing about what the body is. Nothing is ever
// snapped to it.
fn bucketOf(p: vec2<f32>) -> u32 {
  let gx = i32(floor(p.x / P.hashCell));
  let gy = i32(floor(p.y / P.hashCell));
  var h : u32 = (u32(gx) * 73856093u) ^ (u32(gy) * 19349663u);
  return h % P.hashSize;
}

// Soft-sphere contact: every particle has a RADIUS and pushes back when
// overlapped.
//
// This is the universal primitive the world is meant to be built from. A rock, a
// corpse, an ice cube and a living cell are all the same thing here — a sphere
// with a position, a radius and a mass — and "rock" is a description of a
// particle's numbers rather than a type the engine knows. Nothing high-level is
// a primitive, which is the first law, and it applies to inert matter as much as
// to bodies.
//
// GATHER-ONLY, so it needs no atomics and is exactly symmetric: i and j compute
// the same overlap from the same two positions and radii, and take precisely
// opposite forces. That is the same property that makes the bond springs obey
// Newton's third law, and it is worth more than the small cost of both sides
// doing the arithmetic.
//
// The spatial hash it walks already exists — it was built for crowding — so the
// marginal cost is roughly 108 neighbour tests per cell, against the ~100M edge
// gathers the brains already do each step. It disappears into the noise.
fn contact(i: u32, p: vec2<f32>, myR: f32) -> vec2<f32> {
  if (P.contactK <= 0.0) { return vec2<f32>(0.0, 0.0); }
  var force = vec2<f32>(0.0, 0.0);
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let b = bucketOf(p + vec2<f32>(f32(dx), f32(dy)) * P.hashCell) * (1u + P.bucketM);
      let n = min(atomicLoad(&hashData[b]), P.bucketM);
      for (var k = 0u; k < n; k = k + 1u) {
        let j = atomicLoad(&hashData[b + 1u + k]);
        if (j == i) { continue; }
        if (cmeta[j].x < 0) { continue; }
        let d = minImage(pos[j] - p);
        let dist = max(length(d), 1e-4);
        let touch = myR + vel[j].z;
        if (dist >= touch) { continue; }
        // Linear in overlap: cheap, stable, and enough for bodies that are
        // mostly held together by bonds rather than by contact.
        force = force - (d / dist) * (touch - dist) * P.contactK;
      }
    }
  }
  return force;
}

// What one cell takes from its foreign neighbours this instant.
//
// THE ARMS RACE, built from primitives already present: contact and force. A
// cell pressing hard against a cell of ANOTHER body takes energy from it, at a
// rate set by the difference in how hard each is pressing. There is no
// predator, no prey, no attack stat and no role — "pressing" is just the muscle
// contraction the CTRNN already commands, and it already costs energy to
// produce. So attacking is expensive, defending is the same act as attacking,
// and which one a body is doing is a description of the outcome rather than a
// property it has.
//
// This is what makes the landscape stop standing still. Competing for GROUND
// has a settling point: the population spreads until marginal gain is equal
// everywhere and then nothing further pays. Competing against each OTHER has no
// such point, because what counts as good enough is set by what everyone else
// is doing, and that moves whenever they adapt.
//
// ANTISYMMETRY IS EXACT AND NEEDS NO ATOMICS. Cell i computes rate*(e_i - e_j)
// and cell j independently computes rate*(e_j - e_i), which is its exact
// negative. Every joule one gains, another loses — the same gather-only trick
// that makes the bond forces obey Newton's third law.
fn contest(i: u32, p: vec2<f32>, effort: f32) -> f32 {
  if (P.contestRate <= 0.0) { return 0.0; }
  let me = cmeta[i];
  let myE = energy[i];
  var net = 0.0;
  let r2 = P.contactR * P.contactR;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let b = bucketOf(p + vec2<f32>(f32(dx), f32(dy)) * P.hashCell) * (1u + P.bucketM);
      let n = min(atomicLoad(&hashData[b]), P.bucketM);
      for (var k = 0u; k < n; k = k + 1u) {
        let j = atomicLoad(&hashData[b + 1u + k]);
        if (j == i) { continue; }
        let other = cmeta[j];
        if (other.x < 0 || other.z == me.z) { continue; }   // same body: not a contest
        let d = minImage(pos[j] - p);
        if (dot(d, d) > r2) { continue; }

        // CONSERVING. The first version simply added rate*(effort difference)
        // and let the clamp deal with it — so a winner already at the ceiling
        // gained nothing while the loser still paid, and every contact quietly
        // destroyed energy. That is a drain on the whole population, not an
        // arms race, and it collapsed the world from ~580 bodies to 54.
        //
        // Limit each transfer by what the loser can actually afford AND what
        // the winner can actually hold. Both cells evaluate the same expression
        // from the same pre-step energies, so cell j computes exactly the
        // negative of what cell i computes and no energy is created or lost.
        let theirE = energy[j];
        // CONSUMPTION, not a wrestling match.
        //
        // primitives.md: energy A<-B at max(0, capability - toughness_B) x
        // nutrition_B. You must both OVERPOWER the thing and it must be worth
        // taking. The capability is the attacker's own contraction — pressing is
        // what a muscle does, it is already commanded by the CTRNN and already
        // paid for in muscleCost, so biting costs exactly what pressing costs and
        // no new verb enters the world.
        //
        // Nothing here is a predator or prey. Both cells run the same expression
        // in both directions; who gains is decided by which of them is pressing
        // harder and which is tougher, moment to moment. A tough cell is bad
        // food, a nutritious one is worth attacking, and "armour" and "meat" are
        // regions of that space rather than roles.
        let take  = max(0.0, effort                 - toughnessOf(cmeta[j].w)) * nutritionOf(j);
        let given = max(0.0, abs(contractionOf(j)) - toughnessOf(cmeta[i].w)) * nutritionOf(i);
        let raw = P.contestRate * (take - given) * P.dt;
        var moved = 0.0;
        if (raw > 0.0) {
          moved = min(raw, min(max(theirE - P.eFloor, 0.0), max(P.eCap - myE, 0.0)));
        } else {
          moved = -min(-raw, min(max(myE - P.eFloor, 0.0), max(P.eCap - theirE, 0.0)));
        }
        net = net + moved;
      }
    }
  }
  return net / P.dt;                       // caller multiplies by dt again
}

/* ------------------------------------------------------------------ kernels */

// 0a. Clear the occupancy counts.
@compute @workgroup_size(${WORKGROUP})
fn hashClear(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.hashSize) { return; }
  atomicStore(&hashData[gid.x * (1u + P.bucketM)], 0u);
}

// 0b. Each cell announces itself into its bucket.
@compute @workgroup_size(${WORKGROUP})
fn hashBuild(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nCells) { return; }
  // A DEAD cell is not in the world. Freeing an organism's arena slot leaves
  // its cells sitting in these buffers at their last positions, and if they
  // still counted toward occupancy the living would be competing with corpses:
  // with 36k slots and 7.2k alive that inflated crowding fivefold and starved
  // the entire population in a single tick. type < 0 marks a slot as vacated.
  if (cmeta[i].x < 0) { return; }
  let b = bucketOf(pos[i]) * (1u + P.bucketM);
  let n = atomicAdd(&hashData[b], 1u);
  if (n < P.bucketM) { atomicStore(&hashData[b + 1u + n], i); }
}

// How many cells share this neighbourhood, summed over the 3x3 buckets around
// p so the count does not jump as a cell crosses a bucket edge.
fn crowdingAt(p: vec2<f32>) -> f32 {
  var n = 0u;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      n = n + atomicLoad(&hashData[bucketOf(p + vec2<f32>(f32(dx), f32(dy)) * P.hashCell) * (1u + P.bucketM)]);
    }
  }
  return f32(n);
}

@compute @workgroup_size(${WORKGROUP})
fn moteHashClear(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.moteHashSize) { return; }
  atomicStore(&moteHash[gid.x * (1u + P.bucketM)], 0u);
}

// Motes never move, so this runs once at startup rather than every step.
@compute @workgroup_size(${WORKGROUP})
fn moteHashBuild(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nMotes) { return; }
  let b = moteBucketOf(mote[i].xy) * (1u + P.bucketM);
  let n = atomicAdd(&moteHash[b], 1u);
  if (n < P.bucketM) { atomicStore(&moteHash[b + 1u + n], i); }
}

// PHASE 1 of grazing. Each mote counts the live cells in reach and works out
// what it can give EACH of them without going below zero.
//
// Motes offer and cells take, rather than cells simply subtracting, because
// many cells graze one mote at once. If each took what it wanted the mote would
// be overdrawn — energy created from nothing, in the one place we are trying
// hardest to stop that. WGSL has no f32 atomics, so a cell cannot safely
// decrement shared stock; running the arithmetic once per mote, single-threaded,
// avoids the race entirely and keeps a run a pure function of its seed.
@compute @workgroup_size(${WORKGROUP})
fn moteOffer(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nMotes) { return; }
  let m0 = mote[i];
  let p = m0.xy;
  var demanders = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let b = bucketOf(p + vec2<f32>(f32(dx), f32(dy)) * P.hashCell) * (1u + P.bucketM);
      let n = min(atomicLoad(&hashData[b]), P.bucketM);
      for (var k = 0u; k < n; k = k + 1u) {
        let j = atomicLoad(&hashData[b + 1u + k]);
        if (cmeta[j].x < 0) { continue; }
        if (length(minImage(pos[j] - p)) > P.moteR) { continue; }
        demanders = demanders + 1.0;
      }
    }
  }
  mote[i] = vec4<f32>(m0.x, m0.y, m0.z, demanders);
}

// PHASE 3. Subtract what was actually handed out, then let the sun put some
// back. Regrowth is logistic toward moteCap and scaled by local fertility, so
// the analytic field still decides WHERE the world is rich — it just no longer
// decides how much there is. The inflow is bounded: at most
// nMotes * moteRegrow * moteCap per second enters the world, whatever lives in
// it and however hungry they are. That is the one boundary inflow.
@compute @workgroup_size(${WORKGROUP})
fn moteCommit(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nMotes) { return; }
  let m0 = mote[i];
  let p = m0.xy;
  var stock = max(0.0, m0.z - moteOfferOf(m0) * m0.w);
  let fert = clamp(resourceAt(p), 0.0, 1.0);

  // CROWDING SUPPRESSES REGROWTH — the Conway move, and the reason moving can
  // pay at all.
  //
  // Without it a grazed patch refills faster than leaving it is worth, so sitting
  // still is optimal and muscle is correctly selected away. Measured: correlation
  // between a body's displacement and its energy change was -0.36; movers lost
  // 9.5 while sitters gained 3.1. Evolution deleting its own muscles was not a
  // bug, it was the right answer to the incentive we had built.
  //
  // Ground under a crowd recovers slowly, so the patch you are sitting on stays
  // poor BECAUSE you are sitting on it. That makes leaving worth something, and
  // it does it without rewarding movement directly — the pressure is a property
  // of the ground, identical for everyone, and a body that sits in a rich empty
  // patch is still perfectly well off. Weak Boids-like separation falls out of it.
  //
  // Friction-law clean: this can only REDUCE the sun's delivery, never raise it.
  // Total inflow stays bounded by nMotes * moteRegrow * moteCap, and no
  // capability is granted energy — the crowd term is blind to what the crowding
  // cells are or what they are doing.
  //
  // m0.w is the demander count the offer pass already counted this step, so
  // this costs nothing.
  // DENSITY-RELATIVE, not a headcount. The first version divided by the raw
  // demander count, and that count is 1-3 in a sparse assay but ten to thirty
  // times larger in a living population — so a coefficient tuned in the assay
  // extinguished regrowth everywhere and starved the world (348 -> 8 alive).
  //
  // What should suppress regrowth is not how many mouths are present but how hard
  // the patch is being WORKED: the draw this step measured against what the sun
  // would put back. That ratio is dimensionless and means the same thing at any
  // density, so one coefficient transfers between an empty world and a crowded
  // one. A patch drawn down faster than it regrows recovers slowly; a patch
  // barely touched recovers fully however many cells happen to be standing on it.
  let draw = moteOfferOf(m0) * m0.w;
  let refill = max(1e-6, P.moteRegrow * P.dt);
  let suppress = 1.0 / (1.0 + P.regrowCrowdK * (draw / refill));
  stock = stock + P.moteRegrow * fert * suppress * (1.0 - stock / P.moteCap) * P.dt;
  mote[i] = vec4<f32>(m0.x, m0.y, clamp(stock, 0.0, P.moteCap), 0.0);
}

// PHASE 2 lives inside physics(): what cell i can pick up from the motes it is
// standing on, at the rate each of them already committed to.
fn grazeAt(p: vec2<f32>) -> f32 {
  if (P.nMotes == 0u) { return 0.0; }
  var got = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let b = moteBucketOf(p + vec2<f32>(f32(dx), f32(dy)) * P.moteR) * (1u + P.bucketM);
      let n = min(atomicLoad(&moteHash[b]), P.bucketM);
      for (var k = 0u; k < n; k = k + 1u) {
        let mi = atomicLoad(&moteHash[b + 1u + k]);
        let mv = mote[mi];
        if (length(minImage(mv.xy - p)) > P.moteR) { continue; }
        got = got + moteOfferOf(mv);
      }
    }
  }
  return got;
}

// 1. Sensor cells write what they feel into their brain's input slot. Nothing
//    crosses the bus: ext is a GPU buffer the arena kernel reads next.
@compute @workgroup_size(${WORKGROUP})
fn sense(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nCells) { return; }
  let m = cmeta[i];
  let slot = m.y;
  if (slot < 0 || m.x < 0) { return; }
  if (cellType(m.x) != 1) { ext[u32(slot)] = 0.0; return; }

  let p = pos[i];
  // Two things a cell can actually feel locally: how fast the medium is moving
  // past it, and a scalar gradient it sits in. Both are analytic at p.
  let rel = flowAt(p) - vel[i].xy;
  var e = tanh((length(rel) + fbm(p * P.flowScale * 0.5, P.seed + 77u) - 0.5) * P.senseGain);

  // A COMPASS: the cell's own bearing against the world's basis vectors.
  //
  // Every other sense here is scalar and local, so nothing in this world has
  // ever had access to a DIRECTION. A creature could not tell which way it was
  // pointing, let alone which way anything else was, which is why a gait could
  // never become navigation and why sensors were being selected away — a sense
  // organ reporting the weather is correctly deleted.
  //
  // northness and eastness are components of the cell's orientation on the
  // world plane. Orientation is the cell's own axial direction, the same
  // vector traction uses, so it is a fact about the body rather than a new
  // quantity: rotate the animal and the reading changes.
  //
  // ACUITY IS GRADED, 0 to 1, and what it does NOT know it reads as noise
  // rather than as zero. A blind compass returning 0 would be a confident
  // claim of due east; returning noise is honest ignorance, and it means
  // evolving accuracy has something to climb from.
  // The cell's own bearing, computed once: both the compass and the neighbour
  // sense are questions about direction and both need it.
  var ax = vec2<f32>(0.0, 0.0);
  {
    let ab = i * P.bondK;
    var loN = -1; var hiN = -1; var loA = 2.0; var hiA = -1.0;
    for (var k = 0u; k < P.bondK; k = k + 1u) {
      let nj = bitcast<i32>(bondD[ab + k].x);
      if (nj < 0) { continue; }
      let na = axialPos(cmeta[u32(nj)].x);
      if (na < loA) { loA = na; loN = nj; }
      if (na > hiA) { hiA = na; hiN = nj; }
    }
    if (loN >= 0 && hiN >= 0 && loN != hiN) { ax = minImage(pos[u32(hiN)] - pos[u32(loN)]); }
    else if (loN >= 0) { ax = minImage(pos[u32(loN)] - p); }
  }
  let alen = length(ax);
  if (P.compass > 0.0 && alen > 1e-5) {
    let u = ax / alen;
    let bearing = select(u.x, u.y, senseNorth(m.x));   // eastness or northness
    let acu = senseAcuity(m.x);
    let grit2 = fbm(p * 3.1 + vec2<f32>(f32(i) * 0.017, 0.0), P.seed + 913u) * 2.0 - 1.0;
    e = e + P.compass * mix(P.senseNoise * grit2, bearing, acu);
  }
  // PERCEIVING OTHER CREATURES.
  //
  // Until now a sensor read the medium and a noise field and nothing else: no
  // creature in this world could perceive another creature, so predator, prey,
  // mate and rival were not merely absent but unreachable. This is the smallest
  // honest fix.
  //
  // WHAT IS EMITTED IS RELATIVE MOTION. Every cell radiates in proportion to how
  // fast it is moving PAST the sensor. That choice does the work of a self/other
  // rule without one existing: a creature's own cells travel with it, so their
  // relative speed is near zero and its own body is naturally almost invisible
  // to it, while something else swimming past is loud. No cell is labelled kin
  // or stranger anywhere.
  //
  // The receptive field is a gaussian in distance and a cosine in bearing, which
  // is the standard construction — a sum of gaussians is what a diffusing signal
  // from several sources actually looks like, and they superpose for free.
  // Directionality rides on the SAME acuity the compass uses: a sharp sensor is
  // sharp about where things are, a vague one just knows something is near.
  //
  // Cost: this walks the neighbour hash, which PHYSICS-2.md warns is the
  // expensive thing. It walks it ONLY for sensor cells, so the cost scales with
  // how much of the world has chosen to see.
  if (P.senseOther > 0.0) {
    var acc = 0.0;
    let sig2 = max(1e-4, P.senseRange * P.senseRange);
    let myV = vel[i].xy;
    // A WIDER WALK, FOR SENSORS ONLY. The contact walk is 3x3 buckets and reaches
    // 1.8 world units; bodies are 4-6 across and land about seven apart, so at
    // that radius a sensor can only ever see its own tissue. Perception of other
    // creatures needs more reach, and it is affordable here precisely because
    // only sensor cells pay for it — the cost scales with how much of the world
    // has chosen to see.
    let R = i32(max(1.0, P.senseBuckets));
    for (var dy = -R; dy <= R; dy = dy + 1) {
      for (var dx = -R; dx <= R; dx = dx + 1) {
        let b = bucketOf(p + vec2<f32>(f32(dx), f32(dy)) * P.hashCell) * (1u + P.bucketM);
        let cnt = min(atomicLoad(&hashData[b]), P.bucketM);
        for (var k = 0u; k < cnt; k = k + 1u) {
          let j = atomicLoad(&hashData[b + 1u + k]);
          if (j == i) { continue; }
          if (cmeta[j].x < 0) { continue; }
          // OTHER BODIES ONLY. Relative motion was supposed to make a cell's
          // own tissue invisible to it, and it does not: a body that deforms
          // moves its own cells past each other, so a sensor heard mostly
          // itself — measured, the reading was identical alone and in a
          // crowd. Own-body cells are excluded by BODY ID, which is a
          // property the kernel already carries for the contest and is not a
          // new concept. Proprioception is a real sense and a separate one.
          if (cmeta[j].z == cmeta[i].z) { continue; }
          let d = minImage(pos[j] - p);
          let d2 = dot(d, d);
          if (d2 > sig2 * 9.0) { continue; }
          let rel = length(vel[j].xy - myV);
          if (rel < 1e-4) { continue; }
          let fall = exp(-d2 / (2.0 * sig2));
          var w = 1.0;
          if (alen > 1e-5) {
            let u = ax / alen;
            let dirTo = d / max(1e-4, sqrt(d2));
            let cosT = dot(u, dirTo);
            let sharp = senseAcuity(m.x);
            w = mix(1.0, max(0.0, cosT), sharp);
          }
          acc = acc + rel * fall * w;
        }
      }
    }
    e = e + P.senseOther * tanh(acc);
  }
  ext[u32(slot)] = clamp(e, -4.0, 4.0);
}

// 2. Physics: bond springs (muscles contract theirs), flow drag, integrate.
@compute @workgroup_size(${WORKGROUP})
fn physics(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nCells) { return; }
  if (cmeta[i].x < 0) { return; }              // vacated slot; not in the world

  let p = pos[i];
  var v = vel[i].xy;
  var force = vec2<f32>(0.0, 0.0);

  // A muscle cell shortens its bonds in proportion to its activation. That is
  // what a muscle IS; locomotion falls out of the body deforming against the
  // medium rather than being assigned as a velocity.
  let mine = contractionOf(i);

  let base = i * P.bondK;
  for (var k = 0u; k < P.bondK; k = k + 1u) {
    let bd = bondD[base + k];
    let j = bitcast<i32>(bd.x);
    if (j < 0) { continue; }
    let d = minImage(pos[u32(j)] - p);
    let dist = max(length(d), 1e-3);
    // Symmetric: both endpoints derive the same rest length, so the pair's
    // forces cancel. See contractionOf.
    let rest = bd.y * (1.0 - 0.5 * (mine + contractionOf(u32(j))));
    let dir = d / dist;
    // Hooke, PROPORTIONAL at any stretch. An earlier version clamped the
    // stretch for stability and that was a bad trade: a bond pulled past the
    // clamp stops pulling harder, so drag wins and the body tears apart and
    // never recovers. Worst-case bond stretch went from 0.45 to 60 world units.
    // Stiffness is per bond now. bd.z spans a decade either side of 1, so the
    // same genome can specify skeleton and soft tissue in one body.
    force = force + dir * (dist - rest) * P.springK * bd.z;

    // Viscoelastic damper along the bond. This is not a numerical fudge — real
    // tissue dissipates, and an undamped spring whose REST LENGTH is driven by
    // a muscle is a parametric oscillator: when the CTRNN's contraction rhythm
    // lands near the bond's natural period it pumps energy in every cycle and
    // the body flies apart. That resonance, not raw stiffness, is what put
    // NaNs into a fraction of bodies (dt*sqrt(k) here is ~0.25, far inside the
    // explicit-Euler limit of 2). Damping the RELATIVE velocity along the bond
    // removes the energy the drive adds, and leaves the static spring law and
    // the muscle's authority over rest length untouched.
    force = force + dir * dot(vel[u32(j)].xy - v, dir) * P.bondDamp * sqrt(bd.z);
  }

  // Contact with everything nearby, living or not.
  force = force + contact(i, p, vel[i].z);

  // The medium drags the cell toward the local flow velocity. This is the
  // "stickiness to the aether" every particle has, inert or alive.
  force = force + (flowAt(p) - v) * P.drag;

  // Terminal velocity — the one guard that keeps explicit Euler bounded when
  // the stiffness slider outruns dt < 2/sqrt(k). Without it a large force gives
  // a large velocity, which overshoots the next rest length and returns a still
  // larger force; that runaway put NaNs into 0.2% of cells, and a NaN position
  // never recovers and poisons every bond that touches it. Capping speed bounds
  // the overshoot to under one rest length per step while leaving the force law
  // untouched in the range bodies actually operate in.
  // ---------------------------------------------------- traction
  //
  // WITHOUT THIS THERE IS NO LOCOMOTION AT ALL, and its absence is why bodies
  // only ever drifted with the flow. Internal forces cannot move a body's centre
  // of mass: a muscle contracting pulls its two ends toward each other and the
  // body deforms in place. Something outside the body has to be pushed against.
  //
  // Worse, even with uniform friction a contract-relax cycle is RECIPROCAL — it
  // retraces its own path and returns exactly where it started, which is the
  // scallop theorem. Breaking it needs the grip itself to vary through the
  // cycle, so the body can plant one end while the other slides: anchor,
  // extend, anchor, contract. That is how a caterpillar, a snake's scales and a
  // starfish's tube feet all work, and it is why grip here is MODULATED BY THE
  // CELL'S ACTIVATION rather than being a constant.
  //
  // Coulomb, not viscous: a fixed velocity decrement rather than a force
  // proportional to speed. Viscous drag would slow everything smoothly and never
  // let a cell hold still against a pull, which is exactly what an anchor has to
  // do. This lets a high-grip cell stay put while a low-grip one is dragged.
  {
    let me2 = cmeta[i];
    // Every cell has a little purchase on the world; an ANCHOR cell has far
    // more, and modulates it with its activation so it can let go.
    var grab = P.gripBase;
    // Grip still keys off the LABEL, deliberately: making it continuous too
    // would change traction and contraction in the same commit and neither
    // effect could be attributed. grippiness(me2.x) is packed and waiting.
    if (cellType(me2.x) == 3) { grab = P.gripAnchor; }
    // ACTIVELY PHASED, which is the whole point. A cell raises and drops its grip
    // with its activation, so a brain can grip on the power stroke and release on
    // recovery. Constant grip nets zero however strong it is — the scallop
    // theorem — and primitives.md is explicit that the world affords while the
    // brain earns.
    if (me2.y >= 0) {
      // Under the imposed-wave diagnostic the GRIP is driven by the same wave
      // as the muscle, offset by wavePhase — grip while contracting, release
      // while extending. That is the ratchet stated explicitly, so the body
      // plan can be tested against an ideal gait rather than a hopeful one.
      var a = act[u32(me2.y)];
      if (P.waveAmp > 0.0) {
        a = sin(axialPos(me2.x) * P.waveK - P.worldTime * P.waveOmega + P.wavePhase);
      }
      grab = grab * (1.0 + P.gripMod * select(0.0, a, abs(a) < 1e6));
    }
    grab = max(grab, 0.0);

    // THE BODY AXIS, taken between two bonded neighbours — the same construction
    // the verified reference uses (tools/swim-verify.js). Traction is anisotropic
    // about it: a cell slides along its own body far more easily than sideways,
    // and that asymmetry is what converts a deformation into travel. Isotropic
    // drag, which is what this used to be, cancels it exactly.
    var axis = vec2<f32>(0.0, 0.0);
    {
      // THE BODY AXIS, taken along the head-tail gradient.
      //
      // This used to take the FIRST TWO bonds found in slot order. In a chain
      // those are the two chain neighbours and it is exactly right — which is
      // why the standalone swim demo works. In a hex body of degree 4 to 6 the
      // first two bonds are an arbitrary local lattice direction, so every
      // cell's drag anisotropy pointed a different, meaningless way and the
      // anisotropy averaged to nothing across the body. Anisotropic drag can
      // only convert deformation into travel if it is anisotropic about
      // something the body agrees on.
      //
      // Each cell carries its position along the body's own axis (packMeta), so
      // the neighbours with the lowest and highest axial position give the
      // local anterior-posterior direction directly.
      let ab = i * P.bondK;
      var loN = -1; var hiN = -1;
      var loA = 2.0; var hiA = -1.0;
      for (var k = 0u; k < P.bondK; k = k + 1u) {
        let nj = bitcast<i32>(bondD[ab + k].x);
        if (nj < 0) { continue; }
        let na = axialPos(cmeta[u32(nj)].x);
        if (na < loA) { loA = na; loN = nj; }
        if (na > hiA) { hiA = na; hiN = nj; }
      }
      if (loN >= 0 && hiN >= 0 && loN != hiN) {
        axis = minImage(pos[u32(hiN)] - pos[u32(loN)]);
      } else if (loN >= 0) {
        axis = minImage(pos[u32(loN)] - p);
      }
    }
    let alen = length(axis);

    // Dissipative ONLY: exponential decay cannot add energy whatever the
    // coefficients, so net motion is still paid for out of muscle fuel.
    let grit = gritAt(p);
    if (alen > 1e-5) {
      let ax = axis / alen;
      let pxv = vec2<f32>(-ax.y, ax.x);
      var vA = dot(v, ax);
      var vP = dot(v, pxv);
      // GRIP ANCHORS, it does not merely resist sideways slip.
      //
      // grab used to appear ONLY in kP, so a gripping cell slid along its own
      // axis exactly as freely as a released one. There was therefore nothing
      // to pull against and no ratchet: anchor-extend-release could not work
      // however well it was phased. Measured consequence — driving real bodies
      // with a PERFECT imposed travelling wave moved them p50 0.012 units in
      // 300 s, no better than noise, at every frequency and wavelength tried.
      // The controller was never the blocker.
      //
      // hold raises drag in BOTH directions with grip, so a gripped cell is
      // planted and a released one slides. Anisotropy still rides on top, so
      // undulation keeps working too. Dissipative either way — an exponential
      // decay cannot add energy whatever the coefficients — and the PASSIVE
      // case still nets zero, because constant grip is reciprocal and the
      // scallop theorem eats it. Only actively phased grip ratchets, which is
      // the affordance-not-forcing rule primitives.md insists on.
      let hold = 1.0 + P.gripHold * grab;
      let kA = P.fricK * (P.slipBase + hold * grit);
      let kP = P.fricK * (P.slipBase + hold * (1.0 + P.gripAniso * grab) * grit);
      vA = vA * exp(-kA * P.dt);
      vP = vP * exp(-kP * P.dt);
      v = ax * vA + pxv * vP;
    } else {
      // A lone cell has no axis so it can only be damped isotropically. It also
      // cannot swim, which is correct: undulation needs a body.
      v = v * exp(-P.fricK * (P.slipBase + grit) * P.dt);
    }
  }

  // Component-wise, NOT a length-based rescale. The rescale form v*(lim/speed)
  // evaluates to inf*0 = NaN the moment a component overflows to infinity — so
  // the guard meant to prevent blow-up was itself manufacturing the NaN it was
  // there to stop. clamp() saturates infinities to the bound instead.
  v = clamp((v + force * P.dt) * P.damp, vec2<f32>(-40.0, -40.0), vec2<f32>(40.0, 40.0));

  var np = p + v * P.dt;

  // Toroidal wrap keeps the world edgeless without a wall to pile up against.
  let b = P.bound;
  if (np.x >  b) { np.x = np.x - 2.0 * b; }
  if (np.x < -b) { np.x = np.x + 2.0 * b; }
  if (np.y >  b) { np.y = np.y - 2.0 * b; }
  if (np.y < -b) { np.y = np.y + 2.0 * b; }

  pos[i] = np;

  // ------------------------------------------------------------- energy
  // Per CELL, not per organism: a cell is the thing that sits somewhere and
  // pays for itself, and "organism" is not a primitive the world knows. The
  // per-body total is a sum the selector takes later, which is exactly the
  // category-free accounting WORLD.md asks for — energy captured, by descent,
  // with no species anywhere in it.
  //
  // Nick Lane's framing, made literal: a cell taps a gradient, and thinking is
  // paid for out of that flux. brainTax is charged to every cell whether or not
  // it does anything, so a bigger brain must earn its keep; muscle work costs
  // extra in proportion to how hard it pulls. A cell that sits in barren ground
  // starves however clever it is.
  // Bounded both ways, and both bounds matter. The ceiling stops a body in good
  // ground from hoarding without limit: surplus has to become offspring or be
  // lost, which is what keeps reproduction the only way to convert luck into
  // descendants. Without it mean energy climbed without bound, nothing ever
  // starved, and "selection" degenerated into a queue for free slots. The floor
  // stops a dying body from running up debt so deep it can never be revived,
  // which would make death depend on how long it had been dying.
  // THE SAME GROUND SHARED. Ground already occupied pays less, so a rich patch
  // is only rich until everyone finds it. This is what stops the fitness
  // landscape from being a fixed hill with a summit to park on: its shape now
  // depends on where every other body is, and that changes as they adapt. A
  // static field selects once and then plateaus; a contested one keeps moving.
  // No depletion state is stored anywhere — competition is computed from where
  // bodies ARE, which is the only thing the world actually has.
  // A body does not crowd itself, so the discount is measured against THIS
  // body's own size. Using a fixed constant was fine while every body had the
  // same cell count; the moment size became heritable it silently taxed large
  // bodies for their own cells and made growth look worse than it is.
  let mySize = bodySizeOf(cmeta[i].w);
  let crowd = crowdingAt(np);
  let share = 1.0 / (1.0 + P.crowdK * max(0.0, crowd - mySize));

  // NO SIZE BONUS. There was one: bigger bodies extracted more energy per cell
  // from the same ground, added deliberately so that multicellularity would pay.
  // energy-speculative-friction.md names that exact move as fiction — "you may
  // not grant energy to a capability; 'bodies get +X so multicellularity pays'
  // mints, and privileges a chosen outcome."
  //
  // It is deleted. If being multicellular is worth anything it has to be worth
  // it through the plumbing — reaching ground a lone cell cannot hold, surviving
  // a current that would sweep a single cell away, keeping a chamber stable —
  // not because the accounting was told to favour it. Removing it is expected to
  // hurt: the doc's test is that a correct energy model is one where you
  // frequently cannot afford what you wanted.
  // Motes when they exist, the old analytic sample when they do not, so a run
  // can still be configured the old way for comparison. The mote path needs no
  // crowding discount: share was a stand-in for depletion, and depletion is
  // now real — many cells on one mote each get a smaller offer because the mote
  // divided what it had between them.
  // FEEDING COMPETES WITH FORCE.
  //
  // Every cell used to feed equally whatever else it was, so there was no
  // reason for a body to be anything but muscle — and once muscle was made
  // strong and cheap the world became one: 94.2% muscle, 0.1% neuron, 1.5%
  // sensor by generation 29. A monoculture of one tissue is not a body plan.
  //
  // The lawful fix is an ANTICORRELATION, which primitives.md already names as
  // the mechanism that gives an axis teeth: a cell specialised for producing
  // force is not also specialised for uptake. It is NOT a gate on cell type —
  // branching feeding on ctype would be the same First Law violation that was
  // just removed from contraction. A cell is as good at feeding as it is not
  // committed elsewhere, continuously.
  //
  // What this buys, if it works: division of labour becomes necessary rather
  // than optional. A body that wants to move must carry tissue that feeds it.
  let commit = max(contractility(cmeta[i].x), grippiness(cmeta[i].x));
  let absorb = clamp(1.0 - P.absorbTradeoff * commit, 0.0, 1.0);
  var gain = 0.0;
  if (P.nMotes > 0u) {
    gain = absorb * grazeAt(np) / P.dt;
  } else {
    gain = absorb * P.harvest * resourceAt(np) * share;
  }
  let work = P.muscleCost * abs(mine);
  // ACUITY COSTS. A sense organ that reads the world perfectly for free is a
  // free lunch, and evolution would take it every time — the same mistake as
  // feeding being independent of what a cell is. A sharp compass burns fuel in
  // proportion to how sharp it is, so accuracy has to be worth its keep and a
  // cheap noisy sense stays a live option. primitives.md: an axis without a
  // cost has no teeth.
  let senseWork = P.senseCost * senseAcuity(cmeta[i].x);
  // ARMOUR IS EXPENSIVE TO HOLD. Without a cost, toughness is a free defence
  // and evolution takes it to the ceiling in every lineage — the same failure
  // as feeding being independent of what a cell is, which produced a 94%
  // muscle monoculture. primitives.md: an axis with no cost has no teeth.
  let armourWork = P.toughCost * toughnessOf(cmeta[i].w);
  let taken = contest(i, np, abs(mine));
  // Written to scratch, not to energy[]: contest() READS energy[j] for other
  // cells, and if physics also wrote energy[j] in the same dispatch the result
  // would depend on thread order — non-deterministic, and this project's runs
  // are supposed to be a pure function of their seed. energyCommit publishes it.
  // PRESERVE THE RADIUS. This wrote 0.0 into z, wiping every cell's radius on
  // every step — the other independent reason contact was dead. Between this and
  // contactK being a denormal (see lib/uniform.js), cells have never collided.
  vel[i] = vec4<f32>(v.x, v.y, vel[i].z,
    clamp(energy[i] + (gain - P.brainTax - work - senseWork - armourWork + taken) * P.dt, P.eFloor, P.eCap));
}

// Publish the energy physics computed. One extra dispatch, no extra buffer, and
// the read/write hazard is gone.
@compute @workgroup_size(${WORKGROUP})
fn energyCommit(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nCells) { return; }
  if (cmeta[i].x < 0) { return; }
  energy[i] = vel[i].w;
}
`;

export class WorldGPU {
  /**
   * @param {BrainArenaGPU} brains  shares its device, `ext` and `act` buffers
   * @param {object} cells  {px, py, vx, vy, ctype, cslot, bond, brest, bondK}
   */
  constructor(brains, cells, params = {}) {
    const device = this.device = brains.device;
    this.brains = brains;
    this.n = cells.px.length;
    this.bondK = cells.bondK;

    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const mk = (data) => {
      const b = device.createBuffer({ size: Math.max(4, data.byteLength), usage: S });
      device.queue.writeBuffer(b, 0, data);
      return b;
    };
    // Pack to the shader's vec2 layout. The builder hands over plain parallel
    // arrays because they are easier to reason about CPU-side; the interleaving
    // belongs here, next to the bindings it exists for.
    const n = this.n;
    const pos = new Float32Array(n * 2), vel = new Float32Array(n * 4);
    // vec4 stride: (type, brain slot, body id, unused). The body id is what
    // lets a cell tell a stranger from its own tissue, which is the whole basis
    // of the contest — without it a body would fight itself.
    const meta = new Int32Array(n * 4);
    const bodyOf = cells.body ?? null;
    for (let i = 0; i < n; i++) {
      pos[i * 2] = cells.px[i]; pos[i * 2 + 1] = cells.py[i];
      vel[i * 4] = cells.vx[i]; vel[i * 4 + 1] = cells.vy[i];
      // z is the cell's radius. It had never been written by anything, so it
      // was 0 for every cell in every run, and `touch = myR + otherR` was 0 —
      // one of the two independent reasons contact has never done anything.
      vel[i * 4 + 2] = cells.rad ? cells.rad[i] : 0.34;
      meta[i * 4] = packMeta(cells.ctype[i],
        cells.contractility ? cells.contractility[i] : (cells.ctype[i] === 2 ? 1 : 0),
        cells.grippiness ? cells.grippiness[i] : (cells.ctype[i] === 3 ? 1 : 0));
      meta[i * 4 + 1] = cells.cslot[i];
      meta[i * 4 + 2] = bodyOf ? bodyOf[i] : -1;
      // Founders: middling meat, no armour. They have no developed tissue to
      // read these from, and a founder that was inedible would be a boundary
      // condition with teeth.
      meta[i * 4 + 3] = packSize(cells.bodySize ? cells.bodySize[i] : 0, 0.5, 0.0);
    }
    this.bPos = mk(pos); this.bVel = mk(vel); this.bMeta = mk(meta);
    // Pack bond index + rest length into the one vec2 buffer the shader binds.
    const bd = new Float32Array(cells.bond.length * 4);
    const bdI = new Int32Array(bd.buffer);
    for (let i = 0; i < cells.bond.length; i++) {
      bdI[i * 4] = cells.bond[i];          // i32 written into the .x float slot
      bd[i * 4 + 1] = cells.brest[i];
      bd[i * 4 + 2] = cells.bstiff ? cells.bstiff[i] : 1.0;
      bd[i * 4 + 3] = cells.bbrittle ? cells.bbrittle[i] : 0.0;
    }
    this.bBondD = mk(bd);
    this.bEnergy = mk(cells.energy ?? new Float32Array(n).fill(1));

    this.params = {
      flowScale: 0.9,
      // Flow reduced from 1.0 so that swimming beats drifting, but NOT for the
      // reason first recorded here. That claim — flow carrying cells ten times
      // faster than they could swim — came from tracking cells by arena index,
      // and arena slots are recycled, so most of the "movement" was bodies dying
      // and being replaced. Measured properly, per 30,000 steps on isolated
      // bodies:
      //
      //   flow 1.0   drift alone 1.06, with muscle 1.85   -> swimming buys ~0.75x
      //   flow 0.3   drift alone ~0.3, with muscle ~0.8   -> swimming buys ~2.7x
      //   flow 0     pure swim 0.84
      //
      // So the real problem is milder: at full strength the current moves a body
      // about as far as its own muscles do, which leaves swimming with little
      // selective advantage. 0.3 keeps flow as a genuine force to anchor against
      // and be swept by, while making self-propulsion clearly worth having.
      flowStr: 0.3, drag: 1.6, springK: 90.0,
      // MUSCLE FORCE, raised 11x. Measured with an imposed gait over 300 s,
      // median displacement against contract: 0.45 -> 0.067, 2.5 -> 0.199,
      // 5 -> 0.490, 10 -> 0.891, 20 -> 1.594. Bodies end at 0.82-0.97 of their
      // starting span with at most 2 of 30 torn, so this is not the
      // dismemberment artefact this project has retracted before.
      contract: 5.0, seed: 3, senseGain: 2.0, damp: 0.986, bound: 64.0,
      // Calibrated against the density the world actually runs at. A 3x3 bucket
      // neighbourhood holds ~34 cells at the starting population, so crowdK
      // 0.012 discounts a shared patch to ~0.79 rather than erasing it: at
      // 0.055 the discount halved every harvest, nothing anywhere could pay its
      // tax, and the entire population starved in one tick. With these numbers
      // barren ground (res 0.04) is fatal, average ground (0.28) barely pays,
      // and rich ground (0.64) is worth crossing the world for — until enough
      // others arrive to spend it down.
      harvest: 2.6,
      // A BODY MUST BE ABLE TO LIVE ON ITS OWN PATCH, or it starves before it can
      // evolve a way off it. Measured on one isolated 37-cell body with abundant
      // food: at brainTax 0.45 its energy plateaus at 27 of a 111 cap, and
      // raising grazeRate FIVEFOLD changes nothing — intake is not the limit, the
      // tax is. With the tax off the same body settles at 89.
      //
      // The local-versus-global picture is the interesting part and it stays:
      // mean mote stock across the world is 0.97 of cap, so 97% of the food is
      // untouched while a body lives off the few motes beneath it. That is the
      // pressure that should make moving pay. Lowering the tax lets a creature
      // survive long enough to find a gait rather than dying before it can.
      // BRAIN TAX 0.4, doubled, because the world was too rich for selection to
      // act. At 0.2 the live world ran 137,610 steps per generation with mean
      // energy climbing past 41 and essentially nothing starving: births were
      // pinned to the arena cap so the birth rate could only equal the death
      // rate, and the death rate was ~2.5 per thousand steps. Evolution needs
      // differential death and there was barely any death at all.
      //
      // Swept over 300 bodies for 30,000 steps, deaths per 1000 steps:
      //
      //     baseline (0.2)              3.23   300 alive   gen 5
      //     brainTax 0.4               39.17   300 alive   gen 9
      //     brainTax 0.8                8.80    14 alive   collapse
      //     brainTax 1.5                2.27     8 alive   dead
      //     moteRegrow 2.5             24.83   231 alive   gen 10
      //     brainTax 0.8 + regrow 3     2.33     8 alive   dead
      //
      // Twelve times the turnover with the population intact. Anything harsher
      // extinguishes it, and the two levers do NOT compose — starving the world
      // and taxing it together kills everything. Scarcity via the metabolic
      // cost rather than via a death threshold: dying should be a consequence
      // of the books not balancing, not a knob on dying.
      // MUSCLE COST SCALES WITH MUSCLE FORCE, or the world cannot pay for it.
      // work = muscleCost * |contraction|, so 11x the force is 11x the bill:
      // at contract 5 with cost 0.55 the population fell from 300 to 11. With
      // the rate scaled down in proportion it holds at 300 with generation 17
      // and 35 deaths per thousand steps.
      //
      // Stated plainly, because it is a real choice and not a free lunch: this
      // makes muscle stronger per unit fuel — a better muscle, not more energy.
      // Nothing is minted, but the contractility-versus-fuel tradeoff that
      // primitives.md wants is now weaker than it was, and wants revisiting.
      brainTax: 0.4, muscleCost: 0.0495,
      resScale: 0.35, resSeed: 91, eCap: 3.0, eFloor: -2.0,
      // hashCell was 3.2 while contact reaches only ~0.7, so a bucket held ~10
      // cells against a cap of 12 and overflowed constantly. An overflowing
      // bucket lists an ARBITRARY subset — arbitrary because insertion order is
      // an atomicAdd race — so cell i could see j while j could not see i, the
      // pair's contact forces were unequal, and momentum appeared from nowhere
      // (|p| reached 72.9 from rest). Sized to the interaction it indexes, this
      // drops to 0.27, and the nondeterminism goes with it.
      hashCell: 1.2, hashSize: 65536, crowdK: 0.085,
      driftX: 0.0, driftY: 0.0, morphRate: 0.0,
      // Sized against the forces actually present. Flow drag imparts about
      // 0.005 velocity units per step; a muscle contracting imparts nearer 0.4.
      // Traction has to sit between the two — enough that a body is not simply
      // blown along by the current, little enough that its own muscles can still
      // move it. At the original 0.55 the decrement was 0.05 per step, ten times
      // what the flow supplies, and the world froze solid.
      // GRABBINESS IS NOW A RATIO, NOT A DECREMENT. Under the old Coulomb rule
      // gripBase was a velocity subtracted per step and 0.06 was the right size.
      // It now multiplies the sideways drag, where 0.06 buys a 1.36x anisotropy
      // and the verified reference needs ~6x — measured as no advantage at all.
      // fricK 2 and gripHold 20: the ratchet needs the released phase to
      // GLIDE and the gripped phase to HOLD, and at fricK 6 both phases were
      // overdamped against a 0.7 s gait.
      gripBase: 0.55, gripMod: 0.9, fricK: 2.0, gripAnchor: 1.0,
      // Substrate. gritScale sets how big a patch of purchase is; slipBase is the
      // drag left on frictionless ground (open water); gripAniso is how much
      // harder sideways slip is than sliding along your own body, which is the
      // ratio that converts undulation into travel.
      gritScale: 0.12, gritSeed: 4242, slipBase: 0.15, gripAniso: 6.0,
      // CONTEST ON. This is what makes moving pay, and nothing else measured
      // does. Over four seeds, correlating each body's displacement with its
      // energy change and comparing top and bottom quartile of movers:
      //
      //     control (crowdK 0)        swing -2.3  sd 2.2  positive 1/4
      //     crowdK 3 alone            swing -1.7  sd 3.3  positive 1/4
      //     crowdK 3 + contest 0.6    swing +2.4  sd 2.8  positive 3/4
      //
      // Crowding suppression alone does NOT flip the sign — it starves movers
      // and sitters alike. What pays for locomotion is being able to take
      // energy from what you reach, which is primitives.md's consumption
      // primitive: roleless, graded, symmetric, and paid out of the same
      // conserved pool. Not conclusive at n=4 (separation from control is
      // ~2.6 SE) but consistent in direction, and it is the first setting in
      // this project where moving is not strictly punished.
      // ARMOUR MUST BE ABLE TO PAY. At 0.30 it broke even only against 3.3
      // SIMULTANEOUS attackers — upkeep is paid every second whether or not
      // anything is biting, while an attack costs contestRate * effort *
      // nutrition, about 0.09/s per attacker. Toughness duly collapsed from
      // 0.149 to 0.019 under consumption, which is selection pricing a defence
      // nobody could afford. 0.05 breaks even below one attacker, so armour is a
      // live option rather than a trap.
      bucketM: 32, contestRate: 0.6, toughCost: 0.05, contactR: 1.0, sizeScale: 1.0, sizeNorm: 1.0,
      // Cells are solid. This was silently 1.68e-44 for the life of the code —
      // see lib/uniform.js — so nothing has ever pushed back on anything. Sized
      // against springK so a bond can still hold a body together against the
      // repulsion of its own cells touching.
      contactK: 12.0,
      // Standing crop. nMotes 0 leaves the old analytic harvest in place.
      // moteR MUST NOT exceed hashCell. A mote counts its demanders by scanning
      // the cell hash 3x3 about itself, so it can only see cells within one
      // bucket; if a cell could graze from further than that it would take an
      // offer computed without it, the mote would go overdrawn, and the
      // max(0, ...) in moteCommit would clamp the debt away — minting exactly
      // the overdraft. Measured at moteR 1.6 vs hashCell 1.2: +162.9 units
      // created out of 10800 in a closed world with the sun switched off.
      // nMotes null means "cover the world" — resolved below from bound, since
      // food density is a property of area, not a number to be carried around.
      // Motes are ON by default: the analytic field they replace was unbounded
      // free energy and should not be what a run gets unless it asks.
            // 6.0, not 3.0. Developed bodies run 17-19 cells against a brain tax of
      // 0.45 each, so a body needs ~8/s and the ground beneath it was supplying
      // about the same — right at the edge, which showed up as a live world
      // grinding down to 8 alive on mean energy -6.4. The inflow's MAGNITUDE is
      // a free parameter; that there is exactly one bounded inflow is not.
      nMotes: null, moteR: 1.2, grazeRate: 2.2, moteRegrow: 6.0, moteCap: 1.0,
      moteHashSize: 16384,
      // 2.0 from measurement, not taste. Energy change of the top vs bottom
      // quartile of movers, 64 bodies over 30,000 steps:
      //   crowdK 0     movers -7.9   sitters -0.1   corr -0.39
      //   crowdK 0.6   movers +0.6   sitters -2.5   corr -0.20
      //   crowdK 2.0   movers +1.9   sitters -4.8   corr -0.00
      //   crowdK 6.0   movers +0.3   sitters -1.2   corr +0.10
      // 2.0 gives the widest gap in favour of moving. Higher suppresses regrowth
      // so hard that everyone is poor and the advantage shrinks again.
      // Density-relative now (draw vs refill), so this transfers between an empty
      // world and a crowded one. Viability at 600 cap over 22,500 steps:
      //   k 0    249 alive, 135 lineages      k 4    83 alive
      //   k 0.5  197 alive, 123 lineages      k 10   42 alive
      //   k 1.5  156 alive, 108 lineages
      // 1.5 keeps a healthy population and a real drawdown penalty.
      // 0.5, not 1.5. The viability sweep was run at 600 bodies in bound 102;
      // the live server runs 1200 in bound 74.4, which is roughly four times
      // denser, and 1.5 there took the population 95 -> 32 and still falling.
      // Tuning at one density and shipping to another is the same mistake the
      // raw-headcount version made, one level up.
      // 3.0, with contest above. Alone this only starves the world; together
      // they are the regime where movers out-earn sitters. Costs population:
      // 400-body assays settle near 190-210 alive rather than 400.
      regrowCrowdK: 3.0,
      waveAmp: 0.0, waveK: 6.0, waveOmega: 9.0, wavePhase: 1.5707963,
      // 0 keeps the previous behaviour exactly; sweep it before shipping.
      gripHold: 20.0,
      // 0.4. Swept over 300 bodies for 50,000 steps, tissue census and viability:
      //
      //     0     alive 300   neu  2.6  sen  3.6  mus 92.9  anc 1.0
      //     0.4   alive 300   neu  0.9  sen 29.4  mus 69.7  anc 0.0
      //     0.7   alive  61   neu 26.2  sen 29.9  mus 37.8  anc 6.1
      //     0.9   alive   8   dead
      //
      // At 0 the world is a muscle monoculture — 93%, with sensors at 3.6% —
      // because feeding was free and force was cheap, so there was no reason to
      // be anything else. 0.4 takes sensors to 29% with the population intact.
      // 0.7 buys genuine four-way differentiation and the world cannot carry it
      // yet; that is the interesting direction once the economy is richer.
      absorbTradeoff: 0.4,
      // Compass on. Acuity is per-cell and evolved; this is only the weight.
      compass: 1.0, senseNoise: 1.0, senseCost: 0.25,
      // Perceiving other creatures. Range is a few body-lengths.
      // SHORT RANGE, AND THAT IS A REAL LIMIT, not a tuning choice.
      //
      // The neighbour walk is 3x3 buckets of hashCell 1.2, so it can only ever
      // reach 1.8 world units — about two and a half cell diameters. A sigma of
      // 6.0 was set first and silently truncated to a tenth of itself: the maths
      // looked like vision and the walk delivered touch.
      //
      // 0.6 puts three sigma at the edge of what the walk actually sees, so the
      // receptive field is the shape it claims to be. This is therefore a
      // PROXIMITY sense — something big moving right beside me — and long-range
      // perception needs a different structure (a coarse field, or a second
      // hash), not a bigger number here. PHYSICS-2.md is the argument for why
      // that must not simply become another neighbourhood walk.
      // MATCHED, and costed. The walk reaches senseBuckets * hashCell, so three
      // sigma must fit inside it or the receptive field is silently truncated —
      // which happened once already at sigma 6.0 against a reach of 1.8, where
      // the maths described vision and the walk delivered touch.
      //
      //   buckets 1 (reach 1.2)   105 steps/s
      //   buckets 2 (reach 2.4)    95
      //   buckets 4 (reach 4.8)    77      <- shipped
      //   buckets 6 (reach 7.2)    63
      //   off                     115
      //
      // Perception costs a third of the world's throughput. That is the price of
      // any creature being able to perceive any other at all, and it is paid only
      // by cells that are sensors.
      senseOther: 0.35, senseRange: 1.6, senseBuckets: 4.0,
      dt: brains.dt, ...params,
    };
    // Motes. Scattered by a hash of their index rather than laid on a lattice:
    // a lattice would put the world's food on a grid, which is the thing we do
    // not do, and would also give every patch the same size and spacing. Random
    // scatter clumps and thins the way real ground does, for free.
    if (this.params.nMotes == null) {
      // One mote per two square units: with moteR 1.2 a cell has about two in
      // reach, so ground is granular enough to be exhausted patch by patch
      // rather than all at once.
      this.params.nMotes = Math.round((2 * this.params.bound) ** 2 / 2);
    }
    const nM = this.params.nMotes | 0;
    const mv = new Float32Array(Math.max(1, nM) * 4);
    {
      let sd = (this.params.moteSeed ?? 20260803) >>> 0;
      const rnd = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
      const B = this.params.bound;
      for (let i = 0; i < nM; i++) {
        mv[i * 4] = (rnd() * 2 - 1) * B;
        mv[i * 4 + 1] = (rnd() * 2 - 1) * B;
        // Start full, so the opening moments are not an artificial famine.
        mv[i * 4 + 2] = this.params.moteCap;
      }
    }
    const mkS = (a) => {
      const b = device.createBuffer({
        size: Math.max(16, a.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      device.queue.writeBuffer(b, 0, a);
      return b;
    };
    this.bMote = mkS(mv);
    this.bMoteHash = device.createBuffer({
      size: Math.max(16, this.params.moteHashSize * (1 + this.params.bucketM) * 4),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    if (nM > 0 && this.params.moteR > this.params.hashCell) {
      throw new Error(
        `moteR ${this.params.moteR} exceeds hashCell ${this.params.hashCell}: motes ` +
        `would be grazed by cells they never counted, and the overdraft would be ` +
        `minted. Raise hashCell or lower moteR.`);
    }
    this.moteGroups = nM > 0 ? Math.ceil(nM / WORKGROUP) : 0;

    this.bHash = device.createBuffer({
      size: this.params.hashSize * (1 + this.params.bucketM) * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.bParams = device.createBuffer({
      size: layout().size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.writeParams();

    const ro = { type: 'read-only-storage' }, rw = { type: 'storage' };
    const C = GPUShaderStage.COMPUTE;
    this.layout = device.createBindGroupLayout({
      label: 'world',
      entries: [
        { binding: 0, visibility: C, buffer: { type: 'uniform' } },
        { binding: 1, visibility: C, buffer: rw },   // pos
        { binding: 2, visibility: C, buffer: rw },   // vel
        { binding: 3, visibility: C, buffer: ro },   // cmeta
        { binding: 4, visibility: C, buffer: ro },   // bond index + rest, packed
        { binding: 5, visibility: C, buffer: rw },   // ext, written by sense()
        { binding: 6, visibility: C, buffer: ro },   // act, read by physics()
        { binding: 7, visibility: C, buffer: rw },   // energy, per cell
        { binding: 8, visibility: C, buffer: rw },   // spatial-hash occupancy
        { binding: 9, visibility: C, buffer: rw },   // motes: x, y, stock, demanders
        { binding: 10, visibility: C, buffer: rw },  // mote hash (built once)
      ],
    });
    const module = device.createShaderModule({ code: SHADER, label: 'world' });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipeSense = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'sense' } });
    this.pipePhysics = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'physics' } });
    this.pipeHashClear = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'hashClear' } });
    this.pipeHashBuild = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'hashBuild' } });
    this.pipeEnergy = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'energyCommit' } });
    this.pipeMoteOffer = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'moteOffer' } });
    this.pipeMoteCommit = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'moteCommit' } });
    this.pipeMoteHashClear = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'moteHashClear' } });
    this.pipeMoteHashBuild = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'moteHashBuild' } });

    this.bindGroup = device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.bParams } },
        { binding: 1, resource: { buffer: this.bPos } },
        { binding: 2, resource: { buffer: this.bVel } },
        { binding: 3, resource: { buffer: this.bMeta } },
        { binding: 4, resource: { buffer: this.bBondD } },
        { binding: 5, resource: { buffer: brains.bExt } },
        { binding: 6, resource: { buffer: brains.bAct } },
        { binding: 7, resource: { buffer: this.bEnergy } },
        { binding: 8, resource: { buffer: this.bHash } },
        { binding: 9, resource: { buffer: this.bMote } },
        { binding: 10, resource: { buffer: this.bMoteHash } },
      ],
    });
    this.groups = Math.ceil(this.n / WORKGROUP);
    this.bRead = device.createBuffer({
      size: this.n * 4 * 2, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Motes do not move, so their hash is built once here rather than each step.
    if (this.moteGroups > 0) {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setBindGroup(0, this.bindGroup);
      pass.setPipeline(this.pipeMoteHashClear);
      pass.dispatchWorkgroups(Math.ceil(this.params.moteHashSize / WORKGROUP));
      pass.setPipeline(this.pipeMoteHashBuild);
      pass.dispatchWorkgroups(this.moteGroups);
      pass.end();
      device.queue.submit([enc.finish()]);
    }
  }

  /** Mote stock, for the viewer and for conservation checks. */
  async readMotes() {
    if (!this.moteGroups) return { pos: new Float32Array(0), stock: new Float32Array(0) };
    if (this.params.nMotes == null) {
      // One mote per two square units: with moteR 1.2 a cell has about two in
      // reach, so ground is granular enough to be exhausted patch by patch
      // rather than all at once.
      this.params.nMotes = Math.round((2 * this.params.bound) ** 2 / 2);
    }
    const nM = this.params.nMotes | 0;
    const ss = this.device.createBuffer({
      size: nM * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.bMote, 0, ss, 0, nM * 16);
    this.device.queue.submit([enc.finish()]);
    await ss.mapAsync(GPUMapMode.READ);
    const raw = new Float32Array(ss.getMappedRange().slice(0));
    ss.unmap(); ss.destroy();
    const pos = new Float32Array(nM * 2), stock = new Float32Array(nM);
    for (let i = 0; i < nM; i++) {
      pos[i * 2] = raw[i * 4]; pos[i * 2 + 1] = raw[i * 4 + 1];
      stock[i] = raw[i * 4 + 2];
    }
    return { pos, stock };
  }

  writeParams(patch = {}) {
    Object.assign(this.params, patch);
    const p = this.params;
    // Every field by NAME. No offsets are written here or anywhere else; see
    // lib/uniform.js for why that matters.
    const buf = writeUniform({
      ...p,
      nCells: this.n,
      bondK: this.bondK,
      bondDamp: p.bondDamp ?? 0.7 * Math.sqrt(p.springK),
      worldTime: (this.steps ?? 0) * p.dt,
    });
    this.device.queue.writeBuffer(this.bParams, 0, buf);
  }

  /**
   * `n` full world steps: sense -> activate -> integrate -> physics, all in one
   * compute pass and one submit. Nothing is read back.
   */
  step(n = 1) {
    const b = this.brains;
    // Republish the clock before each batch. The field is constant within a
    // batch, which is fine because it drifts far slower than a batch lasts, but
    // it must advance BETWEEN batches or the world is static again and the
    // whole point of a moving optimum is lost.
    //
    // UNCONDITIONAL. This used to skip the write when drift and morphRate were
    // both zero, which is true of every isolated assay in tools/ — so in those
    // worlds P.worldTime was frozen at 0 forever. Nothing depended on it until
    // the imposed-wave diagnostic did, and then sin(axial*k - worldTime*omega)
    // silently became a STATIC deformation: three different frequencies
    // produced byte-identical displacement, which is what gave it away. A
    // clock that only ticks when someone else needs it is not a clock. One
    // uniform write per batch is nothing.
    this.writeParams();
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    for (let s = 0; s < n; s++) {
      pass.setBindGroup(0, this.bindGroup);
      // Rebuild the occupancy index from where bodies actually are, every step.
      pass.setPipeline(this.pipeHashClear);
      pass.dispatchWorkgroups(Math.ceil(this.params.hashSize / 256));
      pass.setPipeline(this.pipeHashBuild); pass.dispatchWorkgroups(this.groups);
      // Motes decide what they can afford to give BEFORE anyone takes, using
      // the cell hash just rebuilt above.
      if (this.moteGroups > 0) {
        pass.setPipeline(this.pipeMoteOffer); pass.dispatchWorkgroups(this.moteGroups);
      }
      pass.setPipeline(this.pipeSense); pass.dispatchWorkgroups(this.groups);

      pass.setBindGroup(0, b.bindGroup);
      pass.setPipeline(b.pipeActivate); pass.dispatchWorkgroups(b.groups);
      pass.setPipeline(b.pipeIntegrate); pass.dispatchWorkgroups(b.groups);

      pass.setBindGroup(0, this.bindGroup);
      pass.setPipeline(this.pipePhysics); pass.dispatchWorkgroups(this.groups);
      pass.setPipeline(this.pipeEnergy); pass.dispatchWorkgroups(this.groups);
      if (this.moteGroups > 0) {
        pass.setPipeline(this.pipeMoteCommit); pass.dispatchWorkgroups(this.moteGroups);
      }
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
    b.steps += n;
    this.steps = (this.steps ?? 0) + n;
  }

  /** Pull cell positions back — for logging, the inspector, or a snapshot. */
  async readPositions() {
    // Per-call staging, for the same reason as BrainArenaGPU.readState: a
    // shared one breaks the moment two readbacks overlap.
    const staging = this.device.createBuffer({
      size: this.n * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.bPos, 0, staging, 0, this.n * 8);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const packed = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap(); staging.destroy();
    const x = new Float32Array(this.n), y = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) { x[i] = packed[i * 2]; y[i] = packed[i * 2 + 1]; }
    return { x, y, packed };
  }

  /**
   * Per-cell energy and position together — everything the selector needs.
   *
   * This is the ONE readback in the evolutionary loop, and it is deliberately
   * small and infrequent: a few hundred KB once per generation tick, versus the
   * thousands of physics steps in between that never leave the GPU. Birth and
   * death are structural events (allocation, mutation, lineage bookkeeping) and
   * belong on the CPU; the per-step simulation does not.
   */
  async readCells() {
    const n = this.n;
    const staging = this.device.createBuffer({
      size: n * 4 * 3, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.bPos, 0, staging, 0, n * 8);
    enc.copyBufferToBuffer(this.bEnergy, 0, staging, n * 8, n * 4);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const raw = staging.getMappedRange();
    const pos = new Float32Array(raw.slice(0, n * 8));
    const energy = new Float32Array(raw.slice(n * 8, n * 12));
    staging.unmap(); staging.destroy();
    return { pos, energy };
  }

  /** Write one organism's contiguous cell range back after a birth or death. */
  writeCellRange(from, count, { pos, vel, meta, bond, brest, bstiff, bbrittle, energy }) {
    const q = this.device.queue;
    if (pos) q.writeBuffer(this.bPos, from * 8, pos);
    if (vel) q.writeBuffer(this.bVel, from * 16, vel);
    if (meta) q.writeBuffer(this.bMeta, from * 16, meta);
    if (bond || brest) {
      const nb = (bond ?? brest).length;
      const bd = new Float32Array(nb * 4), bdI = new Int32Array(bd.buffer);
      for (let i = 0; i < nb; i++) {
        bdI[i * 4] = bond ? bond[i] : -1;
        bd[i * 4 + 1] = brest ? brest[i] : 0;
        bd[i * 4 + 2] = bstiff ? bstiff[i] : 1.0;
        bd[i * 4 + 3] = bbrittle ? bbrittle[i] : 0.0;
      }
      q.writeBuffer(this.bBondD, from * this.bondK * 16, bd);
    }
    if (energy) q.writeBuffer(this.bEnergy, from * 4, energy);
  }

  destroy() {
    for (const b of [this.bMote, this.bMoteHash,
                     this.bPos, this.bVel, this.bMeta, this.bBondD,
      this.bEnergy, this.bHash, this.bParams, this.bRead]) b.destroy();
  }
}
