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
export function packSize(bodySize, tag, toughness, enzyme = 0.5) {
  // Nutrition is not stored — it is read from the cell's own energy at use
  // time. That byte now carries the surface TAG instead.
  const q = (v) => Math.max(0, Math.min(255, Math.round((v || 0) * 255)));
  const q7 = (v) => Math.max(0, Math.min(127, Math.round((v || 0) * 127)));
  return (Math.max(0, Math.min(255, bodySize | 0)))
       | (q(tag) << 8) | (q(toughness) << 16) | (q7(enzyme) << 24);
}
export function packMeta(type, contractility, grippiness, apNorm = 0.5, senseTune = 0) {
  // A SLOT THAT IS NOT A CELL MUST PACK NEGATIVE.
  //
  // Every kernel decides whether a slot is real with `cmeta[i].x < 0`, and the
  // type went in as `type & 3`. For an unallocated slot ctype is -1, and
  // -1 & 3 is 3 — a perfectly valid "anchor", with bit 31 clear, so the result
  // was POSITIVE and the test never fired.
  //
  // Measured on a fresh 400-body world with maxCells 60: 24,000 slots, 4,800
  // of them owned by an organism, and 24,000 that the kernel treated as living
  // cells. EIGHTY PER CENT OF THE SIMULATION WAS PHANTOMS — bodiless anchor
  // cells sitting in the spatial hash, colliding, grazing, being contested,
  // and costing their full share of every neighbourhood walk.
  //
  // Two things that follow, both of which had been chased elsewhere:
  //   - the physics was doing five times the work it needed to in any world
  //     that had not yet filled its arena, which is every world at startup and
  //     every experiment run at a small cap;
  //   - any population statistic averaged over the arena was four fifths
  //     frozen defaults, which is why trait means looked pinned near zero and
  //     barely moved. The instrument was reading mostly nothing.
  //
  // vacate() has always written -1 explicitly, so DYING was handled and being
  // BORN-INTO-A-FRESH-ARENA was not.
  if (!(type >= 0)) return -1;
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

// GRADIENT (Perlin) noise, not value noise.
//
// This was value noise — interpolate a random VALUE at each lattice corner —
// and value noise has a defect you can see: its extrema are pinned to the
// integer lattice, so the field is full of blobs sitting on a square grid and
// the artifacts line up with the axes. Zoomed out that reads as visible
// squares, which is exactly what the world's background looked like, and no
// amount of octaves removes it because every octave has it.
//
// Perlin noise instead puts a random unit GRADIENT at each corner and
// interpolates the ramps. The value at every lattice point is then zero, the
// features sit BETWEEN the corners rather than on them, and the result has no
// preferred direction. It is the difference between a landscape and a
// tablecloth.
//
// The fade is Perlin's improved quintic 6t^5-15t^4+10t^3, whose second
// derivative also vanishes at the ends — the cubic smoothstep leaves a
// curvature discontinuity across every cell edge, which shows up as faint
// creases exactly where the grid is.
// ONE HASH, TWO COMPONENTS. The obvious way to get a random 2D gradient is two
// hashes, and that DOUBLED the cost of every noise evaluation the moment the
// noise became Perlin — against a background that had grown to ~26 fbm per cell
// per step, which is where the headless rate went.
//
// A hash produces 32 bits and a gradient direction needs far fewer than 32 bits
// of entropy, so the two halves of one hash are plenty: they are independent
// enough for a direction nobody can predict by eye, and the normalisation
// removes any bias in their joint distribution. Same visual result, half the
// hashing, on the single hottest function in the whole system.
fn grad2(ix: i32, iy: i32, seed: u32) -> vec2<f32> {
  var h : u32 = (u32(ix) * 374761393u) ^ (u32(iy) * 668265263u) ^ (seed * 1274126177u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  let g = vec2<f32>(f32(h & 0xffffu) * (2.0 / 65536.0) - 1.0,
                    f32(h >> 16u)    * (2.0 / 65536.0) - 1.0);
  return g * inverseSqrt(max(1e-6, dot(g, g)));
}

fn vnoise(p: vec2<f32>, seed: u32) -> f32 {
  let i = floor(p);
  let f = p - i;
  let ix = i32(i.x); let iy = i32(i.y);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let n00 = dot(grad2(ix,     iy,     seed), f);
  let n10 = dot(grad2(ix + 1, iy,     seed), f - vec2<f32>(1.0, 0.0));
  let n01 = dot(grad2(ix,     iy + 1, seed), f - vec2<f32>(0.0, 1.0));
  let n11 = dot(grad2(ix + 1, iy + 1, seed), f - vec2<f32>(1.0, 1.0));
  let n = mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
  // Perlin is signed and centred; every caller here expects 0..1. The scale
  // brings the practical range up to about full width — 2D gradient noise peaks
  // near 0.7, and octave sums cancel further, so without this the whole world
  // would be a narrow band around 0.5 and every field calibrated against the
  // old noise would go slack.
  return clamp(n * 1.36 + 0.5, 0.0, 1.0);
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
// STOPS AT THE REQUESTED DEPTH. This used to run all six octaves regardless,
// weighting the unwanted ones to zero, on the reasoning that a fixed bound
// costs the same for every invocation and cannot diverge. That reasoning was
// right about divergence and wrong about cost: octF comes from the UNIFORM
// block, so it is identical for every lane in flight and an early exit is
// perfectly uniform — there is no divergence to avoid and the zero-weight
// octaves were pure waste.
//
// It stopped being free when the noise became Perlin (eight hashes a lattice
// cell rather than four) and the terrain grew a domain warp and a ridge term:
// the background went to roughly thirty fbm evaluations a pixel, the browser
// ate the GPU, and the simulation sharing it fell to a third of the rate it
// runs at headless. Zoomed out, where octF is near 2, this is a 3x saving on
// every single evaluation in the renderer AND in the physics.
fn fbmOct(p: vec2<f32>, seed: u32, octF: f32) -> f32 {
  var f = 0.0; var amp = 1.0; var norm = 0.0; var q = p;
  for (var o = 0u; o < 6u; o = o + 1u) {
    let w = clamp(octF - f32(o), 0.0, 1.0);
    if (w <= 0.0) { break; }
    f = f + amp * w * vnoise(q, seed + o * 1013u);
    norm = norm + amp * w;
    amp = amp * 0.5; q = q * 2.0;
  }
  return f / max(norm, 1e-6);
}

// The simulation always wants full detail: a cell samples the field at a POINT,
// so there is no pixel to alias against and nothing to band-limit.
// THREE OCTAVES, NOT FOUR. Cheap and cheerful: the fourth octave has features
// about seven world units across against a terrain whose basins are fifty, and
// nothing in the physics can tell it is gone — gravity reads a gradient, grit
// reads a scalar, wetness reads a threshold, and none of them resolve detail at
// that scale. It was costing a quarter of every noise evaluation in the world.
fn fbm(p: vec2<f32>, seed: u32) -> f32 { return fbmOct(p, seed, 3.0); }

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
// SURFACE IDENTITY and DIGESTIVE REACH, the pair that makes diets differ.
//
// tag is what you are made of; enzyme is what you can break down. You can only
// eat what your enzyme MATCHES, so eating one thing well means eating another
// badly, and a specialist and a generalist become genuinely different livings
// rather than the same living done harder.
//
// The point of this is not variety for its own sake. A predator tuned to the
// COMMON tag leaves the rare tag alone, so being unusual is an advantage that
// grows as you become rarer — negative frequency-dependent selection, which is
// the standard force that MAINTAINS diversity rather than eroding it. Lineages
// collapsed from 245 to 3 in every arm of the last experiment; this is the
// mechanism that should stop that, and whether it does is a measurement.
fn tagOf(w: i32) -> f32 { return f32((w >> 8u) & 255) / 255.0; }
fn enzymeOf(w: i32) -> f32 { return f32((w >> 24u) & 127) / 127.0; }
// Gaussian in tag space. Narrow = a world of specialists, wide = generalists.
fn digestMatch(eater: i32, eaten: i32) -> f32 {
  let d = enzymeOf(eater) - tagOf(eaten);
  return exp(-(d * d) / max(1e-5, 2.0 * P.dietWidth * P.dietWidth));
}
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
fn gritAtM(p: vec2<f32>, m: f32) -> f32 {
  // Mud is slippery: purchase is what it takes away, so the anchor-extend-release
  // ratchet simply fails there and a creature is at the mercy of the flow.
  let g = clamp(fbm(p * P.gritScale, P.gritSeed) * 1.6, 0.0, 1.0);
  return g * (1.0 - P.mudSlip * m);
}
fn gritAt(p: vec2<f32>) -> f32 { return gritAtM(p, mudAt(p)); }

// ---------------------------------------------------------------- GEOGRAPHY
//
// Two analytic scalar fields, and everything below is sampled at a cell's OWN
// position. Nothing consults anything remote — a cell feels the ground under
// itself and the medium against its own skin. Think global, act local: the
// pattern is worldwide, the interaction is entirely here.
//
// Analytic rather than a grid because they are FREE that way. An fbm evaluation
// is a few dozen ALU ops against a budget we use a fraction of a percent of,
// while a grid is bandwidth, which is the thing the kernel is actually short of
// (PHYSICS-2.md). There is also no resolution to zoom past.
//
// HEIGHT is read as elevation on a plane seen from above. Below zero is under
// water, above zero is land, and the "high" ground is high in the sense that
// matters in two dimensions: dense, hard to cross, and expensive to be in.
// Gravity is the in-plane force -grad(height), which is a TILTED PLANE and needs
// no side view: things roll downhill, matter pools in basins, and ridges divide
// the world into places.
// DOMAIN WARP — why the landscape winds instead of blobbing.
//
// Plain fbm makes lumps. Every feature is a rounded patch, coastlines are
// scalloped circles, and nothing meanders, because the function has no
// mechanism for bending: it is a sum of isotropic octaves and isotropic is
// exactly what a river is not. Warping the COORDINATE before sampling —
// f(p + w*f(p)) — feeds the field's own structure back into where it is read,
// which drags features sideways along other features. That is what produces
// the winding, folded, delta-like shapes; it is one extra pair of evaluations
// and it changes the character of the world completely.
fn warp2(p: vec2<f32>, seed: u32, amt: f32) -> vec2<f32> {
  // ONE AND A HALF OCTAVES, not four. The warp's job is to bend the coordinate
  // on a large scale; fine detail in the OFFSET is invisible, because it is
  // immediately swallowed by the detail of the field being sampled at the
  // offset position. Two full fbm evaluations here were most of heightAt's cost
  // and bought nothing you can see.
  let a = fbmOct(p, seed, 1.5) - 0.5;
  let b = fbmOct(p + vec2<f32>(5.2, 1.3), seed + 3701u, 1.5) - 0.5;
  return p + amt * vec2<f32>(a, b);
}

// RIDGES — the sharp crest lines. 1 - |2f-1| is v-shaped about f = 0.5, so its
// maximum is the CONTOUR f = 0.5, which is a winding curve rather than a patch.
// Raised to a power that curve narrows into a thread. Used one way up it is a
// mountain crest; used with the terrain sunk around it, it is a watercourse.
fn ridge(p: vec2<f32>, seed: u32) -> f32 {
  // TWO THINGS THIS NEEDS, both learned by looking at the result.
  //
  // A SMOOTH BASE. Ridging a full six-octave fbm shatters the crest: every fine
  // octave crosses the 0.5 level set somewhere else, so instead of one winding
  // line you get a scatter of disconnected fragments. Measured that way, 10% of
  // the world was "channel" and none of it went anywhere. A few octaves give a
  // crest that is continuous, which is the entire point — a river that is not
  // connected is a puddle.
  //
  // CONTRAST FIRST. Perlin fbm clusters tightly about 0.5, so |2f-1| is small
  // and 1-|2f-1| is near 1 nearly everywhere — the "ridge" would be the whole
  // map. Widening the distribution before ridging is what makes the crest a
  // crest. (Value noise did not need this, which is why it only showed up after
  // the switch.)
  let f = clamp((fbmOct(p, seed, 2.0) - 0.5) * 2.6 + 0.5, 0.0, 1.0);
  return 1.0 - abs(2.0 * f - 1.0);
}

fn heightAt(p: vec2<f32>) -> f32 {
  let q = warp2(p * P.heightScale, P.heightSeed, P.warpAmt);
  let base = fbm(q, P.heightSeed) * 2.0 - 1.0;                 // -1 deep .. +1 peak
  if (P.ridgeAmt <= 0.0) { return base; }
  // Crests, and only up high. Adding ridges everywhere corrugates the sea bed
  // and the plains too, which reads as noise; gating on the base height means
  // the lowlands stay smooth and open and the uplands turn craggy, which is
  // both the shape real terrain has and the shape this world's economics
  // describe (highSap makes the heights the hard country).
  let r = ridge(q * 2.3, P.heightSeed + 911u);
  return base + P.ridgeAmt * r * r * smoothstep(-0.05, 0.55, base);
}
fn heightGrad(p: vec2<f32>) -> vec2<f32> {
  let e = 0.6 / max(1e-4, P.heightScale);
  return vec2<f32>(heightAt(p + vec2<f32>(e, 0.0)) - heightAt(p - vec2<f32>(e, 0.0)),
                   heightAt(p + vec2<f32>(0.0, e)) - heightAt(p - vec2<f32>(0.0, e))) / (2.0 * e);
}
// FORWARD DIFFERENCE, REUSING THE CENTRE. The central version costs four height
// evaluations and heightAt is four fbm each, so gravity alone was sixteen fbm
// per cell per step. Given h at p — which the caller already needs for other
// reasons — two more samples give the same gradient to first order at half the
// price. The asymmetry is a fraction of a cell wide and nothing can feel it.
fn heightGradFrom(p: vec2<f32>, h: f32) -> vec2<f32> {
  let e = 0.6 / max(1e-4, P.heightScale);
  return vec2<f32>(heightAt(p + vec2<f32>(e, 0.0)) - h,
                   heightAt(p + vec2<f32>(0.0, e)) - h) / e;
}
// MUD is wet ground: it takes away purchase, it flows, and it fouls the senses.
// A mud river is therefore transport you cannot steer and cannot see out of —
// fast, free, and it puts you somewhere you did not choose.
//
// The field is RIDGED and warped, so mud is not scattered wet patches but a
// branching network of narrow winding channels — which is what wet ground
// actually looks like, and much more importantly is what makes it USEFUL: a
// broad damp region is somewhere to avoid, while a channel is somewhere that
// goes from one place to another. Transport needs a route.
// The raw ridge value, before any threshold. This is the useful quantity and
// both mud and shore are cut out of it: r peaks at 1 along the channel's
// centre-line and falls away outward, so it is a cheap analytic PROXY FOR
// DISTANCE TO WATER. Everything downstream is a band in r.
fn wetRidge(p: vec2<f32>) -> f32 {
  return ridge(warp2(p * P.mudScale, P.mudSeed, P.warpAmt * 1.4), P.mudSeed);
}

// ONE WETNESS SCALE, because THE SEA IS MUD.
//
// Mud was the channel field alone, and height was a separate story, so the open
// water was not mud: the big bays sat perfectly still while narrow ribbons of
// channel ran across dry land. That is two geographies pretending to be one,
// and it showed — the transport system was invisible exactly where the water is.
//
// Both are now the same quantity, mapped onto a common scale where 0.5 is the
// waterline: a channel approaching its bank and ground approaching sea level
// arrive at the same number, and wetness is whichever is wetter. Everything
// downstream — what moves, what grips, what you can see out of, and where
// anything grows — is a band in this one scalar.
// The wetness maths, separated from the sampling, so a caller that already has
// the height and the channel ridge in hand does not pay for them twice. Both of
// these were being recomputed five or six times per cell per step — heightAt
// alone is four fbm, and it was reached through gravity, grit, flow, the
// metabolic terrain cost and fertility, independently, every step.
fn wetnessFrom(h: f32, r: f32) -> f32 {
  return max(smoothstep(P.mudBank - P.shoreWidth, P.mudBank + P.shoreWidth, r),
             smoothstep(0.45, -0.45, h));
}
fn mudFrom(w: f32) -> f32 { return smoothstep(0.50, 0.76, w); }
fn shoreFrom(w: f32) -> f32 {
  return smoothstep(0.17, 0.40, w) * (1.0 - smoothstep(0.44, 0.63, w));
}

fn wetnessAt(p: vec2<f32>) -> f32 {
  // Both ramps are CENTRED ON THEIR OWN WATERLINE — the channel's midpoint is
  // exactly mudBank, the sea's is exactly height zero — so 0.5 means the same
  // thing in both and taking the max of them is meaningful rather than a
  // coincidence of two arbitrary scales.
  return wetnessFrom(heightAt(p), wetRidge(p));
}

fn mudAt(p: vec2<f32>) -> f32 { return mudFrom(wetnessAt(p)); }

// THE SHORE — a band hugging the OUTSIDE of the channel, and the only place
// worth living.
//
// The fertile region was "everything that is not mud and not very high", which
// is most of the world: a half-continent of arable land with a river through
// it. That is not the intent and it is not a pressure. What is meant is
// narrower and entirely about distance to water — jungle and life on the
// shores, just inland of the mud; and the further inland you go the more it
// becomes rock: fixed, empty, lifeless.
//
// So it is a band in r rather than a band in height. It rises as you approach
// the channel from the dry side, and collapses the moment you are actually IN
// it — because in the mud you cannot grip, cannot see, and are going wherever
// the current takes you. Height only trims the top: a beach halfway up a
// mountain is still a beach, but the high country is poor wherever it is.
// A band just DRY of the waterline: rises as you come down to the water, and
// collapses the moment you are in it.
fn shoreAt(p: vec2<f32>) -> f32 { return shoreFrom(wetnessAt(p)); }

fn flowAt(p: vec2<f32>) -> vec2<f32> { return flowAtM(p, mudAt(p)); }

fn flowAtM(p: vec2<f32>, m: f32) -> vec2<f32> {
  // The medium pushes harder where the ground is wet. Same analytic curl field,
  // scaled locally, so a mud channel becomes a current without any new machinery.
  // THE MUD IS THE THING THAT MOVES. The current used to run everywhere at full
  // strength with mud merely amplifying it, so the whole world was a river and
  // the dry land was being swept along with the channels. That is backwards:
  // away from the water the ground is fixed, and increasingly rocky and empty
  // the further inland you get. flowDry is what little stirring remains out
  // there — enough that the air is not perfectly dead, not enough to carry
  // anything anywhere.
  let s = P.flowStr * (P.flowDry + P.mudFlow * m);

  // TWO SCALES, AND THE COARSE ONE IS THE LANDSCAPE.
  //
  // The flow was one curl field at flowScale 0.9, which means eddies about ONE
  // WORLD UNIT across — roughly a cell and a half. That is turbulence, not
  // weather: it has no large-scale direction at all, so a body is jostled but
  // never carried anywhere, and drawn as arrows on any lattice coarser than an
  // eddy it aliases into pure noise. Which is exactly how it looked: a vector
  // field with no visible relationship to the world it runs over.
  //
  // The coarse component is the curl of the HEIGHT field's own base — the same
  // function, the same seed. Curl means perpendicular to the gradient, so this
  // current runs ALONG the contours: around the islands, down the length of the
  // valleys, hugging the coast. Which is what water in a landscape does, and it
  // is why it now looks like it belongs to the terrain — it is made of it.
  //
  // Cheap, because it reuses flowField rather than differencing the full warped
  // and ridged heightAt: the ridges are a detail of the tops, and the shape a
  // current follows is the shape of the land underneath them.
  let fine = flowField(p, P.flowScale, s, P.seed);
  if (P.flowTerrain <= 0.0) { return fine; }
  // NORMALISE THE COARSE COMPONENT'S SPEED. A curl is a gradient, so the same
  // potential spread over fifty times the distance gives a fiftieth of the
  // velocity: mixing the two raw made the world's current SIXTY PER CENT
  // WEAKER and drew arrows that had all but disappeared. What is wanted here is
  // the same speed organised on a different scale, not a slower medium, so the
  // strength is scaled by the ratio of the two scales — after which the mix is a
  // genuine blend of two currents rather than a fade toward nothing.
  let coarse = flowField(p, P.heightScale,
                         s * (P.flowScale / max(1e-5, P.heightScale)), P.heightSeed);
  return mix(fine, coarse, P.flowTerrain);
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

// LUSH LOWLANDS, CRAGGY HEIGHTS.
//
// Fertility was independent of terrain, which made height a pure tax: the
// uplands cost more to occupy (highSap) and offered nothing, so the only
// rational strategy was to be low, and a frontier nobody has a reason to cross
// is not a frontier. The coupling that makes height a real choice is that
// what runs downhill — water, silt, everything dissolved in them — is what
// makes ground rich. Lowlands are fertile BECAUSE they are low.
//
// So the heights become genuinely poor as well as genuinely expensive. That
// looks like it closes the frontier rather than opening it, and it is the
// opposite: poor, costly ground is ground with no competition on it. A lineage
// that can live thin has the uplands to itself, and one that cannot has to
// fight for the valleys. That is two ways of making a living, which is what a
// guild is, and it is the thing this world has so far failed to produce.
fn resourceAt(p: vec2<f32>) -> f32 { return resourceAtS(p, shoreAt(p)); }

fn resourceAtS(p: vec2<f32>, shore: f32) -> f32 {
  let r = resourceField(p, P.resScale, P.resSeed, P.worldTime,
                        vec2<f32>(P.driftX, P.driftY), P.morphRate);
  if (P.lowLush <= 0.0) { return r; }
  // REDISTRIBUTES, does not reduce. The divisor is the measured mean of the
  // shore factor over the whole world (0.117), so total inflow is unchanged and
  // only its DISTRIBUTION moves. That mean is also the headline number: the
  // living shore is about 13% of the world and roughly EIGHT TIMES richer than
  // the average acre, against 67% moving water and 21% dead interior.
  //
  // That is a design decision about what is being tested, not tidiness. The
  // hypothesis is that spatial HETEROGENEITY maintains diversity. An uncorrected
  // multiplier also made the world 37% poorer, so a geography-on/geography-off
  // comparison would have measured carrying capacity and heterogeneity at once
  // and been unable to say which did the work. It is also the truer picture:
  // the same sun falls on the whole world, and terrain decides where what it
  // grows ends up.
  // THE FERTILE CRESCENT.
  //
  // Three regions, and the good one is in the middle of the other two.
  //
  // THE SEA IS MUD. It is not a fertile deep — it is wet ground that moves in a
  // river form: fast transport, and expensive, because you cannot get purchase
  // in it and cannot see out of it. Nothing grows there worth the trip. (This
  // was written the other way round at first, as a single downhill ramp, which
  // made the deepest water the richest ground in the world and carpeted the
  // ocean in food. It also removed any reason to be on land.)
  //
  // THE HIGHLANDS ARE POOR. High in two dimensions means dense and hard going;
  // highSap already charges rent there, and there is little to eat on top of it.
  //
  // BETWEEN THEM is the arable band: out of the mud, not yet into the heights.
  // Rich, narrow, and — this is the point — a place a lineage can be pushed OUT
  // of in EITHER direction. A half-plane has one frontier; a band has two, and
  // the two are nothing like each other. Being driven downhill and being driven
  // uphill are different problems demanding different animals, which is how a
  // single crowded optimum turns into more than one way of making a living.
  //
  // Plenty of ground is neither, and lineages will end up on it. That is fine
  // and expected: the world does not owe anyone a good address.
  let h = heightAt(p);
  let band = smoothstep(-0.10, 0.28, h) * smoothstep(0.92, 0.34, h);
  let dry = 1.0 - mudAt(p);
  return r * mix(1.0, band * dry / 0.2682, P.lowLush);
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
  // PROXIMITY, NOT TOUCH.
  //
  // Contest fired at contactR — the sum of two radii, about 0.68 world units —
  // so the entire biotic economy required organisms to be physically pressed
  // together. Touch is the strictest possible reading of "interacting", and it
  // is not the only real one: exudates, wounds, leaked contents and simple
  // interference all act across a gap, and every one of them is a way organisms
  // impose on each other without collision.
  //
  // This costs NOTHING extra structurally, which is what makes it the right
  // move rather than merely a bigger number: it is the same 3x3 walk over the
  // same hash, with a wider acceptance test inside it. PHYSICS-2.md's rule is
  // no NEW neighbourhood walk, and there is none. The reach is capped at what
  // the walk can actually see (3 x hashCell, minus a margin) — a radius larger
  // than the walk is a radius that silently sees only part of its own
  // neighbourhood, which is how the compass sense was truncated tenfold once
  // already.
  let reach = min(P.contestR, P.hashCell * 1.4);
  let r2 = reach * reach;
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
        // SHELTER — what a body of N cells can do that N solitary cells cannot.
        //
        // THE PROBLEM IT ADDRESSES, measured on the live world: a bigger body is
        // POORER PER CELL at every step of the range (correlation -0.263; bodies
        // of 15+ cells against 8-, -0.4041 +-0.0669). Every cost here is
        // per-cell and every benefit is per-cell, while crowding and
        // absorbTradeoff both penalise being a clump — so N cells bonded are
        // strictly worse off than N cells apart. The economy pays cells to come
        // apart. And differentiation needs cells to spare, so it taxes exactly
        // what differentiation is made of: bodies of 5-8 cells carry 1.09
        // tissues, bodies of 25-60 carry 1.46.
        //
        // A cell with its own tissue around it is harder to get at. That is the
        // missing economy of scale, it is available only to a body, and it
        // cannot be had by standing near strangers.
        //
        // WHY BODY SIZE AND NOT A NEIGHBOUR COUNT. Counting own-body cells in
        // this walk would be the truer geometry, and it breaks conservation:
        // cell i cannot see how many neighbours cell j has, so the two would
        // compute different transfers and energy would appear from nowhere. The
        // packed body size is readable by BOTH cells from the other's cmeta, so
        // both evaluate the same expression and the pair still agrees exactly —
        // the same discipline contest already follows.
        //
        // It names no predator and no defence. It is how much of you is behind
        // something else.
        let shieldJ = 1.0 / (1.0 + P.shelterK * bodySizeOf(cmeta[j].w));
        let shieldI = 1.0 / (1.0 + P.shelterK * bodySizeOf(cmeta[i].w));
        let take  = max(0.0, effort                 - toughnessOf(cmeta[j].w)) * nutritionOf(j)
                  * digestMatch(cmeta[i].w, cmeta[j].w) * shieldJ;
        let given = max(0.0, abs(contractionOf(j)) - toughnessOf(cmeta[i].w)) * nutritionOf(i)
                  * digestMatch(cmeta[j].w, cmeta[i].w) * shieldI;
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
        // COUNT COMPETITORS, NOT MOUTHS.
        //
        // Measured at deep time: crowding suppression accounts for about half
        // the tax on being multicellular (size tax -0.4160 -> -0.2012 with it
        // removed, +0.2148 +-0.1092, implicated) — because a body of N cells is
        // by construction a dense draw on one patch and therefore suppresses the
        // ground under itself N times over. It competes with itself.
        //
        // But it cannot simply be removed: doing so collapses the fraction of
        // bodies holding both a sensor and a muscle from 8.4% to 0.9%, because
        // crowding is also what makes sitting on a patch costly, which is what
        // makes moving pay. The bind:
        //
        //   to make moving pay, a patch must be punished for being worked;
        //   a body is a thing that works a patch;
        //   so the mechanism that makes moving pay punishes being a body.
        //
        // Weighting each drawing cell by size^-share resolves it rather than
        // choosing an end of it. At share 1 a body of twenty counts as ONE
        // competitor and twenty single-cell bodies count as twenty, so a crowd
        // still punishes sitting still while a body stops punishing itself.
        // Verified: the weights sum to the distinct-body count when a whole body
        // is present, and to a sensible fraction when only part of it is.
        //
        // CONSERVATION HOLDS AT ANY SHARE, which is what makes this safe. Body b
        // contributes n_b * n_b^-s to the count, and takes offer * n_b^(1-s), so
        // the total taken is offer * sum(n_b^(1-s)) = offer * W <= stock. The
        // grazing side is weighted by the same factor — see grazeAt.
        demanders = demanders + pow(bodySizeOf(cmeta[j].w), -P.grazeBodyShare);
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

  // ---- FOOD GOES WHERE THE WATER GOES ---------------------------------------
  //
  // Motes were nailed to their coordinates, on the argument that a patch you
  // cannot exhaust and have to leave is no pressure at all. That argument is
  // about DEPLETION and it survives drift intact: a patch you are working still
  // runs down under you, it simply also moves.
  //
  // What being nailed down cost was coherence. The world now says that mud is a
  // transport system carrying anything not holding on — and the most obvious
  // thing to be carried, silt and detritus and everything dissolved in it, sat
  // still while the water went past it. A river with a stationary riverbed of
  // food is not a river; it is a picture of one.
  //
  // With drift the shores GENERATE (fertility is highest just dry of the water)
  // and the channels CARRY, so food produced on a coast washes into a current
  // and is delivered somewhere else. That is a conveyor, and a conveyor is a
  // thing worth positioning yourself on — which is a reason to be near the
  // water that is not simply "the ground is better here".
  //
  // Motes drift at moteDrift x the flow: they are heavier than a swimming cell
  // and lag it, so a creature can still outrun its own food.
  if (P.moteDrift > 0.0) {
    let v = flowAt(p) * P.moteDrift;
    var np = p + v * P.dt;
    let B = P.bound;
    if (np.x >  B) { np.x = np.x - 2.0 * B; }
    if (np.x < -B) { np.x = np.x + 2.0 * B; }
    if (np.y >  B) { np.y = np.y - 2.0 * B; }
    if (np.y < -B) { np.y = np.y + 2.0 * B; }
    mote[i] = vec4<f32>(np.x, np.y, clamp(stock, 0.0, P.moteCap), 0.0);
    return;
  }
  mote[i] = vec4<f32>(m0.x, m0.y, clamp(stock, 0.0, P.moteCap), 0.0);
}

// PHASE 2 lives inside physics(): what cell i can pick up from the motes it is
// standing on, at the rate each of them already committed to.
// The share argument is this cell's weight, size^-grazeBodyShare, matching what
// the offer pass counted for it. Passing it in rather than recomputing keeps both
// sides of the conservation argument as literally the same expression.
fn grazeAt(p: vec2<f32>, share: f32) -> f32 {
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
        got = got + moteOfferOf(mv) * share;
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
  // FEELING THE GROUND — wet, and which way is down.
  //
  // Without this, being in the fertile band is LUCK. The band is worth being in,
  // but nothing in the world could tell it was in one, so no lineage could ever
  // steer toward it or hold station on it; drifting into good ground and
  // drifting out again are the same event to a creature that cannot feel the
  // difference. A reward nobody can perceive selects for nothing.
  //
  // TWO READINGS, BOTH STRICTLY LOCAL — the cell samples the fields under
  // ITSELF and nothing else, which is the whole "think global, act local"
  // constraint. Nothing is queried at a distance and nothing is told where the
  // good ground is; the world is merely made legible where the cell is standing.
  //
  //   WET is a scalar, so every sensor on a body reads the same offset: the
  //   creature knows it is in the channel, but not from which side it entered.
  //   That is the correct amount of information — the mud fouls the senses
  //   (mudFog) precisely so that being in it is disorienting.
  //
  //   LEAN is the downhill direction projected on the CELL'S OWN heading, so
  //   two sensors pointing different ways read different values and the
  //   difference between them IS the gradient direction. This is the same
  //   population code the compass already uses, and it means uphill/downhill is
  //   decodable by a brain without any cell being given a vector.
  //
  // Both fade into noise as acuity falls, and acuity is already charged for by
  // senseCost — so a creature that can find the good ground is paying to.
  if (P.senseTerrain > 0.0) {
    let acuT = senseAcuity(m.x);
    let wet = mudAt(p) * 2.0 - 1.0;
    var lean = 0.0;
    if (alen > 1e-5) {
      lean = clamp(dot(-heightGrad(p), ax / alen) * 3.0, -1.0, 1.0);
    }
    let nzT = fbm(p * 2.7 + vec2<f32>(f32(i) * 0.023, 0.0), P.seed + 521u) * 2.0 - 1.0;
    e = e + P.senseTerrain * mix(P.senseNoise * nzT, 0.55 * wet + lean, acuT);
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
  // ---- SAP: energy moves along bonds, and this is why guilds are possible ---
  //
  // THE BLOCKER THIS REMOVES. Until now every cell fed itself and nothing else:
  // energy was gain minus costs, per cell, with the only transfer being contest
  // BETWEEN bodies. Inside a body, nothing flowed. So a cell that specialised —
  // committed its capacity to force, or to sensing, and therefore fed badly or
  // not at all (absorbTradeoff) — simply starved, however useful it was to the
  // body around it.
  //
  // Division of labour was therefore impossible BY CONSTRUCTION, not by tuning.
  // Every cell had to be a generalist because every cell had to balance its own
  // books, and the population's answer was the correct one: monoculture on
  // whichever single self-sufficient strategy paid best. That is why
  // absorbTradeoff 0.9 produced perfect four-way differentiation in a world of
  // eight animals at generation zero — the specialists were viable right up
  // until they had to eat.
  //
  // WHAT THIS IS, AND IS NOT. It is transport, not creation: energy runs DOWN
  // the gradient between two bonded cells, so cell i gains exactly what cell j
  // loses and total energy is untouched. Both endpoints evaluate the same
  // expression from the same pre-step energies, so the pair agrees, exactly as
  // contest does. A fraction is lost to heat, because moving anything costs
  // something and a free circulatory system is a free lunch.
  //
  // It names no roles. Nothing is a "feeder" or a "mouth" — energy simply
  // diffuses along whatever bonds exist, so a body that grows uptake tissue at
  // its edge and muscle at its core is one arrangement evolution may find, and
  // a uniform body is another. The kernel does not know the difference.
  //
  // MEASURED, AND IT DOES NOT DO WHAT IT WAS BUILT FOR. Default 0. Same world,
  // 110 ticks, absorbTradeoff 0.7 throughout the lower rows:
  //
  //   config                  alive   sense+move   one-tissue
  //   no sap                    472        40.5%          56%
  //   sap 0.9                   611        24.5%          73%
  //   no sap  + absorb 0.7        8        62.5%          25%
  //   sap 0.05 + absorb 0.7       8        12.5%          50%
  //   sap 0.15 + absorb 0.7     564         0.0%          82%
  //   sap 0.35 + absorb 0.7      26         0.0%          81%
  //   sap 0.9  + absorb 0.7     543         0.7%          68%
  //
  // The mechanism works exactly as claimed: at absorbTradeoff 0.7 the
  // population goes from 8 alive to 543, a 68x rescue, because specialists stop
  // starving. The EVOLUTIONARY OUTCOME is the opposite of the intent. Pooling
  // means the body only needs net income, so nothing forces it to keep uptake
  // tissue either, and it converges on the single tissue with the best net
  // return — muscle, at 93%. There is no middle rate: every value tried gives
  // either a dead world or a monoculture.
  //
  // WHAT THIS ACTUALLY SHOWS, and it is sharper than the "contraction is paid
  // twice" guess it was built on: SENSING HAS NO PAYOFF. A sensor costs
  // senseCost and, under a tradeoff, costs uptake as well, and returns
  // information the body cannot convert into energy — motes are grazed by
  // proximity rather than by being found, and contest fires on contact rather
  // than on pursuit. So a sensor is pure cost and evolution deletes it, with or
  // without a circulatory system. No amount of energy plumbing fixes an
  // incentive that is not there.
  //
  // That is also the goal restated: if perceiving another organism cannot help
  // you eat or avoid being eaten, then organisms are not a pressure anything
  // can adapt TO, whatever the contest coefficients say.
  //
  // FREE, in the sense PHYSICS-2.md cares about: this rides the bond loop that
  // already runs for springs and dampers. No new neighbourhood walk, no new
  // buffer, no scattered read that was not already happening.
  var sap = 0.0;

  for (var k = 0u; k < P.bondK; k = k + 1u) {
    let bd = bondD[base + k];
    let j = bitcast<i32>(bd.x);
    if (j < 0) { continue; }
    if (P.sapRate > 0.0) {
      // Down the gradient, and bounded by what the richer cell can actually
      // give up in one step, so a large dt cannot overshoot into oscillation.
      let dE = energy[u32(j)] - energy[i];
      sap = sap + P.sapRate * dE;
    }
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

  // ---- THE GROUND UNDER THIS CELL, SAMPLED ONCE ---------------------------
  //
  // Height and the channel ridge were being reached independently by gravity,
  // by the flow, by traction, by the metabolic terrain cost and by fertility —
  // five or six times a cell a step, at four fbm each for height alone. That is
  // roughly fifty noise evaluations per cell per step spent recomputing two
  // numbers that cannot have changed in between, and it took the headless rate
  // from 179 steps a second to 51.
  //
  // Everything below reads these. It is the same physics; it is arithmetic
  // that is no longer done six times.
  let hHere = heightAt(p);
  let rHere = wetRidge(p);
  let wHere = wetnessFrom(hHere, rHere);
  let mudHere = mudFrom(wHere);

  // GRAVITY, in the plane. -grad(height) is a tilted plane: things roll
  // downhill, matter gathers in basins, ridges separate the world into
  // places. Every cell has mass 1 for now, so this is an acceleration.
  if (P.gravity != 0.0) { force = force - heightGradFrom(p, hHere) * P.gravity; }

  // The medium drags the cell toward the local flow velocity. This is the
  // "stickiness to the aether" every particle has, inert or alive.
  force = force + (flowAtM(p, mudHere) - v) * P.drag;

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
    let grit = gritAtM(p, mudHere);
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
    gain = absorb * grazeAt(np, pow(bodySizeOf(cmeta[i].w), -P.grazeBodyShare)) / P.dt;
  } else {
    gain = absorb * P.harvest * resourceAtS(np, shoreFrom(wHere)) * share;
  }
  let work = P.muscleCost * abs(mine);
  // ACUITY COSTS. A sense organ that reads the world perfectly for free is a
  // free lunch, and evolution would take it every time — the same mistake as
  // feeding being independent of what a cell is. A sharp compass burns fuel in
  // proportion to how sharp it is, so accuracy has to be worth its keep and a
  // cheap noisy sense stays a live option. primitives.md: an axis without a
  // cost has no teeth.
  //
  // AND IT IS CHARGED WHERE IT IS USED. This was levied on EVERY cell, while
  // sense() computes a reading only for cells whose type is sensor — so the
  // world charged the whole population for an organ almost none of them had.
  // Measured before the fix: mean acuity 0.682 across all live cells against a
  // senseCost of 0.25, i.e. 0.17 energy per second of pure tax, on a brainTax
  // of 0.4. A 43% surcharge on existing, for nothing.
  //
  // It also explains the shape of the population. Sensor cells sat at acuity
  // 0.000 — every one of them — while non-sensors averaged 0.682: the bits are
  // near-neutral where they are not charged against a benefit, and the cells
  // that could have used them had been driven to zero. A sensor was an organ
  // that reads pure noise and a non-sensor was paying for one.
  //
  // Gating a COST on type is uncomfortable next to the First Law, and it is the
  // honest reading here: the kernel ALREADY decides who senses by exactly this
  // test, so making the bill follow the benefit is consistency rather than a
  // new branch. The alternative — charging by continuous sense capacity — needs
  // that capacity in cmeta, where there is no room for it.
  let senseWork = P.senseCost * senseAcuity(cmeta[i].x)
                * select(0.0, 1.0, cellType(cmeta[i].x) == 1);
  // ARMOUR IS EXPENSIVE TO HOLD. Without a cost, toughness is a free defence
  // and evolution takes it to the ceiling in every lineage — the same failure
  // as feeding being independent of what a cell is, which produced a 94%
  // muscle monoculture. primitives.md: an axis with no cost has no teeth.
  let armourWork = P.toughCost * toughnessOf(cmeta[i].w);
  // THE HIGH GROUND IS EXPENSIVE TO OCCUPY. In two dimensions "high" means
  // dense and hard going, so it costs to be there — which is what makes the
  // heights a frontier only some lineages can afford rather than just another
  // place. Only the upper half of the range charges anything.
  let terrainWork = P.highSap * max(0.0, hHere);

  // ---------------------------------------------------------- TIDAL INCOME
  //
  // A SECOND STAR, declared as one. Planetary dynamics deliver kinetic energy
  // the same way the sun delivers light: a fixed, external, global inflow that
  // nothing here can increase. Under the friction law that is legitimate —
  // global-uniform inflow is not minting, local-targeted grants are — but it is
  // a second drink, not a second straw into the first, so it is written down
  // plainly rather than smuggled in as a coefficient.
  //
  // WHAT IS ACTUALLY HARVESTED is the power already being dissipated in the
  // drag coupling, |flow - v|^2 * drag, which the world was throwing away as
  // heat every step. A cell that grips takes a share of it; the medium loses
  // exactly what it would have lost anyway. Nothing is created.
  //
  // AND THE PASSIVE CASE NETS ZERO, which is the affordance test in
  // primitives.md and the reason this is not the global-drift bug returning.
  // A cell that lets go accelerates until it matches the flow; relative
  // velocity goes to zero and so does the income. You cannot be paid for
  // drifting. You are paid for HOLDING STATION IN A CURRENT — which costs grip,
  // which costs uptake (absorbTradeoff), and which is a way of making a living
  // that the still water cannot offer at any price.
  //
  // That is the point of building it: a mud river stops being purely a hazard
  // and becomes somewhere worth being for a lineage shaped to exploit it, while
  // remaining lethal for one that is not. Two ways to eat is what a guild is.
  var tidal = 0.0;
  if (P.tidalYield > 0.0) {
    let slip = flowAtM(p, mudHere) - v;
    // NO TRAIT FACTOR. This was multiplied by grippiness — energy paid in
    // direct proportion to a named capability, which is the reward-shaping the
    // First Law exists to forbid, and it worked exactly as such things do:
    // measured a few hours after it shipped, 59.7% of all cells were anchors,
    // 54.8% of bodies were a single tissue, and only 7.3% had both a sensor and
    // a muscle — i.e. could close a sensorimotor loop even in principle. A world
    // that pays for grip gets grip and nothing else.
    //
    // The slip term ALREADY encodes the behaviour. A cell that lets go
    // accelerates until it matches the flow and its slip goes to zero; slip
    // stays high only while something is holding it against the medium. So
    // paying for the power actually being dissipated pays for HOLDING STATION,
    // however that is achieved — by grip, by bonds to something that grips, by
    // being wedged in a crevice — and names no organ at all. It also makes
    // anchoring a BODY-level strategy rather than a per-cell subsidy, which is
    // the difference between division of labour and a monoculture.
    tidal = P.tidalYield * P.drag * dot(slip, slip);
  }
  let taken = contest(i, np, abs(mine));
  // Written to scratch, not to energy[]: contest() READS energy[j] for other
  // cells, and if physics also wrote energy[j] in the same dispatch the result
  // would depend on thread order — non-deterministic, and this project's runs
  // are supposed to be a pure function of their seed. energyCommit publishes it.
  // PRESERVE THE RADIUS. This wrote 0.0 into z, wiping every cell's radius on
  // every step — the other independent reason contact was dead. Between this and
  // contactK being a denormal (see lib/uniform.js), cells have never collided.
  vel[i] = vec4<f32>(v.x, v.y, vel[i].z,
    clamp(energy[i] + (gain + tidal - P.brainTax - work - senseWork - armourWork - terrainWork
                       + taken + sap - abs(sap) * P.sapLoss) * P.dt, P.eFloor, P.eCap));
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
      meta[i * 4 + 3] = packSize(cells.bodySize ? cells.bodySize[i] : 0, 0.5, 0.0, 0.5);
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
      bucketM: 32, contestRate: 0.6, toughCost: 0.05,
      // Width of the digestive match. Swept, not chosen.
      dietWidth: 0.35,
      // Geography. Scales chosen so a world of bound ~132 holds a handful of
      // basins and ridges rather than one hill or a thousand.
      heightScale: 0.018, heightSeed: 5150, gravity: 0.55, highSap: 0.35,
      mudScale: 0.014, mudSeed: 8801, mudSlip: 0.85, mudFlow: 1.15, mudFog: 0.8, flowDry: 0.07, shoreWidth: 0.30,
      lowLush: 0.75,
      // How far the biotic channel reaches, and how fast food goes downstream.
      // contestR against contactR 1.0: proximity rather than collision, capped
      // by what the neighbour walk can see. moteDrift below 1 so food lags the
      // water and a creature can outrun its own dinner.
      // moteDrift BACK TO 0, and the reason is worth the space.
      //
      // The comment on the mote buffer warned: "their positions do not move,
      // which is what makes a patch something you can exhaust and have to leave
      // — the pressure to locomote has to come from somewhere, and a field that
      // refills under your feet is not it." Drift was added anyway, for visual
      // coherence (a river with a stationary riverbed of food is not a river),
      // on the argument that the warning is about DEPLETION and survives drift
      // intact. That argument is wrong: food you did NOT exhaust arriving on the
      // current is a patch refilling under your feet by another route.
      //
      // Measured, movers against sitters, energy change over the same window:
      //
      //   moteDrift 0.55   movers -0.1468   sitters -0.1031   diff -0.0437
      //   moteDrift 0      movers +0.1066   sitters -0.0572   diff +0.1638
      //
      // Neither difference clears two standard errors at one replicate each, so
      // this is directional rather than demonstrated — but the SIGN FLIPS, and
      // it flips the way the warning said it would. With static food movers gain
      // and sitters lose; with drifting food both lose and movers lose more.
      //
      // That matters because it is upstream of everything else measured this
      // session. If moving does not pay, a sense organ that steers movement is
      // worse than useless, which is exactly what the sensor economics showed.
      // A small drift may well be recoverable — enough to read as a current
      // without outrunning a body — but that is its own measurement and 0 is
      // the value with evidence behind it.
      // SHELTER. Built against the measured tax on multicellularity, and
      // MEASURED TO DO NOTHING — so it ships off.
      //
      //   sizeTax = energy/cell of bodies >=15 cells minus bodies <=8
      //   first horizon (22k steps)   k 0: -0.5806   k 0.04: -0.3175
      //   deep time    (225k steps)   k 0: -0.5866   k 0.04: -0.5412
      //   change: +0.2631 +-0.6671 first, +0.0454 +-0.0715 deep. Neither clears.
      //
      // The failure is informative and worth more than the mechanism was. If
      // shielding a body from CONTEST does not move the tax on being a body,
      // then the tax is not predation — it is on the foraging side. A body of N
      // cells is by construction a dense draw on one patch, and crowding
      // suppression cuts regrowth in proportion to how hard a patch is worked.
      // The mechanism added to make movers out-earn sitters is the leading
      // suspect for taxing multicellularity.
      shelterK: 0.0,
      // COUNT COMPETITORS, NOT MOUTHS. 0 is the world as measured, where a body
      // suppresses the ground under itself once per cell. 1 makes a patch shared
      // among the BODIES on it, each dividing its share internally. Conserving
      // at any value — see the note in moteOffer.
      grazeBodyShare: 0.0,
      contestR: 1.5, moteDrift: 0.0,
      // Tidal income. Sized so a fully-gripping cell holding station in a fast
      // mud channel earns on the order of what rich ground yields, and a cell
      // in still water earns nothing at all.
      tidalYield: 0.06,
      // SAP. Rate at which energy runs down the gradient between two bonded
      // cells, and the fraction lost to heat in doing so. Without this a
      // specialised cell starves however useful it is, and division of labour
      // is impossible by construction rather than merely unrewarded.
      // DEFAULT OFF, because it was built on a hypothesis that measurement
      // refuted. Kept, because what it DOES do is real and reusable — see the
      // note at the bond loop.
      sapRate: 0.0, sapLoss: 0.12,
      // Meander, crags, and riverbanks. warpAmt is in noise units, so 0.55 is
      // rather more than half a feature — enough to fold the field back over
      // itself, which is where the winding comes from.
      // How much of the current is the landscape's own circulation rather than
      // free turbulence. Not 1.0: eddies are real and a world where the medium
      // is a pure function of the ground has no weather in it.
      flowTerrain: 0.62,
      // Feeling the ground. Same weight as the neighbour sense: real, but not
      // so loud that it drowns out everything else a sensor reads.
      senseTerrain: 0.45,
      warpAmt: 0.55, ridgeAmt: 0.42, mudBank: 0.52, contactR: 1.0, sizeScale: 1.0, sizeNorm: 1.0,
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

    // TERRAIN SCALES WITH THE WORLD, because a geography is a number of PLACES,
    // not a number of world units. The defaults above were chosen against
    // bound 132; at a quarter of the cell budget the world is half as wide, and
    // fixed frequencies would leave it with one hill and one bay — no ridges to
    // separate anything, so the whole point of building it is gone. Expressed
    // as "how many features across the world", it holds at any size.
    //
    // An explicit heightScale/mudScale in params still wins: this fills in a
    // default, it does not override a decision.
    {
      const B = this.params.bound;
      if (params.heightScale == null) this.params.heightScale = 2.40 / B;
      if (params.mudScale == null)    this.params.mudScale    = 1.85 / B;
    }
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
  /**
   * Read the packed per-cell material vector back.
   *
   * The traits that matter for "who is selecting whom" — toughness, surface
   * tag, digestive enzyme — exist ONLY in cmeta.w on the GPU. They are written
   * at birth and never read back, so no experiment could see them move, which
   * is why every claim about escalation so far has been about contractility
   * (which happens to have a CPU mirror) rather than about armour, which is the
   * trait that only makes sense as a response to other organisms.
   *
   * Returns the raw i32 vec4 per cell; unpack with the same shifts packMeta and
   * packSize use.
   */
  async readMeta() {
    const n = this.n;
    const staging = this.device.createBuffer({
      size: n * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.bMeta, 0, staging, 0, n * 16);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const out = new Int32Array(staging.getMappedRange().slice(0));
    staging.unmap(); staging.destroy();
    return out;
  }

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
