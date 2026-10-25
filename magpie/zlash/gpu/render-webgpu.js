// ZX GPU: the WebGPU renderer. One render pass a frame, 4x multisampled, drawing the machine's
// screen (SPEC 10.2) back to front. Fills use stencil-then-cover: a triangle fan over each
// outline inverts the stencil (so the parity left behind is the even-odd rule), then a quad over
// the fill's bounds paints where the stencil is set and clears it. Strokes go into the stencil
// the same way and get one cover, so a translucent line never darkens where its segments overlap.
// Paper, text and the lower screen are textures; sprites are textured quads.

const WGSL = /* wgsl */`
struct VIn { @location(0) pos: vec2f, @location(1) uv: vec2f, @location(2) col: vec4f };
struct VOut { @builtin(position) p: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f, @location(2) sp: vec2f };
@group(0) @binding(0) var<uniform> u: vec4f;
@vertex fn vs(i: VIn) -> VOut {
  var o: VOut;
  o.p = vec4f(i.pos.x * u.x + u.z, i.pos.y * u.y + u.w, 0.0, 1.0);
  o.uv = i.uv; o.col = i.col; o.sp = i.pos;
  return o;
}
@fragment fn fsColour(i: VOut) -> @location(0) vec4f {
  var c = i.col;
  if (i.uv.x > 0.5) { // the ZX81 chequer: 4 pixel squares fixed to the screen
    let q = vec2i(floor((i.sp - vec2f(32.0, 24.0)) / 4.0));
    c = vec4f(vec3f(select(0.0, 1.0, ((q.x + q.y) & 1) != 0)), c.a);
  }
  return vec4f(c.rgb * c.a, c.a);
}
@fragment fn fsNone(i: VOut) -> @location(0) vec4f { return vec4f(0.0); }
@group(1) @binding(0) var tex: texture_2d<f32>;
@group(1) @binding(1) var smp: sampler;
@fragment fn fsTex(i: VOut) -> @location(0) vec4f {
  let t = textureSample(tex, smp, i.uv);
  let a = t.a * i.col.a;
  return vec4f(t.rgb * a, a);
}
`;

const FLOATS = 8; // x, y, u, v, r, g, b, a

export class WebGPURenderer {
  constructor(canvas) { this.canvas = canvas; this.name = 'WebGPU'; }

  async init() {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;
    const device = this.device = await adapter.requestDevice();
    this.ctx = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' });
    const module = device.createShaderModule({ code: WGSL });
    this.bgl0 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }] });
    this.bgl1 = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ] });
    const layoutC = device.createPipelineLayout({ bindGroupLayouts: [this.bgl0] });
    const layoutT = device.createPipelineLayout({ bindGroupLayouts: [this.bgl0, this.bgl1] });
    const vertex = { module, entryPoint: 'vs', buffers: [{ arrayStride: FLOATS * 4, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x2' },
      { shaderLocation: 1, offset: 8, format: 'float32x2' },
      { shaderLocation: 2, offset: 16, format: 'float32x4' },
    ] }] };
    const blend = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    const stencilFace = (compare, passOp) => ({ compare, passOp, failOp: 'keep', depthFailOp: 'keep' });
    const ds = (compare, passOp, writeMask = 0xff) => ({
      format: 'depth24plus-stencil8', depthWriteEnabled: false, depthCompare: 'always',
      stencilFront: stencilFace(compare, passOp), stencilBack: stencilFace(compare, passOp),
      stencilReadMask: 0xff, stencilWriteMask: writeMask,
    });
    const pipe = (layout, fs, depthStencil, writeMask = GPUColorWrite.ALL) => device.createRenderPipeline({
      layout, vertex, primitive: { topology: 'triangle-list', cullMode: 'none' },
      fragment: { module, entryPoint: fs, targets: [{ format: this.format, blend, writeMask }] },
      depthStencil, multisample: { count: 4 },
    });
    this.pFillStencil = pipe(layoutC, 'fsNone', ds('always', 'invert'), 0);
    this.pStrokeStencil = pipe(layoutC, 'fsNone', ds('always', 'replace'), 0);
    this.pCover = pipe(layoutC, 'fsColour', ds('not-equal', 'zero'));
    this.pSolid = pipe(layoutC, 'fsColour', ds('always', 'keep', 0));
    this.pTex = pipe(layoutT, 'fsTex', ds('always', 'keep', 0));
    this.ubuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bg0 = device.createBindGroup({ layout: this.bgl0, entries: [{ binding: 0, resource: { buffer: this.ubuf } }] });
    this.nearest = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
    this.linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const screenTex = () => {
      const t = device.createTexture({ size: [256, 192], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      return { t, bg: device.createBindGroup({ layout: this.bgl1, entries: [{ binding: 0, resource: t.createView() }, { binding: 1, resource: this.nearest }] }) };
    };
    this.paper = screenTex(); this.ink = screenTex(); this.lo = screenTex();
    this.paperD = new Uint8ClampedArray(256 * 192 * 4); this.inkD = new Uint8ClampedArray(256 * 192 * 4); this.loD = new Uint8ClampedArray(256 * 192 * 4);
    this.spriteTex = new Map();
    this.verts = new Float32Array(1 << 16);
    this.vbuf = null; this.vcap = 0;
    this.size = [0, 0];
    return true;
  }

  targets() {
    const W = this.canvas.width, H = this.canvas.height;
    if (W === this.size[0] && H === this.size[1]) return;
    this.size = [W, H];
    this.msaa?.destroy(); this.depth?.destroy();
    this.msaa = this.device.createTexture({ size: [W, H], sampleCount: 4, format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depth = this.device.createTexture({ size: [W, H], sampleCount: 4, format: 'depth24plus-stencil8', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }

  spriteTexture(m, name) {
    let s = this.spriteTex.get(name);
    if (!s) {
      const img = m.images[name];
      const t = this.device.createTexture({ size: [img.w, img.h], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      this.device.queue.writeTexture({ texture: t }, img.data, { bytesPerRow: img.w * 4 }, [img.w, img.h]);
      s = { img, bg: this.device.createBindGroup({ layout: this.bgl1, entries: [{ binding: 0, resource: t.createView() }, { binding: 1, resource: img.emoji ? this.linear : this.nearest }] }) };
      this.spriteTex.set(name, s);
    }
    return s;
  }

  render(m) {
    const dev = this.device, cv = this.canvas;
    this.targets();
    const W = cv.width, H = cv.height, s = Math.min(W / 320, H / 240), ox = (W - 320 * s) / 2, oy = (H - 240 * s) / 2;
    dev.queue.writeBuffer(this.ubuf, 0, new Float32Array([2 * s / W, -2 * s / H, -1 + 2 * ox / W, 1 - 2 * oy / H]));
    if (m.textDirty) {
      m.rasterText(this.paperD, this.inkD);
      dev.queue.writeTexture({ texture: this.paper.t }, this.paperD, { bytesPerRow: 1024 }, [256, 192]);
      dev.queue.writeTexture({ texture: this.ink.t }, this.inkD, { bytesPerRow: 1024 }, [256, 192]);
    }
    if (m.loDirty) { m.rasterLo(this.loD); dev.queue.writeTexture({ texture: this.lo.t }, this.loD, { bytesPerRow: 1024 }, [256, 192]); }

    // ---- geometry for the whole frame, in display pixels (320 x 240, the screen at 32,24) ----
    let n = 0;
    const draws = [];
    const room = (k) => {
      if ((n + k) * FLOATS <= this.verts.length) return;
      let len = this.verts.length; while ((n + k) * FLOATS > len) len *= 2;
      const v = new Float32Array(len); v.set(this.verts.subarray(0, n * FLOATS)); this.verts = v;
    };
    const vtx = (x, y, u, v, r, g, b, a) => { const o = n * FLOATS, V = this.verts; V[o] = x; V[o + 1] = y; V[o + 2] = u; V[o + 3] = v; V[o + 4] = r; V[o + 5] = g; V[o + 6] = b; V[o + 7] = a; n++; };
    const draw = (pipe, first, extra = {}) => { if (n > first) draws.push({ pipe, first, count: n - first, ...extra }); };
    const quad = (x0, y0, x1, y1, u0, v0, u1, v1, r, g, b, a) => {
      room(6);
      vtx(x0, y0, u0, v0, r, g, b, a); vtx(x1, y0, u1, v0, r, g, b, a); vtx(x1, y1, u1, v1, r, g, b, a);
      vtx(x0, y0, u0, v0, r, g, b, a); vtx(x1, y1, u1, v1, r, g, b, a); vtx(x0, y1, u0, v1, r, g, b, a);
    };
    const rgb = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

    let f0 = n;
    quad(0, 0, 320, 240, 0, 0, 0, 0, ...rgb(m.borderRgb), 1);
    quad(32, 24, 288, 216, 0, 0, 0, 0, ...rgb(m.bg), 1);
    draw('solid', f0, { scissor: 0 });
    f0 = n; quad(32, 24, 288, 216, 0, 0, 1, 1, 1, 1, 1, 1); draw('tex', f0, { bg: this.paper.bg });

    // the drawing layer: FXP transform (scale, rotate, offset), the text scroll, the screen offset
    const p = m.fx.props, rad = p.rot * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
    const a11 = cs * p.xs / 100, a12 = -sn * p.ys / 100, a21 = sn * p.xs / 100, a22 = cs * p.ys / 100;
    const tx = p.x + 32, ty = p.y - 8 * m.sr + 24;
    const layerA = Math.max(0, Math.min(1, p.al / 100));
    const lineScale = Math.sqrt(Math.abs((p.xs / 100) * (p.ys / 100))) || 1;
    for (const it of m.fx.items) {
      const [r, g, b] = rgb(it.c), a = layerA * Math.max(0, Math.min(1, it.a / 100));
      if (a <= 0) continue;
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      const T = (x, y) => { const X = a11 * x + a12 * y + tx, Y = a21 * x + a22 * y + ty; if (X < minx) minx = X; if (X > maxx) maxx = X; if (Y < miny) miny = Y; if (Y > maxy) maxy = Y; return [X, Y]; };
      f0 = n;
      if (it.k === 'f') {
        for (const pts of it.paths) {
          const k = pts.length / 2;
          if (k < 3) continue;
          room((k - 2) * 3);
          const [x0, y0] = T(pts[0], pts[1]);
          let [xp, yp] = T(pts[2], pts[3]);
          for (let i = 2; i < k; i++) {
            const [xi, yi] = T(pts[i * 2], pts[i * 2 + 1]);
            vtx(x0, y0, 0, 0, 0, 0, 0, 0); vtx(xp, yp, 0, 0, 0, 0, 0, 0); vtx(xi, yi, 0, 0, 0, 0, 0, 0);
            xp = xi; yp = yi;
          }
        }
        if (n === f0) continue;
        draw('fillStencil', f0);
      } else {
        const hw = (it.w > 0 ? it.w * lineScale : 1 / s) / 2;
        const pts = it.pts, k = pts.length / 2;
        room((k - 1) * 6);
        let [xa, ya] = T(pts[0], pts[1]);
        for (let i = 1; i < k; i++) {
          const [xb, yb] = T(pts[i * 2], pts[i * 2 + 1]);
          let dx = xb - xa, dy = yb - ya; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
          const ex = dx * hw, ey = dy * hw, nx = -dy * hw, ny = dx * hw; // square caps cover the joins
          const x1 = xa - ex, y1 = ya - ey, x2 = xb + ex, y2 = yb + ey;
          vtx(x1 + nx, y1 + ny, 0, 0, 0, 0, 0, 0); vtx(x2 + nx, y2 + ny, 0, 0, 0, 0, 0, 0); vtx(x2 - nx, y2 - ny, 0, 0, 0, 0, 0, 0);
          vtx(x1 + nx, y1 + ny, 0, 0, 0, 0, 0, 0); vtx(x2 - nx, y2 - ny, 0, 0, 0, 0, 0, 0); vtx(x1 - nx, y1 - ny, 0, 0, 0, 0, 0, 0);
          xa = xb; ya = yb;
        }
        minx -= hw * 2; miny -= hw * 2; maxx += hw * 2; maxy += hw * 2;
        draw('strokeStencil', f0);
      }
      f0 = n;
      quad(minx - 1, miny - 1, maxx + 1, maxy + 1, it.pat ? 1 : 0, 0, 0, 0, r, g, b, a);
      draw('cover', f0);
    }
    f0 = n; quad(32, 24, 288, 216, 0, 0, 1, 1, 1, 1, 1, 1); draw('tex', f0, { bg: this.ink.bg });
    for (const sp of m.sprites) {
      const st = this.spriteTexture(m, sp.name), img = st.img;
      const r2 = sp.rot * Math.PI / 180, c2 = Math.cos(r2), s2 = Math.sin(r2), kx = sp.xs / 100, ky = sp.ys / 100;
      const x0 = img.emoji ? -img.w / 2 : 0, y0 = img.emoji ? -img.h / 2 : 0;
      const P = (lx, ly) => { const X = lx * kx, Y = ly * ky; return [c2 * X - s2 * Y + sp.x + 32, s2 * X + c2 * Y + sp.y - 8 * m.sr + 24]; };
      const [ax, ay] = P(x0, y0), [bx, by] = P(x0 + img.w, y0), [cx, cy] = P(x0 + img.w, y0 + img.h), [dx, dy] = P(x0, y0 + img.h);
      const al = Math.max(0, Math.min(1, sp.al / 100));
      f0 = n; room(6);
      vtx(ax, ay, 0, 0, 1, 1, 1, al); vtx(bx, by, 1, 0, 1, 1, 1, al); vtx(cx, cy, 1, 1, 1, 1, 1, al);
      vtx(ax, ay, 0, 0, 1, 1, 1, al); vtx(cx, cy, 1, 1, 1, 1, 1, al); vtx(dx, dy, 0, 1, 1, 1, 1, al);
      draw('tex', f0, { bg: st.bg });
    }
    f0 = n; quad(32, 24, 288, 216, 0, 0, 1, 1, 1, 1, 1, 1); draw('tex', f0, { bg: this.lo.bg });

    // ---- upload and draw ----
    const bytes = n * FLOATS * 4;
    if (bytes > this.vcap) {
      this.vbuf?.destroy();
      this.vcap = Math.max(bytes, 1 << 20);
      this.vbuf = dev.createBuffer({ size: this.vcap, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    dev.queue.writeBuffer(this.vbuf, 0, this.verts.buffer, 0, bytes);
    const enc = dev.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.msaa.createView(), resolveTarget: this.ctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'discard' }],
      depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard', stencilClearValue: 0, stencilLoadOp: 'clear', stencilStoreOp: 'discard' },
    });
    pass.setVertexBuffer(0, this.vbuf);
    pass.setBindGroup(0, this.bg0);
    const pipes = { fillStencil: this.pFillStencil, strokeStencil: this.pStrokeStencil, cover: this.pCover, solid: this.pSolid, tex: this.pTex };
    let cur = null, clipped = null;
    const sx = Math.max(0, Math.floor(ox + 32 * s)), sy = Math.max(0, Math.floor(oy + 24 * s));
    const sw = Math.min(W - sx, Math.ceil(256 * s)), sh = Math.min(H - sy, Math.ceil(192 * s));
    for (const d of draws) {
      const want = d.scissor === 0 ? 0 : 1;
      if (want !== clipped) { if (want) pass.setScissorRect(sx, sy, Math.max(1, sw), Math.max(1, sh)); else pass.setScissorRect(0, 0, W, H); clipped = want; }
      if (d.pipe !== cur) { pass.setPipeline(pipes[d.pipe]); cur = d.pipe; }
      if (d.pipe === 'strokeStencil') pass.setStencilReference(1);
      else if (d.pipe === 'cover') pass.setStencilReference(0);
      if (d.bg) pass.setBindGroup(1, d.bg);
      pass.draw(d.count, 1, d.first);
    }
    pass.end();
    dev.queue.submit([enc.finish()]);
  }
}
