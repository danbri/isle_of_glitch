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

const WORKGROUP = 256;

/** Cell subtypes. A cell is a cell; these only select which kernels act on it. */
export const CELL_NEURON = 0;
export const CELL_SENSOR = 1;
export const CELL_MUSCLE = 2;

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
`;

const SHADER = /* wgsl */`
${WGSL_FIELD}

struct W {
  nCells   : u32,
  bondK    : u32,
  dt       : f32,
  flowScale: f32,

  flowStr  : f32,
  drag     : f32,
  springK  : f32,
  contract : f32,

  seed     : u32,
  senseGain: f32,
  damp     : f32,
  bound    : f32,

  bondDamp : f32,
  pad0     : f32,
  pad1     : f32,
  pad2     : f32,
};

// Positions and velocities are packed vec2, and (type, slot) into one vec2<i32>.
// Not cosmetic: WebGPU guarantees only 8 storage buffers per stage, and the
// unpacked form needed 10 — this shader would simply refuse to run on a
// conformant device. Packing also makes each cell's position one coalesced
// 8-byte load instead of two strided 4-byte ones.
@group(0) @binding(0) var<uniform>             P     : W;
@group(0) @binding(1) var<storage, read_write> pos   : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> vel   : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read>       cmeta : array<vec2<i32>>;  // x=type, y=brain slot
@group(0) @binding(4) var<storage, read>       bond  : array<i32>;
@group(0) @binding(5) var<storage, read>       brest : array<f32>;
@group(0) @binding(6) var<storage, read_write> ext   : array<f32>;
@group(0) @binding(7) var<storage, read>       act   : array<f32>;

fn flowAt(p: vec2<f32>) -> vec2<f32> {
  return flowField(p, P.flowScale, P.flowStr, P.seed);
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

/* ------------------------------------------------------------------ kernels */

// 1. Sensor cells write what they feel into their brain's input slot. Nothing
//    crosses the bus: ext is a GPU buffer the arena kernel reads next.
@compute @workgroup_size(${WORKGROUP})
fn sense(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nCells) { return; }
  let m = cmeta[i];
  let slot = m.y;
  if (slot < 0) { return; }
  if (m.x != 1) { ext[u32(slot)] = 0.0; return; }

  let p = pos[i];
  // Two things a cell can actually feel locally: how fast the medium is moving
  // past it, and a scalar gradient it sits in. Both are analytic at p.
  let rel = flowAt(p) - vel[i];
  ext[u32(slot)] = tanh((length(rel) + fbm(p * P.flowScale * 0.5, P.seed + 77u) - 0.5) * P.senseGain);
}

// 2. Physics: bond springs (muscles contract theirs), flow drag, integrate.
@compute @workgroup_size(${WORKGROUP})
fn physics(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nCells) { return; }

  let p = pos[i];
  var v = vel[i];
  var force = vec2<f32>(0.0, 0.0);

  // A muscle cell shortens its bonds in proportion to its activation. That is
  // what a muscle IS; locomotion falls out of the body deforming against the
  // medium rather than being assigned as a velocity.
  let mine = contractionOf(i);

  let base = i * P.bondK;
  for (var k = 0u; k < P.bondK; k = k + 1u) {
    let j = bond[base + k];
    if (j < 0) { continue; }
    let d = pos[u32(j)] - p;
    let dist = max(length(d), 1e-3);
    // Symmetric: both endpoints derive the same rest length, so the pair's
    // forces cancel. See contractionOf.
    let rest = brest[base + k] * (1.0 - 0.5 * (mine + contractionOf(u32(j))));
    let dir = d / dist;
    // Hooke, PROPORTIONAL at any stretch. An earlier version clamped the
    // stretch for stability and that was a bad trade: a bond pulled past the
    // clamp stops pulling harder, so drag wins and the body tears apart and
    // never recovers. Worst-case bond stretch went from 0.45 to 60 world units.
    force = force + dir * (dist - rest) * P.springK;

    // Viscoelastic damper along the bond. This is not a numerical fudge — real
    // tissue dissipates, and an undamped spring whose REST LENGTH is driven by
    // a muscle is a parametric oscillator: when the CTRNN's contraction rhythm
    // lands near the bond's natural period it pumps energy in every cycle and
    // the body flies apart. That resonance, not raw stiffness, is what put
    // NaNs into a fraction of bodies (dt*sqrt(k) here is ~0.25, far inside the
    // explicit-Euler limit of 2). Damping the RELATIVE velocity along the bond
    // removes the energy the drive adds, and leaves the static spring law and
    // the muscle's authority over rest length untouched.
    force = force + dir * dot(vel[u32(j)] - v, dir) * P.bondDamp;
  }

  // The medium drags the cell toward the local flow velocity.
  force = force + (flowAt(p) - v) * P.drag;

  // Terminal velocity — the one guard that keeps explicit Euler bounded when
  // the stiffness slider outruns dt < 2/sqrt(k). Without it a large force gives
  // a large velocity, which overshoots the next rest length and returns a still
  // larger force; that runaway put NaNs into 0.2% of cells, and a NaN position
  // never recovers and poisons every bond that touches it. Capping speed bounds
  // the overshoot to under one rest length per step while leaving the force law
  // untouched in the range bodies actually operate in.
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

  pos[i] = np; vel[i] = v;
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
    const pos = new Float32Array(n * 2), vel = new Float32Array(n * 2);
    const meta = new Int32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 2] = cells.px[i]; pos[i * 2 + 1] = cells.py[i];
      vel[i * 2] = cells.vx[i]; vel[i * 2 + 1] = cells.vy[i];
      meta[i * 2] = cells.ctype[i]; meta[i * 2 + 1] = cells.cslot[i];
    }
    this.bPos = mk(pos); this.bVel = mk(vel); this.bMeta = mk(meta);
    this.bBond = mk(cells.bond); this.bRest = mk(cells.brest);

    this.params = {
      flowScale: 0.9, flowStr: 1.0, drag: 1.6, springK: 90.0,
      contract: 0.45, seed: 3, senseGain: 2.0, damp: 0.986, bound: 64.0,
      dt: brains.dt, ...params,
    };
    this.bParams = device.createBuffer({
      size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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
        { binding: 4, visibility: C, buffer: ro },   // bond
        { binding: 5, visibility: C, buffer: ro },   // brest
        { binding: 6, visibility: C, buffer: rw },   // ext, written by sense()
        { binding: 7, visibility: C, buffer: ro },   // act, read by physics()
      ],
    });
    const module = device.createShaderModule({ code: SHADER, label: 'world' });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipeSense = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'sense' } });
    this.pipePhysics = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: 'physics' } });

    this.bindGroup = device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.bParams } },
        { binding: 1, resource: { buffer: this.bPos } },
        { binding: 2, resource: { buffer: this.bVel } },
        { binding: 3, resource: { buffer: this.bMeta } },
        { binding: 4, resource: { buffer: this.bBond } },
        { binding: 5, resource: { buffer: this.bRest } },
        { binding: 6, resource: { buffer: brains.bExt } },
        { binding: 7, resource: { buffer: brains.bAct } },
      ],
    });
    this.groups = Math.ceil(this.n / WORKGROUP);
    this.bRead = device.createBuffer({
      size: this.n * 4 * 2, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  writeParams(patch = {}) {
    Object.assign(this.params, patch);
    const p = this.params;
    const buf = new ArrayBuffer(64), dv = new DataView(buf);
    dv.setUint32(0, this.n, true); dv.setUint32(4, this.bondK, true);
    dv.setFloat32(8, p.dt, true); dv.setFloat32(12, p.flowScale, true);
    dv.setFloat32(16, p.flowStr, true); dv.setFloat32(20, p.drag, true);
    dv.setFloat32(24, p.springK, true); dv.setFloat32(28, p.contract, true);
    dv.setUint32(32, p.seed, true); dv.setFloat32(36, p.senseGain, true);
    dv.setFloat32(40, p.damp, true); dv.setFloat32(44, p.bound, true);
    // Damping tracks stiffness so the bond stays near a fixed damping ratio as
    // the stiffness slider moves; a fixed absolute value would be overdamped at
    // low stiffness and useless at high. c = 2*zeta*sqrt(k*m), m = 1, zeta≈0.35.
    dv.setFloat32(48, p.bondDamp ?? 0.7 * Math.sqrt(p.springK), true);
    this.device.queue.writeBuffer(this.bParams, 0, buf);
  }

  /**
   * `n` full world steps: sense -> activate -> integrate -> physics, all in one
   * compute pass and one submit. Nothing is read back.
   */
  step(n = 1) {
    const b = this.brains;
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    for (let s = 0; s < n; s++) {
      pass.setBindGroup(0, this.bindGroup);
      pass.setPipeline(this.pipeSense); pass.dispatchWorkgroups(this.groups);

      pass.setBindGroup(0, b.bindGroup);
      pass.setPipeline(b.pipeActivate); pass.dispatchWorkgroups(b.groups);
      pass.setPipeline(b.pipeIntegrate); pass.dispatchWorkgroups(b.groups);

      pass.setBindGroup(0, this.bindGroup);
      pass.setPipeline(this.pipePhysics); pass.dispatchWorkgroups(this.groups);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
    b.steps += n;
    this.steps = (this.steps ?? 0) + n;
  }

  /** Pull cell positions back — for logging, the inspector, or a snapshot. */
  async readPositions() {
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.bPos, 0, this.bRead, 0, this.n * 8);
    this.device.queue.submit([enc.finish()]);
    await this.bRead.mapAsync(GPUMapMode.READ);
    const packed = new Float32Array(this.bRead.getMappedRange().slice(0));
    this.bRead.unmap();
    const x = new Float32Array(this.n), y = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) { x[i] = packed[i * 2]; y[i] = packed[i * 2 + 1]; }
    return { x, y, packed };
  }

  destroy() {
    for (const b of [this.bPos, this.bVel, this.bMeta, this.bBond, this.bRest,
      this.bParams, this.bRead]) b.destroy();
  }
}
