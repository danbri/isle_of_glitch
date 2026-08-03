/**
 * The BrainArena step kernel in WGSL — the same two passes, on the GPU.
 *
 * WHY THIS WORKLOAD AND NOT THE OTHERS. tools/backend.js measures tfjs-webgpu
 * LOSING to wasm by 10x on the evodevo step, because that step is dozens of
 * small ops where per-dispatch latency dominates. This kernel is the opposite
 * shape: two dispatches over hundreds of thousands of independent neurons,
 * gathering millions of edges. Measured on CPU at 10k beasts x 32 neurons with
 * K=16, one step is 18.5 ms of scalar single-threaded gather (5.1M edges at
 * ~3.6 ns each) — which is 0.8x realtime, i.e. the wall. That is the regime a
 * GPU exists for.
 *
 * IN-PLACE STATE, NO DOUBLE BUFFER. The CPU class keeps a `next` buffer because
 * it is convenient there. On GPU it is unnecessary and the reason is worth
 * stating, since it is the invariant that makes the kernel safe: pass 2 reads
 * `act` at ARBITRARY indices (the K edge sources) but reads and writes `state`
 * only at its OWN index. Nothing writes `act` during pass 2. So no thread can
 * observe another thread's `state` write, and the update is safe in place.
 *
 * DISPATCH ORDERING. All 2n dispatches for n steps are encoded into ONE compute
 * pass and ONE submit. WebGPU orders dispatches within a pass and makes a
 * dispatch's storage writes visible to the next, which is exactly the barrier
 * between "activate" and "integrate" that the algorithm needs — so a thousand
 * steps cost one submit and zero CPU round trips. That is the whole point:
 * state stays resident and the CPU only sees it when something asks.
 *
 * CPU AND GPU ARE NOT THE SAME RUN. JS evaluates the update with f64
 * intermediates and rounds once on the store into a Float32Array; WGSL has no
 * f64 and rounds at every operation. The two therefore agree to about f32
 * epsilon after one step and DRIFT APART over many, because CTRNN dynamics are
 * perfectly capable of amplifying a 1e-7 difference. Neither is wrong. The
 * consequence for the science is the part that matters: pick one engine as
 * canonical for a given run and resume its snapshots on that engine. The CPU
 * class is the reference implementation and the no-GPU fallback; the GPU is
 * what actually runs at scale.
 *
 * EXTERNAL DRIVE. `ext` is uploaded once and held constant for all n steps of a
 * call. Sensor input that changes every step therefore means n=1 and a round
 * trip per step, which forfeits the win — the real answer is that sensor cells
 * are cells too and their reading belongs in a GPU kernel beside this one, so
 * `ext` gets written GPU-side and never crosses the bus. Until that exists,
 * batch with a constant drive and know what the batching assumes.
 */

const WORKGROUP = 256;

const SHADER = /* wgsl */`
struct Params {
  n  : u32,          // neuron count
  k  : u32,          // incoming edges per neuron
  dt : f32,
  pad: f32,
};

@group(0) @binding(0) var<uniform>             P      : Params;
@group(0) @binding(1) var<storage, read_write> state  : array<f32>;
@group(0) @binding(2) var<storage, read>       bias   : array<f32>;
@group(0) @binding(3) var<storage, read>       invTau : array<f32>;
@group(0) @binding(4) var<storage, read_write> act    : array<f32>;
@group(0) @binding(5) var<storage, read>       esrc   : array<i32>;
@group(0) @binding(6) var<storage, read>       ew     : array<f32>;
@group(0) @binding(7) var<storage, read>       ext    : array<f32>;

// Pass 1: elementwise activation. act = tanh(state + bias).
@compute @workgroup_size(${WORKGROUP})
fn activate(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.n) { return; }
  act[i] = tanh(state[i] + bias[i]);
}

// Pass 2: gather K edges and integrate. Reads act at arbitrary indices, touches
// state only at i — see the in-place note in the module header.
@compute @workgroup_size(${WORKGROUP})
fn integrate(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.n) { return; }
  var acc = ext[i];
  let base = i * P.k;
  for (var k : u32 = 0u; k < P.k; k = k + 1u) {
    let s = esrc[base + k];
    // -1 marks an unused edge slot: fixed degree, sparse content.
    if (s >= 0) { acc = acc + ew[base + k] * act[u32(s)]; }
  }
  state[i] = state[i] + (acc - state[i]) * P.dt * invTau[i];
}
`;

/**
 * Request a device with limits big enough for an arena of this shape.
 *
 * Deno's adapter here reports 4 GiB storage bindings, but a browser commonly
 * reports the spec minimum of 128 MiB unless asked, and the edge table is the
 * buffer that blows past it first: N*K*4 bytes each for esrc and ew, which at
 * 640k neurons with K=32 is 78 MiB apiece. Ask for what the arena needs, capped
 * at what the adapter can give, so the failure is a clear error at device
 * creation rather than a confusing validation error at buffer creation.
 */
export async function requestDeviceFor({ neurons, degree }, adapter = null) {
  const ad = adapter ?? await navigator.gpu.requestAdapter();
  if (!ad) throw new Error('no WebGPU adapter');
  const need = Math.max(neurons * degree * 4, neurons * 4);
  const cap = (k, v) => Math.min(v, ad.limits[k]);
  const device = await ad.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: cap('maxStorageBufferBindingSize', need),
      maxBufferSize: cap('maxBufferSize', need),
    },
  });
  if (need > device.limits.maxStorageBufferBindingSize)
    throw new Error(
      `arena needs a ${(need / 1048576).toFixed(0)} MiB storage binding, device allows ` +
      `${(device.limits.maxStorageBufferBindingSize / 1048576).toFixed(0)} MiB — ` +
      `reduce neurons or degree, or split the edge table`);
  return { device, adapter: ad };
}

export class BrainArenaGPU {
  /**
   * Upload a CPU arena and prepare the pipelines.
   * @param {BrainArena} arena
   * @param {GPUDevice} [device]  one is requested to fit the arena if omitted
   */
  static async create(arena, device = null) {
    const dev = device ?? (await requestDeviceFor({ neurons: arena.N, degree: arena.K })).device;
    return new BrainArenaGPU(dev, arena);
  }

  constructor(device, arena) {
    this.device = device;
    this.N = arena.N; this.K = arena.K; this.dt = arena.dt;
    this.steps = arena.steps;

    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const mk = (data, usage = S) => {
      const b = device.createBuffer({ size: Math.max(4, data.byteLength), usage });
      device.queue.writeBuffer(b, 0, data);
      return b;
    };

    this.bState = mk(arena.state);
    this.bBias = mk(arena.bias);
    this.bInvTau = mk(arena.invTau);
    this.bAct = mk(arena.act);
    this.bEsrc = mk(arena.esrc);
    this.bEw = mk(arena.ew);
    this.bExt = mk(new Float32Array(this.N));

    const params = new ArrayBuffer(16);
    const dv = new DataView(params);
    dv.setUint32(0, this.N, true); dv.setUint32(4, this.K, true);
    dv.setFloat32(8, this.dt, true); dv.setFloat32(12, 0, true);
    this.bParams = device.createBuffer({
      size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.bParams, 0, params);

    // Staging buffer for readback, allocated once and reused — mapping churn is
    // the usual accidental cost in a poll loop.
    this.bRead = device.createBuffer({
      size: this.N * 4 * 2, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Validation errors are reported asynchronously and are otherwise silent —
    // a bad bind group simply makes every dispatch a no-op, which looks exactly
    // like a simulation that will not move. Surface them loudly instead.
    device.addEventListener?.('uncapturederror', (e) => {
      console.error('[brainarena_gpu] WebGPU error:', e.error?.message ?? e.error);
    });

    const module = device.createShaderModule({ code: SHADER, label: 'brainarena' });

    // An EXPLICIT bind group layout, shared by both entry points. Not
    // layout:'auto': that derives each pipeline's layout from the bindings its
    // entry point actually reads, and `activate` touches only 4 of the 8 — so
    // one bind group covering all 8 fails validation against it, silently, and
    // nothing ever runs. One declared layout keeps the two passes interchangeable.
    const ro = { type: 'read-only-storage' };
    const rw = { type: 'storage' };
    this.layout = device.createBindGroupLayout({
      label: 'brainarena',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: rw },   // state
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: ro },   // bias
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: ro },   // invTau
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: rw },   // act
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: ro },   // esrc
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: ro },   // ew
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: ro },   // ext
      ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipeActivate = device.createComputePipeline({
      layout: pipelineLayout, compute: { module, entryPoint: 'activate' },
    });
    this.pipeIntegrate = device.createComputePipeline({
      layout: pipelineLayout, compute: { module, entryPoint: 'integrate' },
    });

    const entries = [
      { binding: 0, resource: { buffer: this.bParams } },
      { binding: 1, resource: { buffer: this.bState } },
      { binding: 2, resource: { buffer: this.bBias } },
      { binding: 3, resource: { buffer: this.bInvTau } },
      { binding: 4, resource: { buffer: this.bAct } },
      { binding: 5, resource: { buffer: this.bEsrc } },
      { binding: 6, resource: { buffer: this.bEw } },
      { binding: 7, resource: { buffer: this.bExt } },
    ];
    this.bindGroup = device.createBindGroup({ layout: this.layout, entries });
    this.groups = Math.ceil(this.N / WORKGROUP);
    if (this.groups > device.limits.maxComputeWorkgroupsPerDimension)
      throw new Error(
        `${this.N} neurons needs ${this.groups} workgroups, device allows ` +
        `${device.limits.maxComputeWorkgroupsPerDimension} per dimension`);
  }

  /** Replace the external drive held constant across subsequent steps. */
  setExternal(ext) {
    if (ext.length !== this.N) throw new Error(`ext has ${ext.length} entries, arena has ${this.N}`);
    this.device.queue.writeBuffer(this.bExt, 0, ext);
  }

  /**
   * Run `n` integration steps entirely on the GPU: one compute pass, one submit,
   * no readback. Returns immediately; the work is queued.
   */
  step(n = 1) {
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, this.bindGroup);
    for (let s = 0; s < n; s++) {
      pass.setPipeline(this.pipeActivate);
      pass.dispatchWorkgroups(this.groups);
      pass.setPipeline(this.pipeIntegrate);
      pass.dispatchWorkgroups(this.groups);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.steps += n;
  }

  /**
   * Pull `state` and `act` back to the CPU. This is the ONLY transfer in the
   * steady loop, and it exists for the reasons the design allows: logging, the
   * inspector, and writing a snapshot. Rendering does not need it — a WebGPU
   * renderer can read these buffers directly.
   *
   * @param {BrainArena} [into]  written in place when given, so a CPU arena can
   *                             snapshot a GPU run.
   */
  async readState(into = null) {
    // A staging buffer PER CALL, not one shared for the object's lifetime.
    // mapAsync is asynchronous, so two overlapping readbacks both reach for the
    // same buffer and the second gets "Buffer is already mapped" — which is a
    // device error, and a device error poisons every command buffer submitted
    // afterwards. One viewer never triggered it; two browsers polling frames
    // concurrently did, and the whole simulation stopped rather than just that
    // one request failing.
    const staging = this.device.createBuffer({
      size: this.N * 4 * 2, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.bState, 0, staging, 0, this.N * 4);
    enc.copyBufferToBuffer(this.bAct, 0, staging, this.N * 4, this.N * 4);
    this.device.queue.submit([enc.finish()]);

    await staging.mapAsync(GPUMapMode.READ);
    const src = staging.getMappedRange();
    const state = new Float32Array(src.slice(0, this.N * 4));
    const act = new Float32Array(src.slice(this.N * 4, this.N * 8));
    staging.unmap(); staging.destroy();

    if (into) {
      into.state.set(state); into.act.set(act); into.next.set(state);
      into.steps = this.steps;
    }
    return { state, act };
  }

  /** Push a CPU arena's mutable state back onto the GPU (e.g. after a restore). */
  writeState(arena) {
    this.device.queue.writeBuffer(this.bState, 0, arena.state);
    this.device.queue.writeBuffer(this.bAct, 0, arena.act);
    this.steps = arena.steps;
  }

  destroy() {
    for (const b of [this.bState, this.bBias, this.bInvTau, this.bAct, this.bEsrc,
      this.bEw, this.bExt, this.bParams, this.bRead]) b.destroy();
  }
}
