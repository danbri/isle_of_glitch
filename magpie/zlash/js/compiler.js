// Glue: BASIC source -> complete SWF bytes.
import * as S from './swf.js';
import { compileIR } from './avm1.js';
import { buildAssets, runtimeIR, STAGE, SCREEN, PALETTE } from './runtime.js';
import { compileBasic, BasicError } from './basic.js';

let assetCache = null;
function assets() { return assetCache || (assetCache = buildAssets()); }

export { BasicError };

export function buildProgram(source) {
  const t0 = performance.now();
  const a = assets();
  const far = new Set();
  let prog, actions, chunks = null;
  for (let attempt = 0; ; attempt++) {
    prog = compileBasic(source, far, chunks);
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
