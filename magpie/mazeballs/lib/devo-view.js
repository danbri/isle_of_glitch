/**
 * A WebGPU view of development as it happens.
 *
 * THE VISUAL LANGUAGE, and what each part of it is claiming.
 *
 *   DIVISION is the only event this model actually has during development, and it
 *     is shown by the daughter arriving bright and swelling from nothing. The
 *     worker also reports each daughter's MOTHER, so a mother-to-daughter link
 *     could be drawn — "that cell budded from this one" rather than "a dot
 *     appeared" — and that is worth doing. It is NOT drawn yet: a second pipeline
 *     that half worked seemed worse than an honest absence, so the hook is in the
 *     data and not on the screen.
 *
 *   GROWTH is drawn as cells easing up from nothing rather than popping in at
 *     full size. A body that appears one full-sized dot at a time reads as a
 *     list being filled; one that swells reads as tissue.
 *
 *   DEATH IS DRAWN ONCE, AT THE END, because that is when it happens. `survive`
 *     is applied in a single pass at hatching — the embryo grows, then cells
 *     below the threshold are carved away together. Trickling deaths through the
 *     growth phase would look better and would be a lie about the model.
 *
 *   AGE is carried in the colour: a cell is bright at birth and settles to its
 *     type hue over a second or so, so the growing margin of the body is visible
 *     as a bright rind against older tissue. Nothing in the simulation depends on
 *     age; this is the renderer saying where the action is.
 *
 * Two pipelines, one storage buffer of cells and one of division links, both
 * rewritten per frame. At the sizes this draws — up to a few thousand cells —
 * that is far cheaper than the development producing them.
 */

const CELL_WGSL = /* wgsl */`
struct View {
  centre : vec2<f32>,
  scale  : vec2<f32>,   // world units -> clip
  now    : f32,
  egg    : f32,
  carve  : f32,         // 0 growing, 1 fully carved
  pad    : f32,
};
@group(0) @binding(0) var<uniform> V : View;
// x, y, packed(type, culled), birth time
@group(0) @binding(1) var<storage, read> cells : array<vec4<f32>>;

struct Out {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv    : vec2<f32>,
  @location(1) tint  : vec3<f32>,
  @location(2) alpha : f32,
};

fn hueOf(t : i32) -> vec3<f32> {
  if (t == 1) { return vec3<f32>(0.40, 0.66, 0.63); }   // sensor, pale jade
  if (t == 2) { return vec3<f32>(0.78, 0.45, 0.32); }   // muscle, terracotta
  if (t == 3) { return vec3<f32>(0.56, 0.44, 0.62); }   // anchor, muted plum
  return vec3<f32>(0.60, 0.60, 0.55);                   // neuron, warm stone
}

@vertex
fn vs(@builtin(vertex_index) vi : u32,
      @builtin(instance_index) ii : u32) -> Out {
  var q = array<vec2<f32>, 6>(
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0, 1.0), vec2(1.0,-1.0), vec2( 1.0,1.0));
  let corner = q[vi];
  let c = cells[ii];
  let packed = i32(c.z);
  let kind = packed & 3;
  let culled = (packed >> 2) & 1;

  let age = max(0.0, V.now - c.w);

  // SWELLING, not popping. A cell eases to full size over its first fifth of a
  // second; before that it is a point and the body reads as tissue appearing
  // rather than a list being filled.
  let grow = clamp(age / 0.2, 0.0, 1.0);
  var r = 0.34 * (0.15 + 0.85 * grow * grow * (3.0 - 2.0 * grow));

  // The carve: culled cells shrink away together at the end.
  var a = 1.0;
  if (culled == 1) {
    r = r * (1.0 - V.carve);
    a = 1.0 - V.carve;
  }

  var o : Out;
  if (r <= 0.0005) {
    o.pos = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    o.uv = vec2<f32>(9.0, 9.0); o.tint = vec3<f32>(0.0); o.alpha = 0.0;
    return o;
  }
  let world = c.xy + corner * r;
  o.pos = vec4<f32>((world - V.centre) * V.scale, 0.0, 1.0);
  o.uv = corner;

  // Bright at birth, settling to the type hue. The growing margin therefore
  // shows as a bright rind on older tissue.
  let fresh = exp(-age * 1.6);
  o.tint = mix(hueOf(kind), vec3<f32>(1.0, 0.97, 0.88), fresh * 0.85);
  o.alpha = a;
  return o;
}

@fragment
fn fs(i : Out) -> @location(0) vec4<f32> {
  let d = length(i.uv);
  if (d > 1.0) { discard; }
  let edge = 1.0 - smoothstep(0.82, 1.0, d);
  let shade = 1.0 - 0.3 * smoothstep(0.0, 1.0, d);
  let col = i.tint * shade;
  return vec4<f32>(col * edge * i.alpha, edge * i.alpha);
}`;

export class DevoView {
  static async create(canvas) {
    if (!navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    const ctx = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'premultiplied' });
    return new DevoView(canvas, device, ctx, format);
  }

  constructor(canvas, device, ctx, format) {
    this.canvas = canvas; this.dev = device; this.ctx = ctx;
    this.cap = 1;
    this.cells = new Float32Array(4);
    this.now = 0; this.carve = 0; this.egg = 12;

    this.uni = device.createBuffer({ size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.buf = device.createBuffer({ size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

    const mod = device.createShaderModule({ code: CELL_WGSL, label: 'devo cells' });
    this.layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'read-only-storage' } },
    ]});
    this.pipe = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      }}]},
      primitive: { topology: 'triangle-list' },
    });
    this.rebind();
  }

  rebind() {
    this.bind = this.dev.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: this.uni } },
      { binding: 1, resource: { buffer: this.buf } },
    ]});
  }

  /** Grow the cell buffer to hold at least n instances. */
  ensure(n) {
    if (n <= this.cap) return;
    this.cap = Math.max(64, 1 << Math.ceil(Math.log2(n)));
    this.buf.destroy?.();
    this.buf = this.dev.createBuffer({ size: this.cap * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.cells = new Float32Array(this.cap * 4);
    this.rebind();
  }

  /**
   * @param {Float32Array} xy      interleaved positions
   * @param {Int32Array}   kind    0..3 per cell, or null while still growing
   * @param {Float32Array} birth   when each cell appeared, in view seconds
   * @param {Uint8Array}   culled  1 for cells the carve removes, or null
   */
  setCells(n, xy, kind, birth, culled) {
    this.ensure(n);
    const c = this.cells;
    for (let i = 0; i < n; i++) {
      c[i * 4]     = xy[i * 2];
      c[i * 4 + 1] = xy[i * 2 + 1];
      c[i * 4 + 2] = (kind ? kind[i] & 3 : 0) | ((culled && culled[i] ? 1 : 0) << 2);
      c[i * 4 + 3] = birth ? birth[i] : 0;
    }
    this.n = n;
    this.dev.queue.writeBuffer(this.buf, 0, c, 0, n * 4);
  }

  draw(nowSeconds, eggRadius, carve = 0) {
    const dev = this.dev, cv = this.canvas;
    const W = cv.width, H = cv.height;
    // Fit the egg, or the body if it has outgrown it.
    let reach = eggRadius;
    for (let i = 0; i < this.n; i++) {
      const x = this.cells[i * 4], y = this.cells[i * 4 + 1];
      const d = Math.hypot(x, y) + 0.6;
      if (d > reach) reach = d;
    }
    const s = 2 / reach * 0.46;
    const u = new Float32Array([0, 0, s * H / W * (W / H), s, nowSeconds, eggRadius, carve, 0]);
    // square aspect: scale x by H/W so circles stay circular
    u[2] = s * (H / W); u[3] = s;
    dev.queue.writeBuffer(this.uni, 0, u);

    const enc = dev.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{
      view: this.ctx.getCurrentTexture().createView(),
      clearValue: { r: 0.027, g: 0.047, b: 0.043, a: 1 },
      loadOp: 'clear', storeOp: 'store',
    }]});
    if (this.n > 0) {
      pass.setPipeline(this.pipe);
      pass.setBindGroup(0, this.bind);
      pass.draw(6, this.n);
    }
    pass.end();
    dev.queue.submit([enc.finish()]);
  }
}
