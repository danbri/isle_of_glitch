/**
 * Development on the GPU: the GRN step, as a compute kernel.
 *
 * WHY. develop() is 5.63 ms of synchronous JavaScript per egg, and at roughly
 * one birth a step that is 5.6 seconds of CPU per thousand steps — the largest
 * non-GPU cost in the system by a wide margin. It is also, structurally, the
 * same shape as everything already on the GPU: per-cell state, a fixed number
 * of genes, local neighbour coupling, no global reduction. There is no reason
 * for it to be the one part that runs on the main thread.
 *
 * SCOPE OF THIS FILE, DELIBERATELY NARROW. It ports the REACTION-DIFFUSION STEP
 * and nothing else — given a fixed set of cells with positions and gene
 * concentrations, advance the concentrations by dt. It does NOT do division,
 * allocation, apoptosis or the relaxation phase.
 *
 * That is not timidity, it is the only order in which this can be verified. The
 * step is a pure function of the previous state, so it can be checked against
 * devo2.js to the last bit for the same inputs. Division cannot: it allocates,
 * and the moment allocation is involved the CPU and GPU are free to disagree
 * about WHICH cell got which slot, at which point "the results differ" tells you
 * nothing about whether the chemistry is right.
 *
 * Codex's sequencing note, taken: a batched phenotype sidecar rather than a
 * kernel that mutates the live world, and when division does arrive it should
 * use a deterministic prefix scan rather than an atomic bump allocator. Atomics
 * would reintroduce "same seed, different body" through allocation order, which
 * is the reproducibility failure this project already has and has not fixed.
 *
 * BATCHED, because one embryo is a few dozen cells and a dispatch of that size
 * is all overhead. The layout is embryo-major: every buffer is indexed
 * [embryo * capacity + cell], so one dispatch covers a whole cohort of eggs and
 * an embryo that finishes early simply has its remaining cells masked off.
 */

import { NGENE, K, GENE_STRIDE, N_MATERNAL, OFF_SRC, OFF_W, OFF_BIAS, OFF_DECAY, OFF_DIFF, G_GROW }
  from './devo2.js';

/**
 * DIVISION, and why it is a separate kernel with a scan in it.
 *
 * The step is embarrassingly parallel: every cell reads its own state and its
 * neighbours' and writes its own. Division is not, because two cells that
 * divide in the same tick must be given DIFFERENT daughter slots, and that is
 * an agreement between threads.
 *
 * The obvious way is an atomic counter: each dividing cell bumps it and takes
 * what it gets. That works and it is wrong for this project, because the slot a
 * daughter receives then depends on the order the hardware happened to schedule
 * the lanes - so the same genome grows a different body on different runs.
 * Non-reproducibility is the failure the green-light test has been stuck on
 * since the beginning, and an atomic here would add a fresh source of it in the
 * one place a genome becomes a phenotype.
 *
 * A PREFIX SCAN gives the same answer every time. Every cell computes whether it
 * will divide; the scan turns that into "how many cells before me are dividing";
 * the daughter slot is count + that. It is fixed by the cell's INDEX rather than
 * by scheduling, so the body is a function of the genome and nothing else.
 * Codex's recommendation, and it is the right one.
 *
 * One workgroup per embryo, so the scan lives in workgroup memory and never
 * needs a global barrier.
 */
export const DIVIDE_WGSL = /* wgsl */`
struct DP {
  nEmbryo : u32, cap : u32, nGene : u32, k : u32,
  nMaternal : u32, dt : f32, nbrK : u32, divRate : f32,
};
@group(0) @binding(0) var<uniform>             P     : DP;
@group(0) @binding(1) var<storage, read_write> conc  : array<f32>;
@group(0) @binding(2) var<storage, read_write> ready : array<f32>;
@group(0) @binding(3) var<storage, read_write> xy    : array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> live  : array<u32>;
@group(0) @binding(5) var<storage, read_write> count : array<u32>;   // per embryo
@group(0) @binding(6) var<storage, read>       noise : array<f32>;

var<workgroup> wants : array<u32, 256>;
var<workgroup> scan  : array<u32, 256>;

@compute @workgroup_size(256)
fn divide(@builtin(workgroup_id) wg : vec3<u32>,
          @builtin(local_invocation_id) lid : vec3<u32>) {
  let e = wg.x;
  let i = lid.x;
  let base = e * P.cap;
  let n = count[e];

  // WHO WANTS TO DIVIDE. Readiness accumulates with the grow product, exactly
  // as devo2 does, and a cell divides when it reaches one.
  var w = 0u;
  if (i < n && live[base + i] == 1u) {
    ready[base + i] = ready[base + i] + P.dt * conc[(base + i) * P.nGene + ${G_GROW}u] * P.divRate;
    if (ready[base + i] >= 1.0) { w = 1u; }
  }
  wants[i] = w;
  workgroupBarrier();

  // EXCLUSIVE PREFIX SUM, Hillis-Steele. Deterministic: the result depends on
  // the index, not on which lane ran first.
  scan[i] = w;
  workgroupBarrier();
  var off = 1u;
  loop {
    if (off >= 256u) { break; }
    var v = 0u;
    if (i >= off) { v = scan[i - off]; }
    workgroupBarrier();
    scan[i] = scan[i] + v;
    workgroupBarrier();
    off = off * 2u;
  }
  // scan[i] is now inclusive; make it exclusive.
  var before = scan[i] - w;

  if (w == 1u) {
    let d = n + before;
    if (d < P.cap) {
      ready[base + i] = ready[base + i] - 1.0;
      // The daughter is the mother, halved: cytoplasm is DIVIDED, not created.
      // Both keep the maternal genes, which are boundary conditions.
      for (var g = 0u; g < P.nGene; g = g + 1u) {
        let src = conc[(base + i) * P.nGene + g];
        let half = select(src * 0.5, src, g < P.nMaternal);
        conc[(base + d) * P.nGene + g] = half;
        conc[(base + i) * P.nGene + g] = half;
      }
      // Placed a short way off, at an angle carried per cell so the direction is
      // a property of the genome's noise rather than of the schedule.
      let a = noise[base + i] * 6.283185307;
      xy[base + d] = xy[base + i] + vec2<f32>(cos(a), sin(a)) * 0.6;
      ready[base + d] = 0.0;
      live[base + d] = 1u;
    }
  }
  workgroupBarrier();

  // One lane publishes the new count, so it is written once and read the same
  // by everyone next tick.
  if (i == 0u) {
    var added = scan[255];
    let room = P.cap - n;
    if (added > room) { added = room; }
    count[e] = n + added;
  }
}
`;

export const DEVO_WGSL = /* wgsl */`
// Named DP, not P. The uniform variable below is called P - as it is in
// world_gpu.js, where the struct is called W - and naming both the same thing
// is a WGSL redefinition error. The pipeline is then invalid, every dispatch is
// a silent no-op, and every buffer reads zero, which looks exactly like a
// kernel computing the wrong answer.
struct DP {
  nEmbryo   : u32,
  cap       : u32,          // cell slots per embryo
  nGene     : u32,
  k         : u32,          // regulators per gene
  nMaternal : u32,
  dt        : f32,
  nbrK      : u32,          // neighbours kept per cell
  pad       : f32,
};

@group(0) @binding(0) var<uniform>             P    : DP;
// Concentrations, double buffered: [embryo*cap + cell]*nGene + gene.
@group(0) @binding(1) var<storage, read>       conc : array<f32>;
@group(0) @binding(2) var<storage, read_write> next : array<f32>;
// Per-embryo genome: bias/decay/diff/src/w, laid out exactly as devo2 packs it
// so one encoding serves both. [embryo*genomeStride + gene*GENE_STRIDE + field]
@group(0) @binding(3) var<storage, read>       genome : array<f32>;
// A liveness mask. Dead or unallocated slots are skipped entirely rather than
// being given zero concentrations, because zero is a legitimate concentration
// and would diffuse into its neighbours as if it were real.
//
// THERE IS NO xy BINDING, and that is not an oversight. The step needs
// neighbours, not positions, and the neighbour lists are precomputed. Declaring
// a buffer the shader never reads is worse than useless with layout:'auto':
// WebGPU builds the layout from what the shader actually USES, so the unused
// binding is absent from the layout while the bind group still supplies it, and
// every dispatch fails validation with a binding-count mismatch. The kernel
// then never runs, every buffer reads back as whatever was uploaded, and a
// pure-copy gene looks like it agrees while a computed one does not.
@group(0) @binding(4) var<storage, read>       live : array<u32>;
// Neighbour lists, precomputed on the CPU exactly as devo2 does: index and
// weight, nbrK per cell, -1 padded.
@group(0) @binding(5) var<storage, read>       nbrI : array<i32>;
@group(0) @binding(6) var<storage, read>       nbrW : array<f32>;

fn sigmoid(x: f32) -> f32 { return 1.0 / (1.0 + exp(-x)); }

// THE GENOME IS ENCODED, NOT RAW, and assuming otherwise is how the first
// version of this kernel disagreed with devo2 by 100%. Every one of these is
// devo2's own decode, transcribed:
//
//   decay  0.6 * 10^clamp(g, -1.2, 1.2)
//   diff   0.02 * 10^clamp(g, -1, 2) — two decades, because a Turing
//          instability needs activator and inhibitor to differ by about an
//          order of magnitude and the reachable span must contain that ratio
//   src    stored as a float so one flat array is the whole genome and the
//          mutation machinery keeps working; floor, mod NGENE, negative
//          meaning a silenced edge
fn decayOf(g: f32) -> f32 { return 0.6 * pow(10.0, clamp(g, -1.2, 1.2)); }
fn diffOf(g: f32)  -> f32 { return 0.02 * pow(10.0, clamp(g, -1.0, 2.0)); }
fn srcOf(v: f32) -> i32 {
  if (!(v >= 0.0)) { return -1; }
  let s = i32(floor(v)) % i32(${NGENE}u);
  return select(s, -1, s < 0);
}

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let slot = gid.x;
  let total = P.nEmbryo * P.cap;
  if (slot >= total) { return; }
  if (live[slot] == 0u) { return; }

  let e = slot / P.cap;                       // which embryo
  let gStride = P.nGene * ${GENE_STRIDE}u;
  let gBase = e * gStride;
  let cBase = slot * P.nGene;
  let nBase = slot * P.nbrK;

  // Maternal genes are boundary conditions, not products: they are written by
  // the CPU from the cell's position in the egg and must not be integrated.
  for (var g = P.nMaternal; g < P.nGene; g = g + 1u) {
    let gb = gBase + g * ${GENE_STRIDE}u;
    var net = genome[gb + ${OFF_BIAS}u];
    for (var k = 0u; k < P.k; k = k + 1u) {
      let sg = srcOf(genome[gb + ${OFF_SRC}u + k]);
      if (sg >= 0) { net = net + genome[gb + ${OFF_W}u + k] * conc[cBase + u32(sg)]; }
    }

    var lap = 0.0;
    let df = diffOf(genome[gb + ${OFF_DIFF}u]);
    if (df > 0.0) {
      // Weighted by proximity, and normalised by the weight sum rather than the
      // neighbour count — a cell twice as far signals less. Same as devo2.
      var acc = 0.0;
      var cnt = 0.0;
      for (var q = 0u; q < P.nbrK; q = q + 1u) {
        let ni = nbrI[nBase + q];
        if (ni < 0) { continue; }
        let wgt = nbrW[nBase + q];
        acc = acc + conc[u32(ni) * P.nGene + g] * wgt;
        cnt = cnt + wgt;
      }
      if (cnt > 0.0) { lap = df * (acc / cnt - conc[cBase + g]); }
    }

    let made = sigmoid(net);
    let dec = decayOf(genome[gb + ${OFF_DECAY}u]);
    let c = conc[cBase + g] + P.dt * (made - dec * conc[cBase + g] + lap);
    // Clamped the same way and for the same reason: concentrations are
    // non-negative and an unbounded positive feedback loop would otherwise
    // reach infinity and then NaN, which spreads through diffusion.
    next[cBase + g] = select(select(c, 40.0, c >= 40.0), 0.0, c <= 0.0);
  }

  // Maternal genes are carried across unchanged, or the next step reads zeros
  // where the egg's axes should be.
  for (var g = 0u; g < P.nMaternal; g = g + 1u) {
    next[cBase + g] = conc[cBase + g];
  }
}
`;

/**
 * A batch of embryos, resident on the GPU.
 *
 * The caller supplies cells and genomes and gets concentrations back. Nothing
 * here decides how many cells an embryo has or when one divides — that stays on
 * the CPU until the step itself is proven correct.
 */
export class DevoGPU {
  static async create(device, { nEmbryo, cap, nbrK = 12 }) {
    const d = new DevoGPU();
    d.dev = device;
    d.nEmbryo = nEmbryo; d.cap = cap; d.nbrK = nbrK;
    const total = nEmbryo * cap;
    d.total = total;

    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    const mk = (bytes, usage = S) => device.createBuffer({ size: Math.max(16, bytes), usage });

    // COPY_SRC on bConc as well as bNext: readConc copies OUT of bConc, and
    // without it every read came back zeroed. That reads as "the kernel
    // computes nothing", which is a long way from "the buffer cannot be copied".
    d.bConc = mk(total * NGENE * 4, S | GPUBufferUsage.COPY_SRC);
    d.bNext = mk(total * NGENE * 4, S | GPUBufferUsage.COPY_SRC);
    d.bGenome = mk(nEmbryo * NGENE * GENE_STRIDE * 4);
    d.bLive = mk(total * 4);
    d.bNbrI = mk(total * nbrK * 4);
    d.bNbrW = mk(total * nbrK * 4);
    d.bUni = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    // ASK THE SHADER WHETHER IT COMPILED. A WGSL error leaves an invalid
    // pipeline whose dispatches do nothing, so every buffer reads zero - which
    // is indistinguishable from a kernel that ran and computed zero. That cost
    // an afternoon and a request for help on a bug that was a compile failure.
    d.bReady = mk(total * 4);
    d.bXY = mk(total * 8, S | GPUBufferUsage.COPY_SRC);
    d.bCount = mk(nEmbryo * 4, S | GPUBufferUsage.COPY_SRC);
    d.bNoise = mk(total * 4);

    const mod = device.createShaderModule({ code: DEVO_WGSL, label: 'devo-grn' });
    const info = await mod.getCompilationInfo?.();
    const errs = (info?.messages ?? []).filter((m) => m.type === 'error');
    if (errs.length) {
      throw new Error('devo-gpu shader failed to compile:\n' +
        errs.map((m) => `  line ${m.lineNum}: ${m.message}`).join('\n'));
    }
    d.pipe = device.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'step' } });
    d.bind = (a, b) => device.createBindGroup({
      layout: d.pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: d.bUni } },
        { binding: 1, resource: { buffer: a } },
        { binding: 2, resource: { buffer: b } },
        { binding: 3, resource: { buffer: d.bGenome } },
        { binding: 4, resource: { buffer: d.bLive } },
        { binding: 5, resource: { buffer: d.bNbrI } },
        { binding: 6, resource: { buffer: d.bNbrW } },
      ],
    });
    const dmod = device.createShaderModule({ code: DIVIDE_WGSL, label: 'devo-divide' });
    const dinfo = await dmod.getCompilationInfo?.();
    const derrs = (dinfo?.messages ?? []).filter((m) => m.type === 'error');
    if (derrs.length) {
      throw new Error('devo-gpu divide shader failed to compile:\n' +
        derrs.map((m) => `  line ${m.lineNum}: ${m.message}`).join('\n'));
    }
    d.dpipe = device.createComputePipeline({ layout: 'auto', compute: { module: dmod, entryPoint: 'divide' } });
    d.dbind = () => device.createBindGroup({
      layout: d.dpipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: d.bUni } },
        { binding: 1, resource: { buffer: d.bConc } },
        { binding: 2, resource: { buffer: d.bReady } },
        { binding: 3, resource: { buffer: d.bXY } },
        { binding: 4, resource: { buffer: d.bLive } },
        { binding: 5, resource: { buffer: d.bCount } },
        { binding: 6, resource: { buffer: d.bNoise } },
      ],
    });
    return d;
  }

  /**
   * Every tick of a whole development, in ONE command buffer.
   *
   * step() and divide() each submit, so driving development by calling them
   * alternately costs two submits a tick - eight hundred for a four hundred
   * tick development. Measured that way the GPU was 1.2x the CPU, which is not
   * the compute being slow, it is the queue being asked eight hundred times to
   * do a few microseconds of work.
   *
   * The ping-pong is unrolled here rather than copied back each tick, so the
   * only copy is at the end and only if the parity is odd.
   */
  run(ticks) {
    const enc = this.dev.createCommandEncoder();
    const groups = Math.ceil(this.total / 64);
    let a = this.bConc, b = this.bNext;
    for (let t = 0; t < ticks; t++) {
      const p1 = enc.beginComputePass();
      p1.setPipeline(this.pipe);
      p1.setBindGroup(0, this.bind(a, b));
      p1.dispatchWorkgroups(groups);
      p1.end();
      const tmp = a; a = b; b = tmp;
      // Division reads and writes bConc by binding, so the newest state has to
      // be there before it runs.
      if (a !== this.bConc) enc.copyBufferToBuffer(this.bNext, 0, this.bConc, 0, this.total * NGENE * 4);
      a = this.bConc; b = this.bNext;
      const p2 = enc.beginComputePass();
      p2.setPipeline(this.dpipe);
      p2.setBindGroup(0, this.dbind());
      p2.dispatchWorkgroups(this.nEmbryo);
      p2.end();
    }
    this.dev.queue.submit([enc.finish()]);
  }

  /** One division pass: every embryo, one workgroup each. */
  divide() {
    const enc = this.dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.dpipe);
    pass.setBindGroup(0, this.dbind());
    pass.dispatchWorkgroups(this.nEmbryo);
    pass.end();
    this.dev.queue.submit([enc.finish()]);
  }

  async readCounts() {
    const bytes = this.nEmbryo * 4;
    const stag = this.dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.dev.createCommandEncoder();
    enc.copyBufferToBuffer(this.bCount, 0, stag, 0, bytes);
    this.dev.queue.submit([enc.finish()]);
    await stag.mapAsync(GPUMapMode.READ);
    const out = new Uint32Array(stag.getMappedRange().slice(0));
    stag.unmap(); stag.destroy();
    return out;
  }

  async readXY() {
    const bytes = this.total * 8;
    const stag = this.dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.dev.createCommandEncoder();
    enc.copyBufferToBuffer(this.bXY, 0, stag, 0, bytes);
    this.dev.queue.submit([enc.finish()]);
    await stag.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(stag.getMappedRange().slice(0));
    stag.unmap(); stag.destroy();
    return out;
  }

  /** @param {number} dt seconds per step, matching devo2's dtMs/1000. */
  setUniform(dt) {
    const u = new ArrayBuffer(32), dv = new DataView(u);
    dv.setUint32(0, this.nEmbryo, true);
    dv.setUint32(4, this.cap, true);
    dv.setUint32(8, NGENE, true);
    dv.setUint32(12, K, true);
    dv.setUint32(16, N_MATERNAL, true);
    dv.setFloat32(20, dt, true);
    dv.setUint32(24, this.nbrK, true);
    dv.setFloat32(28, this.divRate ?? 1.6, true);
    this.dev.queue.writeBuffer(this.bUni, 0, u);
  }

  upload({ conc, genome, live, nbrI, nbrW, ready, xy, count, noise }) {
    const q = this.dev.queue;
    if (conc) q.writeBuffer(this.bConc, 0, conc);
    if (genome) q.writeBuffer(this.bGenome, 0, genome);
    if (live) q.writeBuffer(this.bLive, 0, live);
    if (nbrI) q.writeBuffer(this.bNbrI, 0, nbrI);
    if (nbrW) q.writeBuffer(this.bNbrW, 0, nbrW);
    if (ready) q.writeBuffer(this.bReady, 0, ready);
    if (xy) q.writeBuffer(this.bXY, 0, xy);
    if (count) q.writeBuffer(this.bCount, 0, count);
    if (noise) q.writeBuffer(this.bNoise, 0, noise);
  }

  /** Advance every embryo by `steps` steps. Ping-pongs; leaves the result in bConc. */
  step(steps = 1) {
    const enc = this.dev.createCommandEncoder();
    const groups = Math.ceil(this.total / 64);
    let a = this.bConc, b = this.bNext;
    for (let s = 0; s < steps; s++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.pipe);
      pass.setBindGroup(0, this.bind(a, b));
      pass.dispatchWorkgroups(groups);
      pass.end();
      const t = a; a = b; b = t;
    }
    // An odd number of steps leaves the newest state in bNext; copy it back so
    // bConc is always the answer and the caller never has to track parity.
    if (a !== this.bConc) enc.copyBufferToBuffer(this.bNext, 0, this.bConc, 0, this.total * NGENE * 4);
    this.dev.queue.submit([enc.finish()]);
  }

  /**
   * Run once inside an error scope. A dispatch that fails validation is a
   * NO-OP, not an exception: the buffers keep whatever was uploaded and the
   * caller compares plausible-looking numbers that nothing computed. Call this
   * once at startup rather than trusting the first result.
   */
  async verify() {
    this.dev.pushErrorScope('validation');
    this.step(1);
    const e = await this.dev.popErrorScope();
    if (e) throw new Error('devo-gpu dispatch is invalid: ' + e.message);
    return true;
  }

  async readConc() {
    const bytes = this.total * NGENE * 4;
    const stag = this.dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.dev.createCommandEncoder();
    enc.copyBufferToBuffer(this.bConc, 0, stag, 0, bytes);
    this.dev.queue.submit([enc.finish()]);
    await stag.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(stag.getMappedRange().slice(0));
    stag.unmap(); stag.destroy();
    return out;
  }

  destroy() {
    for (const b of [this.bConc, this.bNext, this.bGenome, this.bLive, this.bReady, this.bXY, this.bCount, this.bNoise,
                     this.bNbrI, this.bNbrW, this.bUni]) b?.destroy?.();
  }
}
