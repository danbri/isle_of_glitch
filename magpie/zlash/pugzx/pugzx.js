// PUGZX: BASIC in the browser, compiled to JavaScript and drawn with WebGPU (Canvas 2D where
// WebGPU is missing). The language is specified in ../SPEC.md. This module is the whole public
// face: import it once and use the elements.
//
//   <pugzx-player example="four-hallows" play controls></pugzx-player>
//   <pugzx-player id="p"><script type="text/x-pugzx">10 PRINT "HELLO": GO TO 10</script></pugzx-player>
//   <pugzx-examples for="p"></pugzx-examples> <pugzx-editor for="p"></pugzx-editor> <pugzx-keys for="p"></pugzx-keys>
//
// Every player on a page shares one clock, one GPU device and one store of kept numbers, so
// KEEP in one program is KEPT in another at once (and in other tabs and frames, through a
// BroadcastChannel). That is how programs talk to each other.
import { Machine, FPS } from './machine.js?v=mvnun35f';
import { CompileError, compile } from './compile.js?v=mvnun35f';
import { WebGPURenderer } from './render-webgpu.js?v=mvnun35f';
import { CanvasRenderer } from './render-canvas.js?v=mvnun35f';
import { EXAMPLES } from './examples.js?v=mvnun35f';

export { Machine, CompileError, compile, EXAMPLES, FPS };
export const exampleId = (ex) => ex.id || ex.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const findExample = (id) => EXAMPLES.find(ex => exampleId(ex) === String(id).toLowerCase());

// ---- sound (SPEC 14) ----
let audio = null;
export function audioContext() {
  if (!audio) { try { audio = new AudioContext(); } catch (_) { return null; } }
  if (audio.state === 'suspended') audio.resume();
  return audio;
}
const freq = (p) => 261.63 * Math.pow(2, p / 12);
function beep(d, p) {
  const a = audioContext(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'square'; o.frequency.value = freq(p); g.gain.value = 0.06;
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + Math.max(0.01, d));
}
function tone(p) {
  const a = audioContext(); if (!a) return;
  const t = a.currentTime, g = a.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.0025); g.gain.exponentialRampToValueAtTime(0.002, t + 0.22);
  g.connect(a.destination);
  for (const [mul, amp] of [[1, 0.8], [2, 0.2]]) {
    const o = a.createOscillator(), og = a.createGain();
    o.type = 'sine'; o.frequency.value = freq(p) * mul; og.gain.value = amp;
    o.connect(og).connect(g); o.start(t); o.stop(t + 0.23);
  }
}

// ---- emoji, from the browser's colour emoji font; text without emoji becomes cartoon lettering (SPEC 13) ----
const emojiCache = new Map();
export function emoji(text, size) {
  const key = text + '@' + size;
  if (emojiCache.has(key)) return emojiCache.get(key);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (/\p{Extended_Pictographic}/u.test(text)) {
    g.font = `${Math.round(size * 0.82)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.fillText(text, size / 2, size / 2 + size * 0.04);
  } else {
    const face = (px) => `900 ${px}px "Arial Rounded MT Bold", "Trebuchet MS", "Arial Black", sans-serif`;
    let px = size * 0.7; g.font = face(px);
    const w = g.measureText(text).width;
    if (w > size * 0.86) { px *= size * 0.86 / w; g.font = face(px); }
    const fill = g.createLinearGradient(0, size / 2 - px / 2, 0, size / 2 + px / 2);
    fill.addColorStop(0, '#fff7b0'); fill.addColorStop(0.5, '#ffd23a'); fill.addColorStop(1, '#ff7a1a');
    g.lineJoin = 'round'; g.lineWidth = Math.max(2, px * 0.2); g.strokeStyle = '#2a1052';
    g.strokeText(text, size / 2, size / 2); g.fillStyle = fill; g.fillText(text, size / 2, size / 2);
  }
  const img = { w: size, h: size, data: g.getImageData(0, 0, size, size).data };
  emojiCache.set(key, img);
  return img;
}

// ---- kept numbers (SPEC 16), shared by every player on the page, in other tabs and frames too ----
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pugzx') : null;
const keptLive = new Map();
export const kept = {
  get(k) {
    if (keptLive.has(k)) return keptLive.get(k);
    try { const v = localStorage.getItem('pugzx.kept.' + k); return v === null ? undefined : Number(v); } catch (_) { return undefined; }
  },
  set(k, v, quiet = false) {
    keptLive.set(k, v);
    try { localStorage.setItem('pugzx.kept.' + k, String(v)); } catch (_) { }
    if (!quiet) channel?.postMessage({ kept: k, value: v });
    document.dispatchEvent(new CustomEvent('pugzx-keep', { detail: { name: k, value: v } }));
  },
};
channel?.addEventListener('message', (e) => { if (e.data && 'kept' in e.data) kept.set(e.data.kept, e.data.value, true); });

// ---- keys (SPEC 15.1): the identity KEY tests, and the character INKEY$ and INPUT see ----
const SPECIAL = { ArrowLeft: [37, '\x08'], ArrowRight: [39, '\x09'], ArrowDown: [40, '\x0a'], ArrowUp: [38, '\x0b'], Enter: [13, '\r'], Backspace: [8, '\x08'], ' ': [32, ' '] };
export function keyFromEvent(e) {
  if (SPECIAL[e.key]) return { id: SPECIAL[e.key][0], ch: SPECIAL[e.key][1] };
  if (e.key.length === 1) return { id: e.key.toUpperCase().charCodeAt(0), ch: e.key };
  return null;
}
export function keyFromName(name) { // for touch keys: left right up down space enter, or one character
  const named = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', space: ' ', enter: 'Enter' }[name.toLowerCase()];
  return keyFromEvent({ key: named || name });
}

// ---- one clock for every player: machine frames at 50 Hz, drawing at the display's rate ----
const players = new Set();
let ticking = false;
function tick(now) {
  for (const p of players) p._tick(now);
  if (players.size) requestAnimationFrame(tick); else ticking = false;
}
function addPlayer(p) { players.add(p); if (!ticking) { ticking = true; requestAnimationFrame(tick); } }

const PLAYER_CSS = `
:host { display: block; position: relative; background: #000; aspect-ratio: 4 / 3; overflow: hidden; contain: content; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; outline: none; touch-action: none; }
.start { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; background: rgba(0,0,0,.35); cursor: pointer; z-index: 2; }
:host([play]:not([started])) .start { display: flex; }
.start span { font: 600 18px system-ui, sans-serif; color: #fff; background: rgba(0,0,0,.6); border: 1px solid rgba(255,255,255,.35); border-radius: 999px; padding: 12px 22px; }
.full { display: none; position: absolute; top: 10px; right: 10px; z-index: 3; width: 36px; height: 36px; font-size: 20px; line-height: 1; color: #fff; background: rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.25); border-radius: 6px; cursor: pointer; opacity: .35; transition: opacity .2s; }
:host([controls]) .full { display: block; }
.full:hover, .full:focus-visible { opacity: 1; }
`;

export class PugzxPlayer extends HTMLElement {
  static observedAttributes = ['example', 'src'];
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
    root.innerHTML = `<style>${PLAYER_CSS}</style><canvas part="screen" tabindex="0"></canvas>` +
      `<div class="start" part="start" role="button" aria-label="click to play"><span>&#9654;&#xFE0E; click to play</span></div>` +
      `<button class="full" part="full" title="full screen" aria-label="full screen">&#x26F6;&#xFE0E;</button>`;
    this.canvas = root.querySelector('canvas');
    this.machine = null; this.renderer = null; this.source = ''; this.name = '';
    this._acc = 0; this._last = 0; this._reported = false; this._ready = null; this._held = new Map();
    this.stats = { fps: 0, runs: 0, basicMs: 0, drawMs: 0 };
    this._count = { frames: 0, runs: 0, basicMs: 0, drawMs: 0, at: 0 };
  }

  connectedCallback() {
    if (this._ready) { addPlayer(this); return; }
    this._ready = this._init();
  }
  disconnectedCallback() { players.delete(this); }
  attributeChangedCallback(name, old, val) {
    if (!this._ready || old === val || val === null) return;
    if (name === 'example') this.ready().then(() => this.loadExample(val));
    if (name === 'src') this.ready().then(() => this.loadUrl(val));
  }
  ready() { return this._ready || (this._ready = this._init()); }

  async _init() {
    let r = null, tried = false;
    if (this.getAttribute('renderer') !== 'canvas' && !/[?&]renderer=canvas\b/.test(location.search)) {
      tried = true;
      const w = new WebGPURenderer(this.canvas);
      try { if (await w.init()) r = w; } catch (e) { console.warn('PUGZX: WebGPU unavailable', e); }
    }
    if (!r) { // a canvas that has a webgpu context cannot give a 2d one
      if (tried) { const c = this.canvas.cloneNode(); this.canvas.replaceWith(c); this.canvas = c; }
      r = new CanvasRenderer(this.canvas); await r.init();
    }
    this.renderer = r;
    this._wire();
    addPlayer(this);
    const inline = this.querySelector('script[type="text/x-pugzx"], script[type="text/x-zxbasic"]');
    if (inline) this.load(dedent(inline.textContent), this.getAttribute('name') || '');
    else if (this.hasAttribute('src')) await this.loadUrl(this.getAttribute('src'));
    else if (this.hasAttribute('example')) this.loadExample(this.getAttribute('example'));
  }

  // ---- programs ----
  load(source, name = '') {
    const t0 = performance.now();
    let m;
    try {
      m = new Machine(source, { beep, tone, emoji, store: kept, loader: (n) => this._loader(n) });
    } catch (error) {
      this.dispatchEvent(new CustomEvent('pugzx-error', { detail: { error, source, name }, bubbles: true, composed: true }));
      throw error;
    }
    this.machine = m; this.source = source; this.name = name; this._reported = false; this._acc = 0;
    for (const id of this._held.values()) m.keyUp(id);
    this._held.clear();
    const info = { name, source, lines: m.compiled.lines, bytes: m.compiled.js.length, ms: performance.now() - t0 };
    this.dispatchEvent(new CustomEvent('pugzx-run', { detail: info, bubbles: true, composed: true }));
    return info;
  }
  loadExample(id) {
    const ex = findExample(id);
    if (!ex) throw new Error(`PUGZX: no example called "${id}"`);
    return this.load(ex.src, exampleId(ex));
  }
  async loadUrl(url) { const res = await fetch(url); return this.load(await res.text(), url); }
  stop() { if (this.machine) this.machine.done = true; }
  restart() { if (this.source) this.load(this.source, this.name); }
  // a key from outside (touch keys, scripts): id as KEY sees it, ch as INKEY$ sees it
  press(key, down) {
    if (!this.machine || !key) return;
    audioContext();
    if (down) this.machine.keyDown(key); else this.machine.keyUp(key.id);
  }
  _loader(name) {
    const target = name || 'loader';
    const ev = new CustomEvent('pugzx-loader', { detail: { name: target }, bubbles: true, composed: true, cancelable: true });
    setTimeout(() => { if (this.dispatchEvent(ev) && findExample(target)) this.loadExample(target); }, 0);
  }

  // ---- input ----
  _wire() {
    const cv = this.canvas;
    cv.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keyFromEvent(e); if (!k || !this.machine) return;
      e.preventDefault(); audioContext();
      if (e.repeat && this.machine.mode !== 1) return;
      this._held.set(e.code, k.id);
      this.machine.keyDown(k);
    });
    cv.addEventListener('keyup', (e) => {
      const id = this._held.get(e.code) ?? keyFromEvent(e)?.id;
      this._held.delete(e.code);
      if (id !== undefined) this.machine?.keyUp(id);
    });
    cv.addEventListener('blur', () => { for (const id of this._held.values()) this.machine?.keyUp(id); this._held.clear(); });
    const point = (e) => {
      const r = cv.getBoundingClientRect();
      const s = Math.min(r.width / 320, r.height / 240), ox = (r.width - 320 * s) / 2, oy = (r.height - 240 * s) / 2;
      return [(e.clientX - r.left - ox) / s - 32, (e.clientY - r.top - oy) / s - 24];
    };
    cv.addEventListener('pointermove', (e) => this.machine?.mouseMove(...point(e)));
    cv.addEventListener('pointerdown', (e) => { audioContext(); cv.focus(); cv.setPointerCapture?.(e.pointerId); this.machine?.mouseDown(...point(e)); });
    cv.addEventListener('pointerup', () => this.machine?.mouseUp());
    cv.addEventListener('pointercancel', () => this.machine?.mouseUp());
    this.shadowRoot.querySelector('.start').addEventListener('click', () => { this.setAttribute('started', ''); audioContext(); cv.focus(); });
    this.shadowRoot.querySelector('.full').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen?.(); else this.requestFullscreen?.().catch(() => {});
      cv.focus();
    });
  }

  // ---- the clock ----
  _tick(now) {
    if (!this.renderer) return;
    const m = this.machine, c = this._count;
    if (!this._last) this._last = now;
    this._acc += Math.min(100, now - this._last); this._last = now;
    const step = 1000 / FPS;
    let n = 0;
    while (m && this._acc >= step && n < 3) {
      this._acc -= step; n++;
      const t0 = performance.now(), r = m.frame(t0);
      c.basicMs += performance.now() - t0;
      if (r >= 0) c.runs++;
      if (r === 2) { this._acc = Math.min(this._acc, step); break; } // a long run used its slice: don't pile frames up
    }
    if (m && m.done && !this._reported) {
      this._reported = true;
      this.dispatchEvent(new CustomEvent('pugzx-report', { detail: { message: m.lo.trim() }, bubbles: true, composed: true }));
    }
    const cv = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (m && cv.clientWidth > 0) {
      const t1 = performance.now();
      this.renderer.render(m);
      c.drawMs += performance.now() - t1;
    }
    c.frames++;
    if (now - c.at >= 1000) {
      this.stats = { fps: c.frames, runs: c.runs, basicMs: c.basicMs, drawMs: c.drawMs, renderer: this.renderer.name };
      c.frames = 0; c.runs = 0; c.basicMs = 0; c.drawMs = 0; c.at = now;
      this.dispatchEvent(new CustomEvent('pugzx-stats', { detail: this.stats }));
    }
  }
}

function dedent(text) {
  const lines = text.replace(/^\n+|\s+$/g, '').split('\n');
  const pad = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
  return lines.map(l => l.slice(pad)).join('\n');
}
const target = (el) => {
  const id = el.getAttribute('for');
  return id ? document.getElementById(id) : el.closest('pugzx-player') || document.querySelector('pugzx-player');
};

// ---- touch keys and the INPUT box, from the program's REM touch: line (SPEC 17) ----
// A quick tap still holds the key for 120 ms, so a program that looks once a frame doesn't miss it.
export class PugzxKeys extends HTMLElement {
  connectedCallback() {
    if (this._on) return;
    this._on = (e) => { if (e.target === this.player) this.build(e.detail.source); };
    document.addEventListener('pugzx-run', this._on);
    queueMicrotask(() => { this.player = target(this); if (this.player?.source) this.build(this.player.source); });
  }
  disconnectedCallback() { document.removeEventListener('pugzx-run', this._on); this._on = null; }
  get touch() { return this.hasAttribute('always') || matchMedia('(pointer: coarse)').matches || /[?&]touch\b/.test(location.search); }
  build(src) {
    this.player = target(this);
    this.textContent = '';
    const m = src.match(/^\s*\d*\s*REM\s+touch:(.*)$/im);
    const tokens = m ? m[1].trim().split(/\s+/).filter(Boolean) : ['left', 'up', 'down', 'right', 'space', 'enter'];
    const row = document.createElement('div'); row.className = 'pugzx-keys';
    for (const t of tokens) {
      const [name, label] = t.split('=');
      const b = document.createElement('button'); b.type = 'button';
      if (name.startsWith('>')) {
        const words = name.slice(1).replace(/_/g, ' ');
        b.className = 'cmd'; b.textContent = label || words.toUpperCase();
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.type(words); });
      } else {
        const k = keyFromName(name), named = { left: '◀', right: '▶', up: '▲', down: '▼', space: 'SPACE', enter: 'ENTER' }[name.toLowerCase()];
        b.textContent = label || named || name.toUpperCase();
        let downAt = 0;
        const release = () => {
          if (!b.classList.contains('down')) return;
          b.classList.remove('down');
          setTimeout(() => this.player?.press(k, false), Math.max(0, 120 - (performance.now() - downAt)));
        };
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('down'); downAt = performance.now(); this.player?.press(k, true); });
        b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('lostpointercapture', release);
      }
      row.append(b);
    }
    this.append(row);
    const usesInput = /\bINPUT\b/i.test(src.replace(/^\s*\d*\s*REM.*$/gim, '').replace(/"[^"\n]*"/g, ''));
    if (usesInput) {
      const f = document.createElement('form'); f.className = 'pugzx-type';
      f.innerHTML = '<input autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="type a command"><button type="submit" aria-label="enter">&#8629;</button>';
      f.querySelector('button').addEventListener('pointerdown', (e) => e.preventDefault()); // keep the phone's keyboard open
      f.addEventListener('submit', (e) => { e.preventDefault(); const i = f.querySelector('input'); const t = i.value; i.value = ''; this.type(t); });
      this.append(f);
    }
    this.toggleAttribute('has', this.touch && (tokens.length > 0 || usesInput));
    this.dispatchEvent(new CustomEvent('pugzx-keys', { bubbles: true }));
  }
  async type(text) { // one key at a time, so the program sees every one, then Enter
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    for (const ch of text) { const k = keyFromEvent({ key: ch }); this.player?.press(k, true); await pause(30); this.player?.press(k, false); await pause(30); }
    const enter = keyFromEvent({ key: 'Enter' });
    this.player?.press(enter, true); await pause(30); this.player?.press(enter, false);
  }
}

// ---- a picker of the built-in programs ----
export class PugzxExamples extends HTMLElement {
  connectedCallback() {
    if (this.firstChild) return;
    const sel = document.createElement('select');
    sel.innerHTML = EXAMPLES.map(ex => `<option value="${exampleId(ex)}">${ex.name.replace(/</g, '&lt;')}</option>`).join('');
    sel.addEventListener('change', () => { const p = target(this); p?.ready().then(() => p.loadExample(sel.value)); });
    document.addEventListener('pugzx-run', (e) => { if (e.target === target(this) && findExample(e.detail.name)) sel.value = e.detail.name; });
    this.append(sel);
  }
}

// ---- a listing that runs its player as you type ----
export class PugzxEditor extends HTMLElement {
  connectedCallback() {
    if (this.firstChild) return;
    this.innerHTML = '<textarea spellcheck="false" autocapitalize="none" autocomplete="off"></textarea><div class="pugzx-status"></div>';
    const ta = this.querySelector('textarea'), st = this.querySelector('.pugzx-status');
    let timer = null, mine = false;
    document.addEventListener('pugzx-run', (e) => {
      if (e.target !== target(this)) return;
      st.textContent = `0 OK · ${e.detail.lines} lines · ${e.detail.ms.toFixed(1)} ms`; st.className = 'pugzx-status ok';
      if (!mine) ta.value = e.detail.source;
      mine = false;
    });
    ta.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const p = target(this); if (!p) return;
        mine = true;
        try { p.load(ta.value, p.name); }
        catch (e) { mine = false; st.className = 'pugzx-status err'; st.textContent = e instanceof CompileError ? `C ${e.message}, line ${e.line}:${e.col}` : String(e); }
      }, 500);
    });
  }
}

customElements.define('pugzx-player', PugzxPlayer);
customElements.define('pugzx-keys', PugzxKeys);
customElements.define('pugzx-examples', PugzxExamples);
customElements.define('pugzx-editor', PugzxEditor);
