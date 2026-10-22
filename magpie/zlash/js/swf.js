// Minimal SWF writer: bit-level encoders and the handful of tags we need.
// Reference: Adobe "SWF File Format Specification" v19.

export class ByteWriter {
  constructor() { this.buf = new Uint8Array(1024); this.len = 0; }
  _grow(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const nb = new Uint8Array(cap); nb.set(this.buf.subarray(0, this.len)); this.buf = nb;
  }
  u8(v) { this._grow(1); this.buf[this.len++] = v & 0xff; return this; }
  u16(v) { this.u8(v); this.u8(v >> 8); return this; }
  i16(v) { return this.u16(v & 0xffff); }
  u32(v) { this.u16(v & 0xffff); this.u16((v >>> 16) & 0xffff); return this; }
  i32(v) { return this.u32(v >>> 0); }
  f32(v) { const dv = new DataView(new ArrayBuffer(4)); dv.setFloat32(0, v, true); return this.bytes(new Uint8Array(dv.buffer)); }
  // SWF doubles are little-endian but with the two 32-bit halves swapped.
  f64swapped(v) {
    const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, v, true);
    const b = new Uint8Array(dv.buffer);
    return this.bytes(new Uint8Array([b[4], b[5], b[6], b[7], b[0], b[1], b[2], b[3]]));
  }
  fixed8(v) { return this.u16(Math.round(v * 256)); }
  str(s) { // null-terminated UTF-8
    const enc = new TextEncoder().encode(s);
    this.bytes(enc); this.u8(0); return this;
  }
  bytes(arr) { this._grow(arr.length); this.buf.set(arr, this.len); this.len += arr.length; return this; }
  bits(bw) { return this.bytes(bw.finish()); }
  patchU32(pos, v) { this.buf[pos] = v & 0xff; this.buf[pos + 1] = (v >> 8) & 0xff; this.buf[pos + 2] = (v >> 16) & 0xff; this.buf[pos + 3] = (v >>> 24) & 0xff; }
  patchU16(pos, v) { this.buf[pos] = v & 0xff; this.buf[pos + 1] = (v >> 8) & 0xff; }
  get position() { return this.len; }
  finish() { return this.buf.slice(0, this.len); }
}

export class BitWriter {
  constructor() { this.bytes_ = []; this.cur = 0; this.nbits = 0; }
  ub(nbits, v) { // unsigned
    for (let i = nbits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((v >>> i) & 1);
      this.nbits++;
      if (this.nbits === 8) { this.bytes_.push(this.cur); this.cur = 0; this.nbits = 0; }
    }
    return this;
  }
  sb(nbits, v) { return this.ub(nbits, v < 0 ? (v + (1 << nbits)) : v); }
  fb(nbits, v) { return this.sb(nbits, Math.round(v * 65536)); } // 16.16 fixed
  align() { if (this.nbits) { this.bytes_.push(this.cur << (8 - this.nbits)); this.cur = 0; this.nbits = 0; } return this; }
  finish() { this.align(); return new Uint8Array(this.bytes_); }
}

export function bitsForSigned(...vals) { // minimum bits to hold all values as signed
  let n = 1;
  for (const v of vals) {
    const m = Math.abs(v);
    let need = 1;
    while ((1 << (need - 1)) <= m) need++;
    if (need > n) n = need;
  }
  return Math.min(n, 31);
}
export function bitsForUnsigned(...vals) {
  let n = 0;
  for (const v of vals) { let need = 0; while ((1 << need) <= v) need++; if (need > n) n = need; }
  return n;
}

export const TWIP = 20;

export function writeRect(bw, xmin, xmax, ymin, ymax) {
  const nb = bitsForSigned(xmin, xmax, ymin, ymax);
  bw.ub(5, nb).sb(nb, xmin).sb(nb, xmax).sb(nb, ymin).sb(nb, ymax);
}

export function writeMatrix(bw, { sx = 1, sy = 1, tx = 0, ty = 0 } = {}) {
  if (sx !== 1 || sy !== 1) {
    const nb = Math.min(31, bitsForSigned(Math.round(sx * 65536), Math.round(sy * 65536)));
    bw.ub(1, 1).ub(5, nb).fb(nb, sx).fb(nb, sy);
  } else bw.ub(1, 0);
  bw.ub(1, 0); // no rotate
  const nt = bitsForSigned(tx, ty);
  bw.ub(5, nt).sb(nt, tx).sb(nt, ty);
}

export function rgb(bw, c) { bw.u8((c >> 16) & 0xff).u8((c >> 8) & 0xff).u8(c & 0xff); }

// ---- Tags ----
export function tag(code, body) {
  const out = new ByteWriter();
  const b = body instanceof Uint8Array ? body : body.finish();
  if (b.length < 63) out.u16((code << 6) | b.length);
  else { out.u16((code << 6) | 0x3f); out.u32(b.length); }
  out.bytes(b);
  return out.finish();
}

export const T = { DefineBitsLossless2: 36, End: 0, ShowFrame: 1, DefineShape: 2, PlaceObject: 4, RemoveObject: 5, SetBackgroundColor: 9, DoAction: 12, DefineSound: 14, StartSound: 15, PlaceObject2: 26, DefineShape3: 32, DefineSprite: 39, ExportAssets: 56, FileAttributes: 69 };

export function tagFileAttributes() { return tag(T.FileAttributes, new ByteWriter().u32(0)); }
export function tagBackground(c) { const w = new ByteWriter(); rgb(w, c); return tag(T.SetBackgroundColor, w); }
export function tagShowFrame() { return tag(T.ShowFrame, new Uint8Array(0)); }
export function tagEnd() { return tag(T.End, new Uint8Array(0)); }
export function tagDoAction(actions) { return tag(T.DoAction, actions); }
export function tagExportAssets(list) { // [{id,name}]
  const w = new ByteWriter(); w.u16(list.length);
  for (const { id, name } of list) { w.u16(id); w.str(name); }
  return tag(T.ExportAssets, w);
}
export function tagPlaceObject2({ depth, id, matrix, name }) {
  const w = new ByteWriter();
  let flags = 0x02; // HasCharacter
  if (matrix) flags |= 0x04;
  if (name) flags |= 0x20;
  w.u8(flags); w.u16(depth); w.u16(id);
  if (matrix) { const bw = new BitWriter(); writeMatrix(bw, matrix); w.bits(bw); }
  if (name) w.str(name);
  return tag(T.PlaceObject2, w);
}
export function tagDefineSprite(id, controlTags) {
  let frames = 0;
  for (const t of controlTags) if (((t[0] | (t[1] << 8)) >> 6) === T.ShowFrame) frames++;
  const w = new ByteWriter(); w.u16(id); w.u16(frames);
  for (const t of controlTags) w.bytes(t);
  return tag(T.DefineSprite, w);
}

// A shape made of axis-aligned filled rectangles (in pixel units), one solid colour.
export function tagDefineShapeRects(id, rects, colour, bounds) {
  const w = new ByteWriter(); w.u16(id);
  const bw = new BitWriter();
  const b = bounds || rectBounds(rects);
  writeRect(bw, b.xmin * TWIP, b.xmax * TWIP, b.ymin * TWIP, b.ymax * TWIP);
  bw.align();
  w.bits(bw);
  // fill styles
  w.u8(1); w.u8(0x00); rgb(w, colour);
  // line styles
  w.u8(0);
  const sb = new BitWriter();
  sb.ub(4, 1).ub(4, 0); // 1 fill bit, 0 line bits
  let cx = 0, cy = 0, first = true;
  for (const r of rects) {
    const x0 = Math.round(r.x * TWIP), y0 = Math.round(r.y * TWIP), wd = Math.round(r.w * TWIP), ht = Math.round(r.h * TWIP);
    // style change: moveTo + (first time) set fill0
    const dx = x0, dy = y0; // MoveTo is absolute
    const mb = bitsForSigned(dx, dy);
    sb.ub(1, 0).ub(1, 0).ub(1, 0).ub(1, 0).ub(1, first ? 1 : 0).ub(1, 1);
    sb.ub(5, mb).sb(mb, dx).sb(mb, dy);
    if (first) sb.ub(1, 1); // fillstyle0 = 1
    first = false;
    edge(sb, wd, 0); edge(sb, 0, ht); edge(sb, -wd, 0); edge(sb, 0, -ht);
    cx = x0; cy = y0;
  }
  sb.ub(6, 0); // end
  w.bits(sb);
  return tag(T.DefineShape, w);
}
function edge(sb, dx, dy) {
  sb.ub(1, 1).ub(1, 1); // edge, straight
  if (dx !== 0 && dy !== 0) {
    const nb = Math.max(2, bitsForSigned(dx, dy));
    sb.ub(4, nb - 2).ub(1, 1).sb(nb, dx).sb(nb, dy);
  } else {
    const v = dx !== 0 ? dx : dy;
    const nb = Math.max(2, bitsForSigned(v));
    sb.ub(4, nb - 2).ub(1, 0).ub(1, dx !== 0 ? 0 : 1).sb(nb, v);
  }
}
export function rectBounds(rects) {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const r of rects) { xmin = Math.min(xmin, r.x); ymin = Math.min(ymin, r.y); xmax = Math.max(xmax, r.x + r.w); ymax = Math.max(ymax, r.y + r.h); }
  if (!rects.length) return { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  return { xmin, ymin, xmax, ymax };
}

// Uncompressed 16-bit mono PCM sound. rate: 0=5.5k 1=11k 2=22k 3=44k
export function tagDefineSound(id, samples /* Int16Array */, rate = 2) {
  const w = new ByteWriter(); w.u16(id);
  w.u8((3 << 4) | (rate << 2) | (1 << 1) | 0); // format 3 = uncompressed LE, 16-bit, mono
  w.u32(samples.length);
  for (let i = 0; i < samples.length; i++) w.i16(samples[i]);
  return tag(T.DefineSound, w);
}

// Uncompressed 8-bit unsigned mono PCM. rate: 0=5.5k 1=11k 2=22k 3=44k
export function tagDefineSound8(id, samples /* Uint8Array */, rate = 1) {
  const w = new ByteWriter(); w.u16(id);
  w.u8((3 << 4) | (rate << 2) | (0 << 1) | 0); // format 3, 8-bit, mono
  w.u32(samples.length);
  w.bytes(samples);
  return tag(T.DefineSound, w);
}

// Assemble a whole SWF (uncompressed, "FWS").
export function buildSwf({ width, height, frameRate = 50, frameCount = 1, tags, version = 8 }) {
  const body = new ByteWriter();
  const bw = new BitWriter();
  writeRect(bw, 0, width * TWIP, 0, height * TWIP);
  body.bits(bw);
  body.fixed8(frameRate);
  body.u16(frameCount);
  for (const t of tags) body.bytes(t);
  const out = new ByteWriter();
  out.u8(0x46).u8(0x57).u8(0x53).u8(version); // "FWS"
  const lenPos = out.position; out.u32(0);
  out.bytes(body.finish());
  out.patchU32(lenPos, out.position);
  return out.finish();
}

// zlib stream with stored (uncompressed) deflate blocks: tiny to write, valid everywhere.
export function zlibStored(data) {
  const w = new ByteWriter();
  w.u8(0x78).u8(0x01);
  for (let i = 0; i < data.length || i === 0; i += 65535) {
    const chunk = data.subarray(i, Math.min(i + 65535, data.length));
    const last = i + 65535 >= data.length;
    w.u8(last ? 1 : 0); w.u16(chunk.length); w.u16(~chunk.length & 0xffff); w.bytes(chunk);
    if (data.length === 0) break;
  }
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) { a = (a + data[i]) % 65521; b = (b + a) % 65521; }
  w.u8(b >> 8).u8(b & 0xff).u8(a >> 8).u8(a & 0xff); // adler32, big-endian
  return w.finish();
}

// 32-bit ARGB bitmap with alpha (premultiplied, as the format requires). rgba = Uint8ClampedArray from canvas.
export function tagDefineBitsLossless2(id, width, height, rgba) {
  const px = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3];
    px[i * 4] = a;
    px[i * 4 + 1] = (rgba[i * 4] * a + 127) / 255;
    px[i * 4 + 2] = (rgba[i * 4 + 1] * a + 127) / 255;
    px[i * 4 + 3] = (rgba[i * 4 + 2] * a + 127) / 255;
  }
  const w = new ByteWriter(); w.u16(id); w.u8(5); w.u16(width); w.u16(height); w.bytes(zlibStored(px));
  return tag(T.DefineBitsLossless2, w);
}

// A w x h pixel rectangle filled with a (clipped) bitmap.
export function tagDefineShapeBitmap(id, bitmapId, width, height) {
  const w = new ByteWriter(); w.u16(id);
  const bw = new BitWriter();
  writeRect(bw, 0, width * TWIP, 0, height * TWIP); bw.align(); w.bits(bw);
  w.u8(1); w.u8(0x41); w.u16(bitmapId); // one fill: clipped bitmap
  const mb = new BitWriter(); writeMatrix(mb, { sx: TWIP, sy: TWIP }); mb.align(); w.bits(mb); // bitmap pixels -> twips
  w.u8(0); // no line styles
  const sb = new BitWriter();
  sb.ub(4, 1).ub(4, 0);
  sb.ub(1, 0).ub(1, 0).ub(1, 0).ub(1, 0).ub(1, 1).ub(1, 1); // style change: fill0 + moveTo
  sb.ub(5, 1).sb(1, 0).sb(1, 0); sb.ub(1, 1);
  const W = width * TWIP, H = height * TWIP;
  for (const [dx, dy] of [[W, 0], [0, H], [-W, 0], [0, -H]]) {
    const nb = Math.max(2, bitsForSigned(dx, dy));
    sb.ub(1, 1).ub(1, 1).ub(4, nb - 2).ub(1, 1).sb(nb, dx).sb(nb, dy);
  }
  sb.ub(6, 0); w.bits(sb);
  return tag(T.DefineShape, w);
}
