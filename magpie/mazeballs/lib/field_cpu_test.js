/**
 * The JS mirror of WGSL_FIELD must agree with the shader itself.
 *
 * Run: deno test --allow-all lib/field_cpu_test.js
 *
 * This is the enforcement that makes lib/field_cpu.js a cache rather than a
 * second source of truth. Rather than promising the two stay equivalent — a
 * promise nobody keeps across months of edits — the real WGSL is compiled and
 * dispatched on a GPU, sampled at thousands of points, and compared against the
 * JS. If either side is changed alone, this fails and names the discrepancy.
 *
 * Every drift this project has actually suffered would have been caught here:
 * a hardcoded constant left behind after the real value became per-item, a
 * shared shader block quietly reaching for a uniform, a hand-copied noise
 * function in a test file with nothing tying it to the original.
 */
import { assert } from 'jsr:@std/assert@1';
import { WGSL_FIELD } from './world_gpu.js';
import * as cpu from './field_cpu.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());

Deno.test({
  name: 'the JS field mirror agrees with the WGSL it mirrors',
  ignore: !HAS_GPU,
  async fn() {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();

    const N = 4096;
    const SEED = 1234, SCALE = 0.35, STRENGTH = 1.0;
    const T = 12.5, DX = 0.06, DY = 0.037, MORPH = 0.0075;

    // Query points spread well beyond the world, including negatives, because
    // the integer hash behaves differently either side of zero and a mirror that
    // only matches for positive coordinates is a mirror that will surprise you.
    const pts = new Float32Array(N * 2);
    let s = 99;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < N; i++) {
      pts[i * 2] = (rnd() * 2 - 1) * 400;
      pts[i * 2 + 1] = (rnd() * 2 - 1) * 400;
    }

    const code = `${WGSL_FIELD}
struct Q { n: u32, scale: f32, strength: f32, seed: u32,
           t: f32, dx: f32, dy: f32, morph: f32 };
@group(0) @binding(0) var<uniform> q : Q;
@group(0) @binding(1) var<storage, read> pts : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> out : array<vec4<f32>>;

@compute @workgroup_size(64)
fn probe(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= q.n) { return; }
  let p = pts[i];
  let f = flowField(p, q.scale, q.strength, q.seed);
  let r = resourceField(p, q.scale, q.seed, q.t, vec2<f32>(q.dx, q.dy), q.morph);
  out[i] = vec4<f32>(fbm(p * q.scale, q.seed), f.x, f.y, r);
}`;

    const errs = [];
    device.addEventListener?.('uncapturederror', e => errs.push(String(e.error?.message ?? e.error)));

    const mk = (data, usage) => {
      const b = device.createBuffer({ size: data.byteLength, usage });
      device.queue.writeBuffer(b, 0, data);
      return b;
    };
    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const bPts = mk(pts, S);
    const bOut = device.createBuffer({ size: N * 16, usage: S });
    const qbuf = new ArrayBuffer(32), qv = new DataView(qbuf);
    qv.setUint32(0, N, true); qv.setFloat32(4, SCALE, true);
    qv.setFloat32(8, STRENGTH, true); qv.setUint32(12, SEED, true);
    qv.setFloat32(16, T, true); qv.setFloat32(20, DX, true);
    qv.setFloat32(24, DY, true); qv.setFloat32(28, MORPH, true);
    const bQ = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(bQ, 0, qbuf);

    const module = device.createShaderModule({ code, label: 'field-probe' });
    const info = await module.getCompilationInfo?.();
    const fatal = (info?.messages ?? []).filter(m => m.type === 'error');
    assert(fatal.length === 0, `probe shader did not compile: ${fatal.map(m => m.message).join('; ')}`);

    const pipeline = device.createComputePipeline({
      layout: 'auto', compute: { module, entryPoint: 'probe' },
    });
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bQ } },
        { binding: 1, resource: { buffer: bPts } },
        { binding: 2, resource: { buffer: bOut } },
      ],
    });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(N / 64));
    pass.end();
    const staging = device.createBuffer({
      size: N * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    enc.copyBufferToBuffer(bOut, 0, staging, 0, N * 16);
    device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const got = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();

    assert(errs.length === 0, `WebGPU errors: ${errs.join('; ')}`);

    // f32 on both sides, but JS computes intermediates in f64 and rounds once,
    // so exact equality is not the bar. A mirror that has genuinely drifted is
    // wrong by far more than this.
    const TOL = 2e-4;
    let worstFbm = 0, worstFlow = 0, worstRes = 0, worstAt = -1;
    for (let i = 0; i < N; i++) {
      const x = pts[i * 2], y = pts[i * 2 + 1];
      const jf = cpu.fbm(x * SCALE, y * SCALE, SEED);
      const [jfx, jfy] = cpu.flowField(x, y, SCALE, STRENGTH, SEED);
      const jr = cpu.resourceField(x, y, SCALE, SEED, T, DX, DY, MORPH);

      const df = Math.abs(jf - got[i * 4]);
      const dfl = Math.max(Math.abs(jfx - got[i * 4 + 1]), Math.abs(jfy - got[i * 4 + 2]));
      const dr = Math.abs(jr - got[i * 4 + 3]);
      if (df > worstFbm) { worstFbm = df; worstAt = i; }
      worstFlow = Math.max(worstFlow, dfl);
      worstRes = Math.max(worstRes, dr);
    }

    assert(worstFbm < TOL,
      `fbm drifted: worst |JS - WGSL| = ${worstFbm.toExponential(2)} at ` +
      `(${pts[worstAt * 2].toFixed(2)}, ${pts[worstAt * 2 + 1].toFixed(2)})`);
    assert(worstFlow < TOL * 50, `flowField drifted: worst ${worstFlow.toExponential(2)}`);
    assert(worstRes < TOL, `resourceField drifted: worst ${worstRes.toExponential(2)}`);

    device.destroy();
  },
});
