// The "ROM": an AVM1 runtime that gives a Flash movie a ZX Spectrum screen,
// plus the SWF assets (glyph sprites, colour cell, beep bank) it relies on.
import { zxFont } from '../pugzx/font.js?v=mvnv6n1c';
import * as S from './swf.js?v=mvnv6n1c';
import { v, m, call, cm, nw, op, not, set, setm, local, x, iff, whl, ret, fn, root, path } from './avm1.js?v=mvnv6n1c';

export const SCREEN = { W: 256, H: 192, BORDER_X: 32, BORDER_Y: 24, COLS: 32, ROWS: 22, FPS: 50 };
export const STAGE = { W: SCREEN.W + 2 * SCREEN.BORDER_X, H: SCREEN.H + 2 * SCREEN.BORDER_Y };

export const PALETTE = [
  0x000000, 0x0000D7, 0xD70000, 0xD700D7, 0x00D700, 0x00D7D7, 0xD7D700, 0xD7D7D7,
  0x000000, 0x0000FF, 0xFF0000, 0xFF00FF, 0x00FF00, 0x00FFFF, 0xFFFF00, 0xFFFFFF,
];

export const BEEP_MIN = -24, BEEP_MAX = 36, BEEP_RATE = 22050;
export const TONE_MIN = -12, TONE_MAX = 24, TONE_RATE = 11025, TONE_SECS = 0.22;

// a soft chime: sine with a quick attack and exponential decay, 8-bit unsigned samples
function toneSamples(pitch) {
  const f = 261.63 * Math.pow(2, pitch / 12);
  const n = Math.round(TONE_RATE * TONE_SECS);
  const s = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / TONE_RATE;
    const env = Math.min(1, t * 400) * Math.exp(-t * 14) * 0.45;
    const v = Math.sin(2 * Math.PI * f * t) * 0.8 + Math.sin(4 * Math.PI * f * t) * 0.2;
    s[i] = 128 + Math.round(v * env * 127);
  }
  return s;
}

// ---- glyphs ----
export function glyphBitmap(code) {
  const font = zxFont();
  const rows = new Uint8Array(8);
  if (code >= 32 && code < 128) rows.set(font.subarray((code - 32) * 8, (code - 32) * 8 + 8));
  else if (code >= 128 && code < 144) { // block graphics: bit0 top-right, bit1 top-left, bit2 bottom-right, bit3 bottom-left
    const b = code - 128;
    const top = (b & 2 ? 0xF0 : 0) | (b & 1 ? 0x0F : 0);
    const bot = (b & 8 ? 0xF0 : 0) | (b & 4 ? 0x0F : 0);
    for (let i = 0; i < 4; i++) rows[i] = top;
    for (let i = 4; i < 8; i++) rows[i] = bot;
  } else if (code >= 144 && code <= 164) { // UDGs default to A..U
    const c = 65 + (code - 144);
    rows.set(font.subarray((c - 32) * 8, (c - 32) * 8 + 8));
  }
  return rows;
}

function glyphRects(rows) {
  const rects = [];
  for (let y = 0; y < 8; y++) {
    let run = -1;
    for (let xx = 0; xx <= 8; xx++) {
      const on = xx < 8 && (rows[y] >> (7 - xx)) & 1;
      if (on && run < 0) run = xx;
      if (!on && run >= 0) { rects.push({ x: run, y, w: xx - run, h: 1 }); run = -1; }
    }
  }
  return rects;
}

// ---- beep bank: one short looped square wave per semitone ----
function beepSamples(pitch) {
  const f = 261.63 * Math.pow(2, pitch / 12);
  const cycles = Math.max(1, Math.round(f * 600 / BEEP_RATE));
  const n = Math.round(cycles * BEEP_RATE / f);
  const s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.sin(2 * Math.PI * cycles * i / n) >= 0 ? 7000 : -7000;
  return s;
}

export function buildAssets() {
  const tags = [], exports = [];
  let id = 1;
  for (let code = 32; code <= 164; code++) {
    const rects = glyphRects(glyphBitmap(code));
    const shapeId = id++, spriteId = id++;
    const ctl = [];
    if (rects.length) {
      tags.push(S.tagDefineShapeRects(shapeId, rects, 0xFFFFFF, { xmin: 0, ymin: 0, xmax: 8, ymax: 8 }));
      ctl.push(S.tagPlaceObject2({ depth: 1, id: shapeId }));
    }
    ctl.push(S.tagShowFrame(), S.tagEnd());
    tags.push(S.tagDefineSprite(spriteId, ctl));
    exports.push({ id: spriteId, name: 'g' + code });
  }
  { // solid 8x8 cell
    const shapeId = id++, spriteId = id++;
    tags.push(S.tagDefineShapeRects(shapeId, [{ x: 0, y: 0, w: 8, h: 8 }], 0xFFFFFF));
    tags.push(S.tagDefineSprite(spriteId, [S.tagPlaceObject2({ depth: 1, id: shapeId }), S.tagShowFrame(), S.tagEnd()]));
    exports.push({ id: spriteId, name: 'cell' });
  }
  const beepLengths = [];
  for (let p = BEEP_MIN; p <= BEEP_MAX; p++) {
    const smp = beepSamples(p);
    const sid = id++;
    tags.push(S.tagDefineSound(sid, smp, 2));
    exports.push({ id: sid, name: 'b' + p });
    beepLengths.push(smp.length);
  }
  for (let p = TONE_MIN; p <= TONE_MAX; p++) {
    const sid = id++;
    tags.push(S.tagDefineSound8(sid, toneSamples(p), 1));
    exports.push({ id: sid, name: 't' + p });
  }
  tags.push(S.tagExportAssets(exports));
  return { tags, beepLengths, nextId: id };
}

// ---- AVM1 runtime (IR) ----
const scr = () => v('scr');
const inner = () => m(scr(), 'inner');
const gfx = () => m(inner(), 'gfx');
const num = (n) => ['n', n];
const str = (s) => ['s', s];
const add = (a, b) => op('+', a, b);
const sub = (a, b) => op('-', a, b);
const mul = (a, b) => op('*', a, b);
const eq = (a, b) => op('==', a, b);
const lt = (a, b) => op('<', a, b);
const ge = (a, b) => op('>=', a, b);
const and = (a, b) => op('&&', a, b);
const math = (f, ...args) => cm(v('Math'), f, ...args);
const Y = (y) => add(sub(num(175), y), mul(num(8), v('__sr'))); // spectrum y (bottom-up) -> clip y
const initObj = (px, py) => ['obj', [['_x', px], ['_y', py]]];
const attach = (layer, name, inst, depth, px, py) => cm(layer, 'attachMovie', name, inst, depth, initObj(px, py));
const tint = (clip, colour) => x(cm(nw('Color', clip), 'setRGB', colour));

export function runtimeVars() {
  return {
    __r: 0, __c: 0, __sr: 0, __ink: 0, __pap: 7, __brt: 0, __bdr: 7, __tink: 0, __tpap: 7,
    __px: 0, __py: 0, __pc: 0, __wait: 0, __mode: 0, __budget: 0, __done: 0, __t: 0,
    __ibuf: '', __ivar: '', __istr: 0, __iprompt: '', __again: 0, __claimed: 1,
    __mb: 0, __mbHeld: 0, __mbPending: 0, __mbTap: 0, __mbX: 0, __mbY: 0,
  };
}

export function runtimeIR(beepLengths) {
  const out = [];
  for (const [k, val] of Object.entries(runtimeVars())) out.push(set(k, typeof val === 'string' ? str(val) : num(val)));
  out.push(set('__pal', ['arr', PALETTE.map(num)]));
  out.push(set('__bn', ['arr', beepLengths.map(num)]));
  out.push(set('__gs', ['arr', []]));

  // colour index -> rgb (indexes >= 16 are literal rgb)
  out.push(fn('__ci', ['_c'], [
    iff(ge(v('_c'), num(16)), [ret(v('_c'))]),
    iff(and(lt(v('_c'), num(8)), v('__brt')), [set('_c', add(v('_c'), num(8)))]),
    iff(op('<', v('_c'), num(0)), [set('_c', num(0))]),
    ret(m(v('__pal'), v('_c'))),
  ]));

  out.push(fn('__rect', ['_mc', '_col', '_x', '_y', '_w', '_h'], [
    x(cm(v('_mc'), 'lineStyle')),
    x(cm(v('_mc'), 'beginFill', v('_col'), num(100))),
    x(cm(v('_mc'), 'moveTo', v('_x'), v('_y'))),
    x(cm(v('_mc'), 'lineTo', add(v('_x'), v('_w')), v('_y'))),
    x(cm(v('_mc'), 'lineTo', add(v('_x'), v('_w')), add(v('_y'), v('_h')))),
    x(cm(v('_mc'), 'lineTo', v('_x'), add(v('_y'), v('_h')))),
    x(cm(v('_mc'), 'lineTo', v('_x'), v('_y'))),
    x(cm(v('_mc'), 'endFill')),
  ]));

  out.push(fn('__border', ['_n'], [
    set('__bdr', v('_n')),
    x(cm(v('bd'), 'clear')),
    x(call('__rect', v('bd'), call('__ci', v('_n')), num(0), num(0), num(STAGE.W), num(STAGE.H))),
  ]));

  out.push(fn('__cls', [], [
    iff(op('!=', inner(), ['undef']), [x(cm(inner(), 'removeMovieClip'))]),
    x(cm(scr(), 'createEmptyMovieClip', 'inner', num(2))),
    x(cm(inner(), 'createEmptyMovieClip', 'pap', num(1))),
    x(cm(inner(), 'createEmptyMovieClip', 'gfx', num(2))),
    x(cm(inner(), 'createEmptyMovieClip', 'txt', num(3))),
    x(cm(inner(), 'createEmptyMovieClip', 'spr', num(4))),
    x(cm(m(scr(), 'bg'), 'clear')),
    x(call('__rect', m(scr(), 'bg'), call('__ci', v('__pap')), num(0), num(0), num(SCREEN.W), num(SCREEN.H))),
    set('__r', num(0)), set('__c', num(0)), set('__sr', num(0)),
  ]));

  // place one character cell: paper square + tinted glyph
  out.push(fn('__cell', ['_pl', '_tl', '_r', '_c', '_code', '_ink', '_pap'], [
    local('d', add(mul(v('_r'), num(32)), v('_c'))),
    local('yy', mul(v('_r'), num(8))),
    local('xx', mul(v('_c'), num(8))),
    iff(op('||', lt(v('_code'), num(32)), op('>', v('_code'), num(164))), [set('_code', num(63))]),
    local('p', attach(v('_pl'), str('cell'), add(str('p'), v('d')), v('d'), v('xx'), v('yy'))),
    tint(v('p'), call('__ci', v('_pap'))),
    local('g', attach(v('_tl'), add(str('g'), v('_code')), add(str('c'), v('d')), v('d'), v('xx'), v('yy'))),
    tint(v('g'), call('__ci', v('_ink'))),
  ]));

  // newline only moves the cursor; the scroll happens lazily, when something is printed past the bottom
  out.push(fn('__nl', [], [
    set('__c', num(0)),
    set('__r', add(v('__r'), num(1))),
  ]));
  out.push(fn('__scrl', [], [
    whl(ge(v('__r'), num(SCREEN.ROWS)), [
      set('__r', sub(v('__r'), num(1))),
      set('__sr', add(v('__sr'), num(1))),
      setm(inner(), '_y', mul(num(-8), v('__sr'))),
      // drop the row that scrolled off the top
      local('i', mul(sub(v('__sr'), num(1)), num(32))),
      local('e', add(v('i'), num(32))),
      whl(lt(v('i'), v('e')), [
        x(cm(m(m(inner(), 'pap'), add(str('p'), v('i'))), 'removeMovieClip')),
        x(cm(m(m(inner(), 'txt'), add(str('c'), v('i'))), 'removeMovieClip')),
        set('i', add(v('i'), num(1))),
      ]),
    ]),
  ]));

  out.push(fn('__pch', ['_code'], [
    iff(eq(v('_code'), num(13)), [x(call('__nl')), ret()]),
    iff(ge(v('__c'), num(32)), [x(call('__nl'))]),
    iff(ge(v('__r'), num(SCREEN.ROWS)), [x(call('__scrl'))]),
    x(call('__cell', m(inner(), 'pap'), m(inner(), 'txt'), add(v('__r'), v('__sr')), v('__c'), v('_code'), v('__tink'), v('__tpap'))),
    set('__c', add(v('__c'), num(1))),
  ]));

  out.push(set('__wrap', num(0)));
  out.push(fn('__pstr', ['_s'], [
    set('_s', add(str(''), v('_s'))),
    local('i', num(0)),
    local('n', m(v('_s'), 'length')),
    whl(lt(v('i'), v('n')), [
      // WRAP 1: a word that would run past the right edge starts a new line instead of splitting
      iff(and(v('__wrap'), op('!=', cm(v('_s'), 'charCodeAt', v('i')), num(32))), [
        local('e', cm(v('_s'), 'indexOf', str(' '), v('i'))),
        iff(lt(v('e'), num(0)), [set('e', v('n'))]),
        iff(and(op('>', add(v('__c'), sub(v('e'), v('i'))), num(32)), and(op('>', v('__c'), num(0)), op('<=', sub(v('e'), v('i')), num(32)))), [x(call('__nl'))]),
      ]),
      // WRAP 1: a space that falls exactly at the right margin is dropped, so the next line doesn't start with one
      iff(and(v('__wrap'), and(eq(cm(v('_s'), 'charCodeAt', v('i')), num(32)), ge(v('__c'), num(32)))), [], [
        x(call('__pch', cm(v('_s'), 'charCodeAt', v('i')))),
      ]),
      set('i', add(v('i'), num(1))),
    ]),
  ]));

  // number -> string the way the Spectrum would (8 significant-ish digits, no trailing junk)
  out.push(fn('__ns', ['_n'], [
    local('a', math('abs', v('_n'))),
    iff(op('||', ge(v('a'), num(1e9)), eq(v('a'), num(0))), [ret(add(str(''), v('_n')))]),
    local('k', math('pow', num(10), sub(num(8), math('floor', add(op('/', math('log', v('a')), num(Math.LN10)), num(0.0000001)))))),
    ret(add(str(''), op('/', math('round', mul(v('_n'), v('k'))), v('k')))),
  ]));

  out.push(fn('__pat', ['_r', '_c'], [
    set('__r', v('_r')), set('__c', v('_c')),
    iff(ge(v('__r'), num(24)), [set('__r', num(23))]),
    iff(lt(v('__r'), num(0)), [set('__r', num(0))]),
  ]));
  out.push(fn('__tab', ['_n'], [
    set('_n', op('%', v('_n'), num(32))),
    iff(lt(v('_n'), v('__c')), [x(call('__nl'))]),
    whl(lt(v('__c'), v('_n')), [x(call('__pch', num(32)))]),
  ]));
  out.push(fn('__comma', [], [
    x(call('__pch', num(32))),
    whl(op('!=', op('%', v('__c'), num(16)), num(0)), [x(call('__pch', num(32)))]),
  ]));

  // graphics (spectrum coords: x 0..255 left->right, y 0..175 bottom->top)
  out.push(fn('__plot', ['_x', '_y'], [
    set('__px', v('_x')), set('__py', v('_y')),
    x(call('__rect', gfx(), call('__ci', v('__tink')), v('_x'), Y(v('_y')), num(1), num(1))),
  ]));
  out.push(fn('__draw', ['_dx', '_dy'], [
    local('nx', add(v('__px'), v('_dx'))),
    local('ny', add(v('__py'), v('_dy'))),
    x(cm(gfx(), 'lineStyle', num(1), call('__ci', v('__tink')), num(100))),
    x(cm(gfx(), 'moveTo', add(v('__px'), num(0.5)), add(Y(v('__py')), num(0.5)))),
    x(cm(gfx(), 'lineTo', add(v('nx'), num(0.5)), add(Y(v('ny')), num(0.5)))),
    set('__px', v('nx')), set('__py', v('ny')),
  ]));
  out.push(fn('__circle', ['_x', '_y', '_r'], [
    local('n', math('max', num(12), math('round', mul(v('_r'), num(2))))),
    local('i', num(0)),
    x(cm(gfx(), 'lineStyle', num(1), call('__ci', v('__tink')), num(100))),
    x(cm(gfx(), 'moveTo', add(add(v('_x'), v('_r')), num(0.5)), add(Y(v('_y')), num(0.5)))),
    whl(op('<=', v('i'), v('n')), [
      local('a', op('/', mul(mul(v('i'), num(2)), v('PI_')), v('n'))),
      x(cm(gfx(), 'lineTo', add(add(v('_x'), mul(v('_r'), math('cos', v('a')))), num(0.5)), add(Y(add(v('_y'), mul(v('_r'), math('sin', v('a'))))), num(0.5)))),
      set('i', add(v('i'), num(1))),
    ]),
    set('__px', v('_x')), set('__py', v('_y')),
  ]));
  out.push(set('PI_', num(Math.PI)));
  out.push(fn('__rectf', ['_x', '_y', '_w', '_h'], [
    x(call('__rect', gfx(), call('__ci', v('__tink')), v('_x'), Y(sub(add(v('_y'), v('_h')), num(1))), v('_w'), v('_h'))),
  ]));

  // DIM helper: nested 0..n arrays filled with _fill
  out.push(fn('__dim', ['_dims', '_i', '_fill'], [
    local('n', m(v('_dims'), v('_i'))),
    local('a', ['arr', []]),
    local('j', num(0)),
    whl(op('<=', v('j'), v('n')), [
      iff(lt(v('_i'), sub(m(v('_dims'), 'length'), num(1))), [
        setm(v('a'), v('j'), call('__dim', v('_dims'), add(v('_i'), num(1)), v('_fill'))),
      ], [
        setm(v('a'), v('j'), v('_fill')),
      ]),
      set('j', add(v('j'), num(1))),
    ]),
    ret(v('a')),
  ]));

  // a ZX81-style chequerboard fill (2x2 bitmap scaled to 4 px cells), used by FX "chequer"
  out.push(set('__chq', ['nm', m(v('flash'), 'display'), str('BitmapData'), [num(2), num(2), ['b', false], num(0)]]));
  out.push(x(cm(v('__chq'), 'setPixel', num(1), num(0), num(0xFFFFFF))), x(cm(v('__chq'), 'setPixel', num(0), num(1), num(0xFFFFFF))));
  out.push(set('__chm', ['nm', m(v('flash'), 'geom'), str('Matrix'), [num(4), num(0), num(0), num(4), num(0), num(0)]]));
  out.push(fn('__fxchq', [], [x(cm(gfx(), 'beginBitmapFill', v('__chq'), v('__chm'), ['b', true], ['b', false]))]));

  // sprites baked into the SWF by SPRITE definitions
  out.push(set('__sn', num(0)));
  out.push(fn('__spr', ['_n', '_x', '_y', '_xs', '_ys', '_rot', '_al'], [
    set('__sn', add(v('__sn'), num(1))),
    x(cm(m(inner(), 'spr'), 'attachMovie', add(str('s_'), v('_n')), add(str('sp'), v('__sn')), v('__sn'),
      ['obj', [['_x', v('_x')], ['_y', add(v('_y'), mul(num(8), v('__sr')))], ['_xscale', v('_xs')], ['_yscale', v('_ys')], ['_rotation', v('_rot')], ['_alpha', v('_al')]]])),
  ]));
  out.push(fn('__sprclr', [], [
    x(cm(m(inner(), 'spr'), 'removeMovieClip')),
    x(cm(inner(), 'createEmptyMovieClip', 'spr', num(4))),
  ]));

  // sound
  out.push(fn('__beep', ['_d', '_p'], [
    set('_p', math('round', v('_p'))),
    iff(lt(v('_p'), num(BEEP_MIN)), [set('_p', num(BEEP_MIN))]),
    iff(op('>', v('_p'), num(BEEP_MAX)), [set('_p', num(BEEP_MAX))]),
    local('s', nw('Sound')),
    x(cm(v('s'), 'attachSound', add(str('b'), v('_p')))),
    local('n', m(v('__bn'), sub(v('_p'), num(BEEP_MIN)))),
    local('l', math('ceil', op('/', mul(v('_d'), num(BEEP_RATE)), v('n')))),
    iff(lt(v('l'), num(1)), [set('l', num(1))]),
    x(cm(v('s'), 'start', num(0), v('l'))),
  ]));

  out.push(fn('__tone', ['_p'], [
    set('_p', math('round', v('_p'))),
    iff(lt(v('_p'), num(TONE_MIN)), [set('_p', num(TONE_MIN))]),
    iff(op('>', v('_p'), num(TONE_MAX)), [set('_p', num(TONE_MAX))]),
    local('s', nw('Sound')),
    x(cm(v('s'), 'attachSound', add(str('t'), v('_p')))),
    x(cm(v('s'), 'start', num(0), num(1))),
  ]));

  // Touch arrives as mouse events. Latch brief presses until BASIC next runs;
  // a down/up pair between frames must not disappear before MOUSEB can read it.
  out.push(set('__ml', ['obj', []]));
  out.push(setm(v('__ml'), 'onMouseDown', ['fnx', [], [
    set('__mbX', m(scr(), '_xmouse')), set('__mbY', m(scr(), '_ymouse')),
    set('__mbHeld', num(1)), set('__mbPending', num(1)),
  ]]));
  out.push(setm(v('__ml'), 'onMouseUp', ['fnx', [], [set('__mbHeld', num(0))]]));
  out.push(x(cm(v('Mouse'), 'addListener', v('__ml'))));

  // lower screen (rows 22-23): INPUT prompt, error reports
  out.push(fn('__lo', ['_s'], [
    iff(op('!=', m(scr(), 'lo'), ['undef']), [x(cm(m(scr(), 'lo'), 'removeMovieClip'))]),
    x(cm(scr(), 'createEmptyMovieClip', 'lo', num(5))),
    x(cm(m(scr(), 'lo'), 'createEmptyMovieClip', 'pap', num(1))),
    x(cm(m(scr(), 'lo'), 'createEmptyMovieClip', 'txt', num(2))),
    local('i', num(0)),
    local('n', m(v('_s'), 'length')),
    iff(op('>', v('n'), num(64)), [set('n', num(64))]),
    whl(lt(v('i'), v('n')), [
      x(call('__cell', m(m(scr(), 'lo'), 'pap'), m(m(scr(), 'lo'), 'txt'), add(num(22), math('floor', op('/', v('i'), num(32)))), op('%', v('i'), num(32)), cm(v('_s'), 'charCodeAt', v('i')), v('__ink'), v('__pap'))),
      set('i', add(v('i'), num(1))),
    ]),
  ]));
  out.push(fn('__err', ['_s'], [
    x(call('__lo', v('_s'))),
    set('__done', num(1)),
  ]));
  out.push(fn('__usr', ['_s'], [x(call('__err', v('_s'))), ret(num(0))]));
  out.push(fn('__inp', ['_prompt', '_name', '_isStr'], [
    set('__ibuf', str('')), set('__ivar', v('_name')), set('__istr', v('_isStr')), set('__iprompt', v('_prompt')),
    set('__mode', num(1)),
    x(call('__lo', add(add(v('__iprompt'), v('__ibuf')), str(String.fromCharCode(143))))),
  ]));
  // KEY "p": is that key held right now? Letters either case; CHR$ 8-11 are the cursor keys, as INKEY$ gives them
  out.push(fn('__kdown', ['_s'], [
    local('c', cm(cm(add(str(''), v('_s')), 'toUpperCase'), 'charCodeAt', num(0))),
    iff(eq(v('c'), num(8)), [set('c', num(37))]),
    iff(eq(v('c'), num(9)), [set('c', num(39))]),
    iff(eq(v('c'), num(10)), [set('c', num(40))]),
    iff(eq(v('c'), num(11)), [set('c', num(38))]),
    ret(['cond', cm(v('Key'), 'isDown', v('c')), num(1), num(0)]),
  ]));
  // key code -> character; cursor keys give the Spectrum's own codes: 8 left, 9 right, 10 down, 11 up
  out.push(fn('__kchar', ['_k'], [
    iff(eq(v('_k'), num(37)), [ret(str('\x08'))]),
    iff(eq(v('_k'), num(39)), [ret(str('\x09'))]),
    iff(eq(v('_k'), num(40)), [ret(str('\x0a'))]),
    iff(eq(v('_k'), num(38)), [ret(str('\x0b'))]),
    local('a', cm(v('Key'), 'getAscii')),
    iff(op('>', v('a'), num(0)), [ret(cm(v('String'), 'fromCharCode', v('a')))]),
    ret(str('')),
  ]));
  // INKEY$: the key held right now, or else the last key tapped since INKEY$ was last read
  // KEEP / KEPT: numbers that survive between visits, in a Flash SharedObject (Ruffle keeps it in the browser's storage)
  out.push(fn('__keep', ['_k', '_v'], [
    local('so', cm(v('SharedObject'), 'getLocal', str('zxflash'))),
    setm(m(v('so'), 'data'), v('_k'), v('_v')),
    x(cm(v('so'), 'flush')),
  ]));
  out.push(fn('__kept', ['_k'], [
    local('so', cm(v('SharedObject'), 'getLocal', str('zxflash'))),
    local('r', m(m(v('so'), 'data'), v('_k'))),
    iff(op('!=', ['typeof', v('r')], str('number')), [ret(num(0))]), // never kept: 0
    ret(v('r')),
  ]));
  out.push(set('__kbuf', str('')));
  out.push(fn('__inkey', [], [
    local('k', cm(v('Key'), 'getCode')),
    iff(cm(v('Key'), 'isDown', v('k')), [set('__kbuf', str('')), ret(call('__kchar', v('k')))]),
    local('b', v('__kbuf')),
    set('__kbuf', str('')),
    ret(v('b')),
  ]));

  // The jump budget stops runaway loops from hanging the page. When it runs out, a program may carry on
  // while the frame has used less than 14 ms, so heavy programs run at full speed and still yield every frame.
  out.push(fn('__more', [], [
    iff(lt(sub(call('getTimer'), v('__fstart')), num(14)), [set('__budget', num(1000)), ret(num(1))]),
    ret(num(0)),
  ]));

  // keyboard listener
  out.push(set('__kl', ['obj', []]));
  out.push(setm(v('__kl'), 'onKeyDown', ['fnx', [], [
    local('k', cm(v('Key'), 'getCode')),
    local('a', cm(v('Key'), 'getAscii')),
    set('__wait', num(0)), // any key cuts a PAUSE short, as on the Spectrum
    iff(eq(v('__mode'), num(0)), [set('__kbuf', call('__kchar', v('k')))]),
    iff(eq(v('__mode'), num(2)), [set('__kbuf', call('__kchar', v('k'))), set('__mode', num(0)), ret()]), // the key that ends a PAUSE is still there to be read
    iff(eq(v('__mode'), num(1)), [
      iff(eq(v('k'), num(13)), [
        iff(v('__istr'), [['setd', v('__ivar'), v('__ibuf')]], [
          local('n', ['tonum', v('__ibuf')]),
          iff(op('!=', v('n'), v('n')), [set('n', num(0))]),
          ['setd', v('__ivar'), v('n')],
        ]),
        set('__mode', num(0)), set('__ibuf', str('')), set('__iprompt', str('')),
        x(call('__lo', str(''))),
      ], [
        iff(eq(v('k'), num(8)), [
          set('__ibuf', cm(v('__ibuf'), 'substr', num(0), sub(m(v('__ibuf'), 'length'), num(1)))),
        ], [
          iff(and(ge(v('a'), num(32)), lt(v('a'), num(127))), [
            set('__ibuf', add(v('__ibuf'), cm(v('String'), 'fromCharCode', v('a')))),
          ]),
        ]),
        x(call('__lo', add(add(v('__iprompt'), v('__ibuf')), str(String.fromCharCode(143))))),
      ]),
    ]),
  ]]));
  out.push(x(cm(v('Key'), 'addListener', v('__kl'))));

  // stage setup
  out.push(x(cm(root(), 'createEmptyMovieClip', 'bd', num(1))));
  out.push(x(cm(root(), 'createEmptyMovieClip', 'scr', num(2))));
  out.push(setm(scr(), '_x', num(SCREEN.BORDER_X)), setm(scr(), '_y', num(SCREEN.BORDER_Y)));
  out.push(x(cm(root(), 'createEmptyMovieClip', 'msk', num(3))));
  out.push(setm(v('msk'), '_x', num(SCREEN.BORDER_X)), setm(v('msk'), '_y', num(SCREEN.BORDER_Y)));
  out.push(x(call('__rect', v('msk'), num(0xffffff), num(0), num(0), num(SCREEN.W), num(SCREEN.H))));
  out.push(x(cm(scr(), 'setMask', v('msk'))));
  out.push(x(cm(scr(), 'createEmptyMovieClip', 'bg', num(1))));
  out.push(x(call('__border', num(7))));
  out.push(x(call('__cls')));

  // frame loop
  out.push(setm(root(), 'onEnterFrame', ['fnx', [], [
    set('__t', add(v('__t'), num(1))),
    iff(v('__done'), [ret()]),
    iff(op('!=', v('__mode'), num(0)), [ret()]),
    iff(op('>', v('__wait'), num(0)), [set('__wait', sub(v('__wait'), num(1))), ret()]),
    // Every MOUSEB read in this execution frame sees the same snapshot. Waiting
    // frames leave the pending press intact, just as a held button stays down.
    set('__mb', ['cond', op('||', v('__mbHeld'), v('__mbPending')), num(1), num(0)]),
    // Released taps use their press position; held buttons keep live coordinates.
    set('__mbTap', ['cond', and(v('__mbPending'), not(v('__mbHeld'))), num(1), num(0)]),
    set('__mbPending', num(0)),
    set('__budget', num(4000)), set('__fstart', call('getTimer')),
    set('__again', num(1)),
    whl(v('__again'), [ // a far jump or RETURN sets __again and comes back here to re-enter via the prologue chain
      set('__again', num(0)),
      x(call('__run')),
      iff(v('__done'), [set('__again', num(0))]),
      iff(op('<=', v('__budget'), num(0)), [iff(not(call('__more')), [set('__again', num(0))])]),
    ]),
  ]]));
  return out;
}
