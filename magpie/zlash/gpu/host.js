// ZX GPU: the page. Runs a program from the examples (by #id) on the 50 Hz machine clock and
// draws it with WebGPU, or Canvas 2D where WebGPU is missing (or with ?renderer=canvas).
// ?play shows only the program, for embedding.
import { EXAMPLES } from '../js/examples.js';
import { Machine, FPS } from './machine.js';
import { CompileError } from './compile.js';
import { WebGPURenderer } from './render-webgpu.js';
import { CanvasRenderer } from './render-canvas.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const PLAY = params.has('play');
if (PLAY) document.body.classList.add('play');
const slug = (ex) => ex.id || ex.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const canvas = $('#screen');

// ---- sound: square-wave BEEPs and soft TONE chimes (SPEC 14) ----
let audio = null;
const ac = () => { if (!audio) { try { audio = new AudioContext(); } catch (_) { return null; } } if (audio.state === 'suspended') audio.resume(); return audio; };
const freq = (p) => 261.63 * Math.pow(2, p / 12);
function beep(d, p) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'square'; o.frequency.value = freq(p); g.gain.value = 0.06;
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + Math.max(0.01, d));
}
function tone(p) {
  const a = ac(); if (!a) return;
  const t = a.currentTime, g = a.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.0025); g.gain.exponentialRampToValueAtTime(0.002, t + 0.22);
  g.connect(a.destination);
  for (const [mul, amp] of [[1, 0.8], [2, 0.2]]) {
    const o = a.createOscillator(), og = a.createGain();
    o.type = 'sine'; o.frequency.value = freq(p) * mul; og.gain.value = amp;
    o.connect(og).connect(g); o.start(t); o.stop(t + 0.23);
  }
}

// ---- emoji, rasterised by the browser's colour emoji font (SPEC 13) ----
function emoji(text, size) {
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
  return { w: size, h: size, data: g.getImageData(0, 0, size, size).data };
}

// ---- kept numbers (SPEC 16) ----
const store = {
  get(k) { try { const v = localStorage.getItem('zxgpu.kept.' + k); return v === null ? undefined : Number(v); } catch (_) { return undefined; } },
  set(k, v) { try { localStorage.setItem('zxgpu.kept.' + k, String(v)); } catch (_) { } },
};

// ---- the renderer ----
let renderer = null;
async function pickRenderer() {
  if (params.get('renderer') !== 'canvas') {
    const r = new WebGPURenderer(canvas);
    try { if (await r.init()) return r; } catch (e) { console.warn('WebGPU unavailable:', e); }
  }
  // a canvas that has been given a webgpu context cannot give a 2d one, so swap in a fresh canvas
  const fresh = canvas.cloneNode(); canvas.replaceWith(fresh);
  const r = new CanvasRenderer(fresh); await r.init(); return r;
}

// ---- running a program ----
let machine = null, home = '';
function load(ex) {
  home = slug(ex);
  if ($('#examples')) $('#examples').value = home;
  try { machine = new Machine(ex.src, { beep, tone, emoji, store, loader }); $('#status').textContent = ''; }
  catch (e) {
    machine = null;
    $('#status').textContent = e instanceof CompileError ? `C ${e.message}, line ${e.line}:${e.col}` : String(e);
    console.error(e);
  }
  setupPad(ex.src);
}
function loader(name) {
  const target = name || 'loader';
  if (PLAY && target === 'loader') return; // an embedded program stays put
  setTimeout(() => { location.hash = target; }, 0);
}
function fromHash() {
  const id = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  return EXAMPLES.find(ex => slug(ex) === id) || EXAMPLES[0];
}
window.addEventListener('hashchange', () => load(fromHash()));

// ---- keys (SPEC 15.1): the key's identity for KEY, and the character it gives for INKEY$ and INPUT ----
const SPECIAL = { ArrowLeft: [37, '\x08'], ArrowRight: [39, '\x09'], ArrowDown: [40, '\x0a'], ArrowUp: [38, '\x0b'], Enter: [13, '\r'], Backspace: [8, '\x08'], ' ': [32, ' '] };
function keyEvent(e) {
  if (SPECIAL[e.key]) return { id: SPECIAL[e.key][0], ch: SPECIAL[e.key][1] };
  if (e.key.length === 1) return { id: e.key.toUpperCase().charCodeAt(0), ch: e.key };
  return null;
}
const heldIds = new Map(); // physical key -> id, so a key released after Shift changes still lets go
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = keyEvent(e); if (!k || !machine) return;
  ac();
  e.preventDefault();
  if (e.repeat && machine.mode !== 1) return;
  heldIds.set(e.code, k.id);
  machine.keyDown(k);
});
window.addEventListener('keyup', (e) => {
  const id = heldIds.get(e.code) ?? keyEvent(e)?.id;
  heldIds.delete(e.code);
  if (id !== undefined && machine) machine.keyUp(id);
});
window.addEventListener('blur', () => { if (machine) for (const id of heldIds.values()) machine.keyUp(id); heldIds.clear(); });

// ---- pointer (SPEC 15.5): screen pixels, y down ----
function screenPoint(e) {
  const r = (renderer?.canvas || canvas).getBoundingClientRect();
  const s = Math.min(r.width / 320, r.height / 240), ox = (r.width - 320 * s) / 2, oy = (r.height - 240 * s) / 2;
  return [(e.clientX - r.left - ox) / s - 32, (e.clientY - r.top - oy) / s - 24];
}
function wirePointer(el) {
  el.addEventListener('pointermove', (e) => machine?.mouseMove(...screenPoint(e)));
  el.addEventListener('pointerdown', (e) => { ac(); el.setPointerCapture?.(e.pointerId); machine?.mouseDown(...screenPoint(e)); });
  el.addEventListener('pointerup', () => machine?.mouseUp());
  el.addEventListener('pointercancel', () => machine?.mouseUp());
}

// ---- touch keys from REM touch: (SPEC 17) ----
const NAMED = { left: [37, '\x08', '◀'], right: [39, '\x09', '▶'], up: [38, '\x0b', '▲'], down: [40, '\x0a', '▼'], space: [32, ' ', 'SPACE'], enter: [13, '\r', 'ENTER'] };
function setupPad(src) {
  const pad = $('#pad'); if (!pad) return;
  pad.textContent = '';
  if (!matchMedia('(pointer: coarse)').matches && !params.has('touch')) return;
  const m = src.match(/^\s*\d*\s*REM\s+touch:(.*)$/im);
  const tokens = m ? m[1].trim().split(/\s+/).filter(Boolean) : ['left', 'up', 'down', 'right', 'space', 'enter'];
  for (const t of tokens) {
    const [name, label] = t.split('=');
    const b = document.createElement('button'); b.type = 'button';
    if (name.startsWith('>')) {
      const words = name.slice(1).replace(/_/g, ' ');
      b.textContent = label || words.toUpperCase();
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); ac();
        for (const ch of words) { machine?.keyDown({ id: ch.toUpperCase().charCodeAt(0), ch }); machine?.keyUp(ch.toUpperCase().charCodeAt(0)); }
        machine?.keyDown({ id: 13, ch: '\r' }); machine?.keyUp(13);
      });
    } else {
      const k = NAMED[name.toLowerCase()] || [name.toUpperCase().charCodeAt(0), name, name.toUpperCase()];
      b.textContent = label || k[2];
      let downAt = 0;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); ac(); downAt = performance.now(); machine?.keyDown({ id: k[0], ch: k[1] }); });
      const up = () => setTimeout(() => machine?.keyUp(k[0]), Math.max(0, 120 - (performance.now() - downAt)));
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
    pad.append(b);
  }
}

// ---- the clock: machine frames at 50 Hz, drawing at the display's rate ----
let acc = 0, last = performance.now(), fpsCount = 0, fpsAt = last, runs = 0, basicMs = 0, drawMs = 0;
function tick(now) {
  acc += Math.min(100, now - last); last = now;
  const step = 1000 / FPS;
  let n = 0;
  while (acc >= step && n < 3) {
    acc -= step; n++;
    if (!machine) continue;
    const t0 = performance.now();
    const r = machine.frame(t0);
    basicMs += performance.now() - t0;
    if (r >= 0) runs++;
    if (r === 2) { acc = Math.min(acc, step); break; } // the program used its whole slice: don't pile frames up
  }
  const cv = renderer.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const t1 = performance.now();
  if (machine) renderer.render(machine);
  drawMs += performance.now() - t1;
  fpsCount++;
  if (now - fpsAt >= 1000) {
    // per second of wall time: how long BASIC ran, and how long building and submitting the frames took
    if ($('#fps')) $('#fps').textContent = `${renderer.name} · ${fpsCount} fps · ${runs} runs/s · BASIC ${basicMs.toFixed(0)} ms/s · draw ${drawMs.toFixed(0)} ms/s`;
    fpsCount = 0; runs = 0; basicMs = 0; drawMs = 0; fpsAt = now;
  }
  requestAnimationFrame(tick);
}

// ---- boot ----
(async () => {
  renderer = await pickRenderer();
  wirePointer(renderer.canvas);
  const sel = $('#examples');
  if (sel) {
    sel.innerHTML = EXAMPLES.map(ex => `<option value="${slug(ex)}">${ex.name.replace(/</g, '&lt;')}</option>`).join('');
    sel.addEventListener('change', () => { location.hash = sel.value; });
  }
  load(fromHash());
  $('#start')?.addEventListener('click', () => { document.body.classList.add('started'); ac(); renderer.canvas.focus?.(); });
  $('#full')?.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
  requestAnimationFrame(tick);
  window.zxgpu = { get machine() { return machine; }, renderer, load, EXAMPLES };
})();
