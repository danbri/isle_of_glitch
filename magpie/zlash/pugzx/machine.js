// PUGZX: the machine a program sees (../SPEC.md sections 9 to 17): the screen as data (text
// cells, a retained display list of fills and strokes, sprites), sound and storage through the
// host, keys and mouse from the host, and the 50 Hz frame clock. Renderers read the screen from
// here; nothing in this file draws pixels except the text rasteriser, which both renderers share.
import { zxFont } from './font.js?v=mvnun35f';
import { compile, instantiate } from './compile.js?v=mvnun35f';

export const FPS = 50;
export const PALETTE = [
  0x000000, 0x0000D7, 0xD70000, 0xD700D7, 0x00D700, 0x00D7D7, 0xD7D700, 0xD7D7D7,
  0x000000, 0x0000FF, 0xFF0000, 0xFF00FF, 0x00FF00, 0x00FFFF, 0xFFFF00, 0xFFFFFF,
];
const SPRITE_COLOURS = { '#': 0x000000, '+': 0x808080, 'W': 0xFFFFFF };
for (let i = 0; i < 8; i++) { SPRITE_COLOURS[String(i)] = PALETTE[i]; SPRITE_COLOURS['abcdefgh'[i]] = PALETTE[8 + i]; }

const FONT = zxFont();
const GLYPHS = [];
for (let code = 0; code < 256; code++) {
  const rows = new Uint8Array(8);
  let c = code;
  if (c >= 144 && c <= 164) c = 65 + (c - 144);           // UDGs look like A..U
  if (c >= 128 && c < 144) {                              // block graphics
    const b = c - 128;
    const top = (b & 2 ? 0xF0 : 0) | (b & 1 ? 0x0F : 0), bot = (b & 8 ? 0xF0 : 0) | (b & 4 ? 0x0F : 0);
    rows.fill(top, 0, 4); rows.fill(bot, 4, 8);
  } else {
    if (c < 32 || c > 127) c = 63;                        // '?'
    rows.set(FONT.subarray((c - 32) * 8, (c - 32) * 8 + 8));
  }
  GLYPHS.push(rows);
}

// ---- the drawing layer: Flash's drawing API as a retained list of fills and strokes (SPEC 12) ----
class DrawingLayer {
  constructor() { this.items = []; this.props = { x: 0, y: 0, xs: 100, ys: 100, rot: 0, al: 100 }; this.clear(); }
  clear() { this.items = []; this.ls = null; this.fill = null; this.paths = null; this.pending = null; this.stroke = null; this.x = 0; this.y = 0; }
  lineStyle(w, c, a) { this.endStroke(); this.ls = w === undefined ? null : { w: Math.max(0, +w || 0), c: (c ?? 0) | 0, a: a ?? 100 }; }
  beginFill(c, a) {
    if (this.fill) this.endFill();
    this.endStroke();
    this.fill = { c: (c ?? 0) | 0, a: a ?? 100, pat: 0 };
    this.paths = [[this.x, this.y]];
    this.pending = [];
  }
  chequer() { this.beginFill(0, 100); this.fill.pat = 1; }
  beginGradientFill(type, colours, alphas) {
    const c = Array.isArray(colours) ? colours[0] : colours, a = Array.isArray(alphas) ? alphas[0] : alphas;
    this.beginFill(typeof c === 'number' ? c : 0, typeof a === 'number' ? a : 100);
  }
  beginBitmapFill() { this.beginFill(0x808080, 100); }
  lineGradientStyle() { }
  moveTo(x, y) { this.endStroke(); this.x = x; this.y = y; if (this.fill) this.paths.push([x, y]); }
  lineTo(x, y) {
    if (this.fill) this.paths[this.paths.length - 1].push(x, y);
    if (this.ls) {
      if (!this.stroke) this.stroke = { k: 's', w: this.ls.w, c: this.ls.c, a: this.ls.a, pts: [this.x, this.y] };
      this.stroke.pts.push(x, y);
    }
    this.x = x; this.y = y;
  }
  curveTo(cx, cy, x, y) {
    const x0 = this.x, y0 = this.y;
    const n = Math.max(2, Math.min(24, Math.ceil((Math.hypot(cx - x0, cy - y0) + Math.hypot(x - cx, y - cy)) / 3)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
    }
  }
  endStroke() {
    if (!this.stroke) return;
    if (this.stroke.pts.length >= 4) (this.fill ? this.pending : this.items).push(this.stroke);
    this.stroke = null;
  }
  endFill() {
    if (!this.fill) return;
    // each outline closes back to its start; with a line style on, the closing edge is stroked too
    if (this.ls) {
      const last = this.paths.length - 1;
      this.paths.forEach((p, k) => {
        if (p.length < 4) return;
        const fx = p[0], fy = p[1], lx = p[p.length - 2], ly = p[p.length - 1];
        if (fx === lx && fy === ly) return;
        if (k === last && this.stroke) this.stroke.pts.push(fx, fy);
        else this.pending.push({ k: 's', w: this.ls.w, c: this.ls.c, a: this.ls.a, pts: [lx, ly, fx, fy] });
      });
    }
    this.endStroke();
    const paths = this.paths.filter(p => p.length >= 6);
    if (paths.length) this.items.push({ k: 'f', c: this.fill.c, a: this.fill.a, pat: this.fill.pat, paths });
    for (const s of this.pending) this.items.push(s);
    this.fill = null; this.paths = null; this.pending = null;
  }
}

export class Machine {
  // host: { beep(d,p), tone(p), loader(name), store: {get(k), set(k,v)}, emoji(text,size) -> {w,h,data} }
  constructor(source, host = {}) {
    this.host = host;
    this.rnd = host.random || Math.random;
    this.compiled = compile(source);
    this.STOP = { stop: true };
    this.fx = new DrawingLayer();
    this.images = {};
    for (const [name, rows] of Object.entries(this.compiled.sprites)) this.images[name] = spriteImage(rows);
    for (const [name, { text, size }] of Object.entries(this.compiled.emojis)) {
      const img = host.emoji ? host.emoji(text, size) : { w: size, h: size, data: new Uint8ClampedArray(size * size * 4) };
      this.images[name] = { ...img, emoji: true };
    }
    // registers
    this.ink = 0; this.pap = 7; this.brt = 0; this.tink = 0; this.tpap = 7; this.sbrt = 0; this.wrap = 0;
    this.borderRgb = PALETTE[7]; this.bg = PALETTE[7];
    this.cells = new Map(); this.r = 0; this.c = 0; this.sr = 0; this.textDirty = true;
    this.lo = ''; this.loInk = 0; this.loPap = PALETTE[7]; this.loDirty = true;
    this.sprites = [];
    this.px = 0; this.py = 0;
    this.t = 0; this.wait = 0; this.mode = 0; this.done = false; this.deadline = Infinity; this.sliceMs = 12;
    this.dp = 0;
    this.held = new Set(); this.lastId = null; this.lastCh = ''; this.kbuf = '';
    this.mx = 0; this.my = 0; this.mbHeld = 0; this.mbPending = 0; this.mbTap = 0; this.mbX = 0; this.mbY = 0; this.mb = 0;
    this.ibuf = ''; this.iprompt = ''; this.iset = null; this.istr = 0;
    this.prog = instantiate(this.compiled, this);
    this.cls();
  }

  // ---- the frame clock (SPEC 9): call 50 times a second; returns how the program's run ended ----
  frame(now = performance.now()) {
    this.t++;
    if (this.done || this.mode !== 0) return -1;
    if (this.wait > 0) { this.wait--; return -1; }
    this.mb = this.mbHeld || this.mbPending ? 1 : 0;
    this.mbTap = this.mbPending && !this.mbHeld ? 1 : 0;
    this.mbPending = 0;
    this.deadline = now + this.sliceMs;
    return this.prog.run();
  }
  over() { return performance.now() > this.deadline; }

  // ---- colour (SPEC 10.5) ----
  ci(c) {
    if (c >= 16) return c | 0;
    c = Math.floor(c);
    if (c < 8 && this.brt) c += 8;
    if (!(c >= 0)) c = 0;
    return PALETTE[c] ?? 0;
  }
  border(n) { this.borderRgb = this.ci(n); }

  // ---- text (SPEC 10.3) ----
  cls() {
    this.cells.clear(); this.fx = new DrawingLayer(); this.sprites = [];
    this.bg = this.ci(this.pap); this.r = 0; this.c = 0; this.sr = 0; this.textDirty = true;
  }
  pbegin() { this.tink = this.ink; this.tpap = this.pap; this.sbrt = this.brt; }
  pend(nl) { if (nl) this.nl(); this.brt = this.sbrt; }
  gend() { this.brt = this.sbrt; }
  nl() { this.c = 0; this.r++; }
  scroll() {
    while (this.r >= 22) {
      this.r--; this.sr++;
      const row = (this.sr - 1) * 32;
      for (let k = 0; k < 32; k++) this.cells.delete(row + k);
    }
    this.textDirty = true;
  }
  pch(code) {
    if (code === 13) { this.nl(); return; }
    if (this.c >= 32) this.nl();
    if (this.r >= 22) this.scroll();
    this.cells.set((this.r + this.sr) * 32 + this.c, { code, ink: this.ci(this.tink), pap: this.ci(this.tpap) });
    this.c++;
    this.textDirty = true;
  }
  pstr(s) {
    s = String(s);
    const n = s.length;
    for (let i = 0; i < n; i++) {
      const code = s.charCodeAt(i);
      if (this.wrap && code !== 32) { // a word that would cross the right edge starts a new line
        let e = s.indexOf(' ', i); if (e < 0) e = n;
        if (this.c + (e - i) > 32 && this.c > 0 && e - i <= 32) this.nl();
      }
      if (this.wrap && code === 32 && this.c >= 32) continue; // a space at the margin is dropped
      this.pch(code);
    }
  }
  at(r, c) { this.r = Math.max(0, Math.min(23, Math.floor(r))); this.c = Math.floor(c); }
  tab(n) { n = ((Math.floor(n) % 32) + 32) % 32; if (n < this.c) this.nl(); while (this.c < n) this.pch(32); }
  comma() { this.pch(32); while (this.c % 16 !== 0) this.pch(32); }
  ns(n) { // SPEC 10.4
    const a = Math.abs(n);
    if (a >= 1e9 || a === 0 || !Number.isFinite(n)) return String(n === 0 ? 0 : n);
    const k = Math.pow(10, 8 - Math.floor(Math.log10(a) + 1e-7));
    return String(Math.round(n * k) / k);
  }
  setLo(s) { this.lo = s.slice(0, 64); this.loInk = this.ci(this.ink); this.loPap = this.ci(this.pap); this.loDirty = true; }
  report(msg) { this.setLo(msg); this.done = true; }
  fail(msg) { this.report(msg); throw this.STOP; }
  loader(name) { this.done = true; this.host.loader?.(name); }

  // ---- graphics statements (SPEC 11): Spectrum coordinates into the drawing layer ----
  Y(y) { return 175 - y + 8 * this.sr; }
  fillRect(col, x, y, w, h) {
    const f = this.fx;
    f.lineStyle(); f.beginFill(col, 100);
    f.moveTo(x, y); f.lineTo(x + w, y); f.lineTo(x + w, y + h); f.lineTo(x, y + h); f.lineTo(x, y);
    f.endFill();
  }
  plot(x, y) { this.px = x; this.py = y; this.fillRect(this.ci(this.tink), x, this.Y(y), 1, 1); }
  draw(dx, dy) {
    const nx = this.px + dx, ny = this.py + dy, f = this.fx;
    f.lineStyle(1, this.ci(this.tink), 100);
    f.moveTo(this.px + 0.5, this.Y(this.py) + 0.5); f.lineTo(nx + 0.5, this.Y(ny) + 0.5);
    this.px = nx; this.py = ny;
  }
  circle(x, y, r) {
    const n = Math.max(12, Math.round(r * 2)), f = this.fx;
    f.lineStyle(1, this.ci(this.tink), 100);
    f.moveTo(x + r + 0.5, this.Y(y) + 0.5);
    for (let i = 0; i <= n; i++) { const a = i * 2 * Math.PI / n; f.lineTo(x + r * Math.cos(a) + 0.5, this.Y(y + r * Math.sin(a)) + 0.5); }
    this.px = x; this.py = y;
  }
  rect(x, y, w, h) { this.fillRect(this.ci(this.tink), x, this.Y(y + h - 1), w, h); }
  fxp(name, v) {
    const p = this.fx.props;
    if (name === '_x') p.x = v; else if (name === '_y') p.y = v; else if (name === '_xscale') p.xs = v;
    else if (name === '_yscale') p.ys = v; else if (name === '_rotation') p.rot = v; else if (name === '_alpha') p.al = v;
  }

  // ---- sprites (SPEC 13) ----
  spr(name, x, y, xs, ys, rot, al) { if (this.images[name]) this.sprites.push({ name, x, y: y + 8 * this.sr, xs, ys, rot, al }); }
  sprclr() { this.sprites = []; }

  // ---- arrays, data, strings ----
  dim(ds, fill) {
    const make = (k) => {
      const n = Math.floor(ds[k]), a = new Array(Math.max(0, n + 1));
      for (let j = 0; j <= n; j++) a[j] = k < ds.length - 1 ? make(k + 1) : fill;
      return a;
    };
    return make(0);
  }
  read(where) {
    const d = this.compiled.data;
    if (this.dp >= d.length) this.fail('E Out of DATA, ' + where);
    return d[this.dp++];
  }
  restore(n) {
    if (n < 0) { this.dp = 0; return; }
    const hit = this.compiled.dataLines.find(([ln]) => ln >= n);
    this.dp = hit ? hit[1] : this.compiled.data.length;
  }
  slice(s, from, to) {
    if (typeof s !== 'string') s = ''; // a name that holds an array now (one namespace, SPEC 4)
    from = Math.max(1, Math.floor(from)); to = Math.min(s.length, Math.floor(to));
    return to < from ? '' : s.substring(from - 1, to);
  }
  val(s) { s = s.trim(); return s === '' ? 0 : Number(s); }
  peek(a) { return a === 23672 ? this.t % 256 : a === 23673 ? Math.floor(this.t / 256) % 256 : 0; }

  // ---- time and sound (SPEC 9, 14) ----
  pause(n) { if (n <= 0) { this.mode = 2; this.wait = 0; } else this.wait = n; }
  beep(d, p) { this.host.beep?.(d, Math.max(-24, Math.min(36, Math.round(p)))); this.wait = Math.round(d * FPS); }
  tone(p, s) { this.host.tone?.(Math.max(-12, Math.min(24, Math.round(p)))); if (s !== undefined) this.wait = Math.round(s * FPS); }

  // ---- persistence (SPEC 16) ----
  keep(name, v) { this.host.store?.set(name, v); }
  kept(name) { const v = this.host.store?.get(name); return typeof v === 'number' ? v : 0; }

  // ---- input (SPEC 15) ----
  // ev: { id: key identity (letters' upper-case code, 32 space, 13 enter, 37-40 cursor keys, 8 backspace), ch: the character it gives }
  keyDown(ev) {
    this.held.add(ev.id);
    this.lastId = ev.id; this.lastCh = ev.ch;
    this.wait = 0;                                  // any key cuts a PAUSE short
    if (this.mode === 0) this.kbuf = ev.ch;
    else if (this.mode === 2) { this.kbuf = ev.ch; this.mode = 0; }
    else if (this.mode === 1) this.inputKey(ev);
  }
  keyUp(id) { this.held.delete(id); }
  inkey() {
    if (this.lastId !== null && this.held.has(this.lastId)) { this.kbuf = ''; return this.lastCh; }
    const b = this.kbuf; this.kbuf = ''; return b;
  }
  key(s) {
    let c = String(s).toUpperCase().charCodeAt(0);
    if (c === 8) c = 37; else if (c === 9) c = 39; else if (c === 10) c = 40; else if (c === 11) c = 38;
    return this.held.has(c) ? 1 : 0;
  }
  input(prompt, isStr, set) {
    this.mode = 1; this.ibuf = ''; this.iprompt = prompt; this.istr = isStr; this.iset = set;
    this.setLo(prompt + String.fromCharCode(143));
  }
  inputKey(ev) {
    if (ev.id === 13) {
      let v = this.ibuf;
      if (!this.istr) { v = this.val(v); if (Number.isNaN(v)) v = 0; }
      this.iset(v);
      this.mode = 0; this.ibuf = ''; this.setLo('');
      return;
    }
    if (ev.id === 8) this.ibuf = this.ibuf.slice(0, -1);
    else if (ev.ch.length === 1 && ev.ch.charCodeAt(0) >= 32 && ev.ch.charCodeAt(0) < 127) this.ibuf += ev.ch;
    this.setLo(this.iprompt + this.ibuf + String.fromCharCode(143));
  }
  // pointer in screen pixels (x 0..256 left to right, y 0..192 top to bottom)
  mouseMove(x, y) { this.mx = x; this.my = y; }
  mouseDown(x, y) { this.mx = x; this.my = y; this.mbX = x; this.mbY = y; this.mbHeld = 1; this.mbPending = 1; }
  mouseUp() { this.mbHeld = 0; }
  mousex() { return Math.floor(this.mbTap ? this.mbX : this.mx); }
  mousey() { return 175 - Math.floor(this.mbTap ? this.mbY : this.my); }

  // ---- the text layers as pixels, for the renderers: paper cells, ink, and the lower screen ----
  rasterText(paper, ink) { // two 256x192 RGBA buffers
    paper.fill(0); ink.fill(0);
    for (let row = 0; row < 24; row++) {
      for (let col = 0; col < 32; col++) {
        const cell = this.cells.get((row + this.sr) * 32 + col);
        if (cell) putCell(paper, ink, row, col, cell.code, cell.ink, cell.pap);
      }
    }
    this.textDirty = false;
  }
  rasterLo(buf) { // 256x192 RGBA, only rows 22 and 23 are used
    buf.fill(0);
    for (let i = 0; i < this.lo.length; i++) putCell(buf, buf, 22 + Math.floor(i / 32), i % 32, this.lo.charCodeAt(i), this.loInk, this.loPap);
    this.loDirty = false;
  }
}

function putCell(paper, ink, row, col, code, inkRgb, papRgb) {
  const g = GLYPHS[code & 255] || GLYPHS[63];
  for (let y = 0; y < 8; y++) {
    const bits = g[y];
    let o = ((row * 8 + y) * 256 + col * 8) * 4;
    for (let x = 0; x < 8; x++, o += 4) {
      const on = (bits >> (7 - x)) & 1;
      const rgb = on ? inkRgb : papRgb, buf = on ? ink : paper;
      if (paper !== ink && on) { paper[o] = (papRgb >> 16) & 255; paper[o + 1] = (papRgb >> 8) & 255; paper[o + 2] = papRgb & 255; paper[o + 3] = 255; }
      buf[o] = (rgb >> 16) & 255; buf[o + 1] = (rgb >> 8) & 255; buf[o + 2] = rgb & 255; buf[o + 3] = 255;
    }
  }
}

function spriteImage(rows) {
  const w = Math.max(1, ...rows.map(r => r.length)), h = Math.max(1, rows.length);
  const data = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = SPRITE_COLOURS[row[x]];
      if (c === undefined) continue;
      const o = (y * w + x) * 4;
      data[o] = (c >> 16) & 255; data[o + 1] = (c >> 8) & 255; data[o + 2] = c & 255; data[o + 3] = 255;
    }
  });
  return { w, h, data, emoji: false };
}
