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
@group(0) @binding(3) var<storage, read>       cmeta : array<vec4<i32>>;  // x=type, y=slot, z=body, w=body size
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
@group(0) @binding(9)  var<storage, read>       motePos   : array<vec2<f32>>;
// (stock, per-cell offer this step, demanders, unused)
@group(0) @binding(10) var<storage, read_write> moteState : array<vec4<f32>>;
@group(0) @binding(11) var<storage, read_write> moteHash  : array<atomic<u32>>;

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
  if (m.x == 2 && m.y >= 0) { return P.contract * act[u32(m.y)]; }
  return 0.0;
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
  if (P.predRate <= 0.0) { return 0.0; }
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
        let raw = P.predRate * (effort - abs(contractionOf(j))) * P.dt;
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
  let b = moteBucketOf(motePos[i]) * (1u + P.bucketM);
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
  let p = motePos[i];
  let st = moteState[i];
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
  var offer = 0.0;
  if (demanders > 0.0) {
    // What one cell wants, capped by an equal split of what there actually is.
    offer = min(P.grazeRate * P.dt, max(0.0, st.x) / demanders);
  }
  moteState[i] = vec4<f32>(st.x, offer, demanders, 0.0);
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
  let p = motePos[i];
  let st = moteState[i];
  var stock = max(0.0, st.x - st.y * st.z);
  let fert = clamp(resourceAt(p), 0.0, 1.0);
  stock = stock + P.moteRegrow * fert * (1.0 - stock / P.moteCap) * P.dt;
  moteState[i] = vec4<f32>(clamp(stock, 0.0, P.moteCap), 0.0, 0.0, 0.0);
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
        let m = atomicLoad(&moteHash[b + 1u + k]);
        if (length(minImage(motePos[m] - p)) > P.moteR) { continue; }
        got = got + moteState[m].y;
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
  if (m.x != 1) { ext[u32(slot)] = 0.0; return; }

  let p = pos[i];
  // Two things a cell can actually feel locally: how fast the medium is moving
  // past it, and a scalar gradient it sits in. Both are analytic at p.
  let rel = flowAt(p) - vel[i].xy;
  ext[u32(slot)] = tanh((length(rel) + fbm(p * P.flowScale * 0.5, P.seed + 77u) - 0.5) * P.senseGain);
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
    if (me2.x == 3) { grab = P.gripAnchor; }
    // ACTIVELY PHASED, which is the whole point. A cell raises and drops its grip
    // with its activation, so a brain can grip on the power stroke and release on
    // recovery. Constant grip nets zero however strong it is — the scallop
    // theorem — and primitives.md is explicit that the world affords while the
    // brain earns.
    if (me2.y >= 0) {
      let a = act[u32(me2.y)];
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
      let ab = i * P.bondK;
      var n1 = -1;
      var n2 = -1;
      for (var k = 0u; k < P.bondK; k = k + 1u) {
        let nj = bitcast<i32>(bondD[ab + k].x);
        if (nj < 0) { continue; }
        if (n1 < 0) { n1 = nj; } else if (n2 < 0) { n2 = nj; }
      }
      if (n1 >= 0 && n2 >= 0) {
        axis = minImage(pos[u32(n2)] - pos[u32(n1)]);
      } else if (n1 >= 0) {
        axis = minImage(pos[u32(n1)] - p);
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
      let kA = P.fricK * (P.slipBase + grit);
      let kP = P.fricK * (P.slipBase + (1.0 + P.gripAniso * grab) * grit);
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
  let mySize = f32(max(cmeta[i].w, 1));
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
  var gain = 0.0;
  if (P.nMotes > 0u) {
    gain = grazeAt(np) / P.dt;
  } else {
    gain = P.harvest * resourceAt(np) * share;
  }
  let work = P.muscleCost * abs(mine);
  let taken = contest(i, np, abs(mine));
  // Written to scratch, not to energy[]: contest() READS energy[j] for other
  // cells, and if physics also wrote energy[j] in the same dispatch the result
  // would depend on thread order — non-deterministic, and this project's runs
  // are supposed to be a pure function of their seed. energyCommit publishes it.
  // PRESERVE THE RADIUS. This wrote 0.0 into z, wiping every cell's radius on
  // every step — the other independent reason contact was dead. Between this and
  // contactK being a denormal (see lib/uniform.js), cells have never collided.
  vel[i] = vec4<f32>(v.x, v.y, vel[i].z,
    clamp(energy[i] + (gain - P.brainTax - work + taken) * P.dt, P.eFloor, P.eCap));
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
      meta[i * 4] = cells.ctype[i];
      meta[i * 4 + 1] = cells.cslot[i];
      meta[i * 4 + 2] = bodyOf ? bodyOf[i] : -1;
      meta[i * 4 + 3] = cells.bodySize ? cells.bodySize[i] : 0;
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
      flowScale: 0.9, flowStr: 1.0, drag: 1.6, springK: 90.0,
      contract: 0.45, seed: 3, senseGain: 2.0, damp: 0.986, bound: 64.0,
      // Calibrated against the density the world actually runs at. A 3x3 bucket
      // neighbourhood holds ~34 cells at the starting population, so crowdK
      // 0.012 discounts a shared patch to ~0.79 rather than erasing it: at
      // 0.055 the discount halved every harvest, nothing anywhere could pay its
      // tax, and the entire population starved in one tick. With these numbers
      // barren ground (res 0.04) is fatal, average ground (0.28) barely pays,
      // and rich ground (0.64) is worth crossing the world for — until enough
      // others arrive to spend it down.
      harvest: 2.6, brainTax: 0.45, muscleCost: 0.55,
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
      gripBase: 0.55, gripMod: 0.9, fricK: 6.0, gripAnchor: 1.0,
      // Substrate. gritScale sets how big a patch of purchase is; slipBase is the
      // drag left on frictionless ground (open water); gripAniso is how much
      // harder sideways slip is than sliding along your own body, which is the
      // ratio that converts undulation into travel.
      gritScale: 0.12, gritSeed: 4242, slipBase: 0.15, gripAniso: 6.0,
      bucketM: 32, predRate: 0.0, contactR: 1.0, sizeScale: 1.0, sizeNorm: 1.0,
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
      moteHashSize: 16384, pad0: 0,
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
    const mpos = new Float32Array(Math.max(1, nM) * 2);
    const mst = new Float32Array(Math.max(1, nM) * 4);
    {
      let sd = (this.params.moteSeed ?? 20260803) >>> 0;
      const rnd = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
      const B = this.params.bound;
      for (let i = 0; i < nM; i++) {
        mpos[i * 2] = (rnd() * 2 - 1) * B;
        mpos[i * 2 + 1] = (rnd() * 2 - 1) * B;
        // Start full, so the opening moments are not an artificial famine.
        mst[i * 4] = this.params.moteCap;
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
    this.bMotePos = mkS(mpos);
    this.bMoteState = mkS(mst);
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
        { binding: 9, visibility: C, buffer: ro },   // mote positions (static)
        { binding: 10, visibility: C, buffer: rw },  // mote stock + offer
        { binding: 11, visibility: C, buffer: rw },  // mote hash (built once)
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
        { binding: 9, resource: { buffer: this.bMotePos } },
        { binding: 10, resource: { buffer: this.bMoteState } },
        { binding: 11, resource: { buffer: this.bMoteHash } },
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
    const sp = this.device.createBuffer({
      size: nM * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const ss = this.device.createBuffer({
      size: nM * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.bMotePos, 0, sp, 0, nM * 8);
    enc.copyBufferToBuffer(this.bMoteState, 0, ss, 0, nM * 16);
    this.device.queue.submit([enc.finish()]);
    await sp.mapAsync(GPUMapMode.READ); await ss.mapAsync(GPUMapMode.READ);
    const pos = new Float32Array(sp.getMappedRange().slice(0));
    const raw = new Float32Array(ss.getMappedRange().slice(0));
    sp.unmap(); ss.unmap(); sp.destroy(); ss.destroy();
    const stock = new Float32Array(nM);
    for (let i = 0; i < nM; i++) stock[i] = raw[i * 4];
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
    if (this.params.morphRate !== 0 || this.params.driftX !== 0 || this.params.driftY !== 0) {
      this.writeParams();
    }
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
    for (const b of [this.bMotePos, this.bMoteState, this.bMoteHash,
                     this.bPos, this.bVel, this.bMeta, this.bBondD,
      this.bEnergy, this.bHash, this.bParams, this.bRead]) b.destroy();
  }
}
