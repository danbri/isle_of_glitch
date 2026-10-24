// Glue: BASIC source -> complete SWF bytes.
import * as S from './swf.js?v=mvmw033x';
import { compileIR } from './avm1.js?v=mvmw033x';
import { buildAssets, runtimeIR, STAGE, SCREEN, PALETTE } from './runtime.js?v=mvmw033x';
import { compileBasic, BasicError } from './basic.js?v=mvmw033x';

let assetCache = null;
// The host supplies the rasteriser (a canvas in the browser); Node gets a placeholder so builds still succeed.
let emojiRenderer = (text, size) => {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) { rgba[i * 4] = 255; rgba[i * 4 + 1] = 0; rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = 255; }
  return { width: size, height: size, rgba };
};
export function setEmojiRenderer(fn) { emojiRenderer = fn; }
const emojiCache = new Map();
function assets() { return assetCache || (assetCache = buildAssets()); }

export { BasicError };

export function buildProgram(source, opts = {}) {
  const t0 = performance.now();
  const a = assets();
  const far = new Set();
  let prog, actions, chunks = null;
  for (let attempt = 0; ; attempt++) {
    prog = compileBasic(source, far, chunks, !!opts.trace);
    const marks = {};
    try { actions = compileIR([...runtimeIR(a.beepLengths), ...prog.ir], marks); break; }
    catch (e) {
      if (attempt > 200) throw e;
      // AVM1 branches are 16-bit: recompile any that don't reach as "far" jumps
      if (e.farLabel && !far.has(e.farLabel)) { far.add(e.farLabel); continue; }
      // a function may hold 64 KB: split the program into chunks at loop-free line boundaries
      if (e.tooLarge && !chunks) { chunks = planChunks(marks, prog.splittable, prog.lines); if (chunks) continue; }
      throw e;
    }
  }
  const spriteTags = buildSprites(prog.sprites, a.nextId);
  spriteTags.push(...buildEmojis(prog.emojis, a.nextId + 100000));
  const tags = [
    S.tagFileAttributes(),
    S.tagBackground(PALETTE[7]),
    ...a.tags,
    ...spriteTags,
    S.tagDoAction(actions),
    S.tagShowFrame(),
    S.tagEnd(),
  ];
  const swf = S.buildSwf({ width: STAGE.W, height: STAGE.H, frameRate: SCREEN.FPS, frameCount: 1, tags });
  return { swf, bytecode: actions.length, lines: prog.lines, vars: prog.vars, ms: performance.now() - t0 };
}

const CHUNK_BYTES = 40000;
function planChunks(marks, splittable, nLines) {
  const chunks = []; let k = 0, start = marks[0] || 0;
  for (let i = 0; i < nLines; i++) {
    if (i > 0 && splittable[i] && (marks[i] - start) > CHUNK_BYTES) { k++; start = marks[i]; }
    chunks[i] = k;
  }
  return k > 0 ? chunks : null;
}

// SPRITE "name", "row", ... definitions -> one DefineShape per colour, wrapped in a sprite exported as s_<name>.
// Cells: '.' or ' ' transparent, '#' black, '+' grey, 'W' white, '0'-'7' Spectrum colours, 'a'-'h' the bright set.
const CELL_COLOURS = { '#': 0x000000, '+': 0x808080, 'W': 0xFFFFFF };
for (let i = 0; i < 8; i++) { CELL_COLOURS[String(i)] = PALETTE[i]; CELL_COLOURS['abcdefgh'[i]] = PALETTE[8 + i]; }
function buildSprites(sprites, nextId) {
  const tags = [], exports = [];
  let id = nextId;
  for (const [name, rows] of sprites) {
    const byColour = new Map();
    rows.forEach((row, y) => {
      let run = null;
      const flush = (xEnd) => { if (run) { const list = byColour.get(run.c) || []; list.push({ x: run.x, y, w: xEnd - run.x, h: 1 }); byColour.set(run.c, list); run = null; } };
      for (let x = 0; x <= row.length; x++) {
        const ch = row[x];
        const c = ch !== undefined && CELL_COLOURS[ch] !== undefined ? CELL_COLOURS[ch] : null;
        if (run && run.c !== c) flush(x);
        if (c !== null && !run) run = { x, c };
      }
      flush(row.length);
    });
    const ctl = [];
    let depth = 1;
    for (const [colour, rects] of byColour) {
      const shapeId = id++;
      tags.push(S.tagDefineShapeRects(shapeId, rects, colour));
      ctl.push(S.tagPlaceObject2({ depth: depth++, id: shapeId }));
    }
    const spriteId = id++;
    ctl.push(S.tagShowFrame(), S.tagEnd());
    tags.push(S.tagDefineSprite(spriteId, ctl));
    exports.push({ id: spriteId, name: 's_' + name });
  }
  if (exports.length) tags.push(S.tagExportAssets(exports));
  return tags;
}

// EMOJI definitions -> DefineBitsLossless2 (ARGB, alpha) + a bitmap-filled shape, wrapped in a sprite exported as s_<name>.
function buildEmojis(emojis, nextId) {
  const tags = [], exports = [];
  let id = nextId;
  for (const [name, { text, size }] of emojis) {
    const key = text + '@' + size;
    let img = emojiCache.get(key);
    if (!img) { img = emojiRenderer(text, size); emojiCache.set(key, img); }
    const bmpId = id++, shapeId = id++, spriteId = id++;
    tags.push(S.tagDefineBitsLossless2(bmpId, img.width, img.height, img.rgba));
    tags.push(S.tagDefineShapeBitmap(shapeId, bmpId, img.width, img.height));
    // centred on the registration point, so SPRITE x,y is the middle and rotation spins about it
    tags.push(S.tagDefineSprite(spriteId, [S.tagPlaceObject2({ depth: 1, id: shapeId, matrix: { tx: -Math.round(img.width / 2) * 20, ty: -Math.round(img.height / 2) * 20 } }), S.tagShowFrame(), S.tagEnd()]));
    exports.push({ id: spriteId, name: 's_' + name });
  }
  if (exports.length) tags.push(S.tagExportAssets(exports));
  return tags;
}
