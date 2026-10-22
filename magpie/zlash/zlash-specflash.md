---
name: zlash-specflash
description: Generating Flash (SWF/AVM1) bytecode from JavaScript, compiling a Spectrum-style BASIC to it, and playing the result in Ruffle. Use when writing or debugging SWF/AVM1 emitters, retro-BASIC compilers targeting Flash, Ruffle-hosted pages, or ZX Spectrum / ZX81 homages (fonts, colours, 3D Monster Maze). Captures everything learned building ZX Flash in ~/working/flash.
---

# ZX Flash: Spectrum BASIC → AVM1 → Ruffle

Hard-won knowledge from building a browser page that compiles ZX Spectrum BASIC to Flash 8
bytecode in pure JavaScript and plays it with Ruffle. Reference implementation:
`/Users/danbri/working/isle_of_glitch/magpie/zlash` (js/swf.js writer, js/avm1.js assembler + IR, js/runtime.js
"ROM", js/basic.js compiler, js/compiler.js glue, js/tap.js TAP reader, tools/*.js checks).

## 1. Architecture that works

- **Output is a real SWF, not an interpreter.** Each program becomes an uncompressed `FWS`
  Flash 8 file: FileAttributes, SetBackgroundColor, asset tags, one DoAction holding the
  runtime library plus the compiled program, ShowFrame, End. Only Flash 6–8 era AVM1 APIs are
  used (createEmptyMovieClip, attachMovie, drawing API, Color, Sound, Key), so it should run
  in Adobe's player too (untested; Ruffle is the practical player since Adobe's EOL in 2020).
- **Tree IR between compiler and assembler.** Nested arrays such as
  `['set', name, expr]`, `['call', fn, args]`, `['cm', obj, method, args]`, `['if', c, then, else]`,
  `['while', c, body]`, `['fn', name, params, body]`, `['fnx', params, body]` (anonymous
  function expression), `['cond', c, a, b]`, `['raw', fn]`. Both the hand-written runtime and
  the BASIC compiler target this IR; the assembler resolves labels. This kept the whole thing
  debuggable.
- **Frame-driven execution.** The program is one AVM1 function (`__run`) re-entered from
  `onEnterFrame` at 50 fps. Every BASIC line (and every FOR body, REPEAT, WHILE, GOSUB return
  point, point after PAUSE/BEEP/INPUT) is a *resume point* with an integer index. Yield =
  `__pc = idx; return`. Backward jumps decrement a per-frame budget (4000) and yield when it
  runs out, so `10 GO TO 10` never trips Ruffle's script timeout.
- **Resume dispatch by chained prologues, not a jump table.** AVM1 branches are signed 16-bit
  relative, so a jump table at the top cannot reach labels > 32 KB away. Instead every resume
  point gets `jmp R_n; P_k: if __pc==n goto R_n; jmp P_{k+1}; R_n:` and the function starts
  with `jmp P_0`. Re-entry walks the chain (a few thousand ops for hundreds of lines, fine).
- **Far jumps.** Assemble; if the assembler reports a branch out of range, add that label to a
  `far` set and recompile: jumps to far labels become `__pc = idx; __again = 1; return`, and
  the frame loop re-enters `__run` while `__again` is set (also checking `__done` and budget).
  RETURN and computed GO TO always use this path.
- **64 KB per function.** `DefineFunction` codeSize is u16. Programs bigger than ~40 KB of
  bytecode are split into `__run0..N` at line boundaries where no FOR/REPEAT/WHILE is open
  (record "splittable" per line during the first compile, plus byte marks per line via a
  `['mark', idx]` IR node). Cross-chunk jumps are far jumps; a driver `__run` calls chunks in
  order until one "claims" the resume point (`__claimed`), the last chunk's chain end is the
  program end. A 100 KB text adventure runs this way.
- **Variables live on the timeline.** Pre-initialise every BASIC variable at top level
  (`b_name` / `b_name$` to dodge AVM1 globals like Key, Math, String); SetVariable inside
  functions then finds them in the scope chain. Runtime locals use DefineLocal.

## 2. SWF format gotchas (all verified against Ruffle)

- Doubles in ActionPush are little-endian with the two 32-bit halves **swapped**.
- RECT/MATRIX are MSB-first bit fields; compute minimal bit widths for signed values; align
  to a byte after each bit-field structure.
- Tag header: `code<<6 | len`, long form (`0x3f` + u32) for ≥ 63 bytes.
- DefineShape: fill style array, line style array, NumFillBits/NumLineBits nibble, then
  StyleChangeRecord (with absolute MoveTo and fillstyle0 set once) + StraightEdgeRecords, end
  with 6 zero bits. Pixel-art sprites: merge horizontal runs per row into rects; one
  DefineShape per colour placed at successive depths inside one DefineSprite, exported by
  name for attachMovie.
- DefineSound format 3 = uncompressed little-endian 16-bit; rate code 2 = 22050 Hz. A
  single-cycle-ish square wave (~600 samples per semitone) looped with `Sound.start(0, loops)`
  gives a Spectrum BEEP bank of 61 pitches in ~70 KB.
- ActionDefineFunction (0x9b): header holds name, param count, names, u16 code size; the
  body follows the action and is assembled into the same buffer.
- ActionIf/Jump offsets are relative to the end of the 5-byte instruction. Modulo (0x3f),
  Subtract, Divide pop b then a and compute a op b (push a first).
- Legacy And/Or (0x10/0x11) are fine for booleans; Equals2/Less2/Greater for comparisons;
  Add2 concatenates when either side is a string.
- Flash 4 `ActionTrace` only shows in Ruffle at logLevel `info` (as `avm_trace`).

## 3. AVM1 runtime patterns

- Screen = clip tree: `bd` (border), `scr` at (32,24) masked to 256×192 with `inner`
  (`pap`, `gfx`, `txt`, `spr` layers) and `lo` (lower screen for INPUT/reports).
- Text: one DefineSprite per ROM glyph (white), placed with attachMovie per cell at depth
  `(row+scrolled)*32+col` (replacing a cell = same depth), tinted with `new Color(mc).setRGB`.
  Paper cell = a second 8×8 sprite under it. Scroll by moving `inner._y` and removing the row
  that left the top. **Scroll lazily**: PRINT on the bottom row must not scroll until the next
  character needs space, or status lines vanish.
- Drawing API quirks: call `lineStyle()` with no args before `beginFill` or filled rects
  inherit the last stroke; lineStyle(1) scales with the stage (pixel-ish), 0 is hairline.
- Keyboard: `Key.addListener(obj)` with `onKeyDown`; `Key.getCode()` + `Key.getAscii()`;
  cursor keys 37/38/39/40 map to Spectrum INKEY$ codes 8/11/9/10. INKEY$ = key held now, else
  a one-key buffer of the last tap (otherwise polling loops miss short presses).
- INPUT: a mode flag, a buffer edited in the key listener, redraw of the lower screen,
  assignment through SetVariable with a computed name.
- Any keypress clears a PAUSE (Spectrum behaviour); PAUSE 0 waits for a key.
- Memory: drawing-API calls accumulate until `clear()`; redraw loops should CLS (recreate
  clips) or use sprites rather than redrawing filled rects every frame.

## 4. Ruffle specifics (0.7.1, self-hosted from npm `@ruffle-rs/ruffle`)

- Load bytes with `player.ruffle().load({ data, autoplay:'on', unmuteOverlay:'hidden',
  letterbox:'on', scale:'showAll', splashScreen:false, logLevel:'warn', maxExecutionDuration })`.
  `preloader` is deprecated. Set `window.RufflePlayer.config = { polyfills:false, publicPath }`
  before loading ruffle.js.
- **Never start a second `load()` while one is in flight**: it leaves the tab's player black
  for every later movie. Serialise loads and queue the newest bytes.
- Keyboard needs real focus: a user click on the player. From an automation harness, a
  synthetic pointerdown on the shadow-DOM canvas plus `player.focus()` worked early in the
  session and later stopped working even with trusted CDP clicks; design test copies of
  programs to skip `PAUSE 0` title screens instead.
- The AudioContext starts suspended until a user gesture; sound works after a click.
- Ruffle also works from a CDN (`https://unpkg.com/@ruffle-rs/ruffle@0.7.1/ruffle.js`, it
  fetches its wasm relative to that URL) if vendoring is unwanted; the project vendors it so
  GitHub Pages serves everything from one checkout.

## 5. Spectrum/ZX81 facts used

- Spectrum ROM font: 768 bytes at 0x3D00 in 48.rom (96 glyphs, 32–127, MSB-left rows);
  Amstrad permits distribution for emulation. Block graphics 128–143: bit0 top-right,
  bit1 top-left, bit2 bottom-right, bit3 bottom-left. 96 = £, 127 = ©.
- Palette: normal 0xD7-based (black, blue, red, magenta, green, cyan, yellow, white), bright
  0xFF-based. Screen 256×192, 32×24 cells, PRINT uses rows 0–21, INPUT the lower two.
  Pixel coordinates in PLOT/DRAW are bottom-left origin, 0..255 × 0..175.
- Spectrum BASIC quirks worth keeping: functions bind tighter than `*` (`INT RND*10` is 0),
  `a AND b` is `b ? a : 0`, strings slice 1-based inclusive `a$(2 TO 4)`, PRINT `,` tabs to
  16-column zones, `'` newlines, numbers print with ~8 significant digits.
- .TAP: `[len u16][flag][data][checksum]`; header block flag 0 (type, 10-char name, length,
  autostart line, prog length); program block = lines `[lineNo big-endian][len LE][tokens 0x0D]`,
  numbers carry a hidden 0x0E + 5-byte form to skip, tokens 0xA5–0xFF.
- 3D Monster Maze (ZX81, Malcolm Evans 1981), from the fruitcake.plus.com commented
  disassembly: 16×16 maze grown from random passageways starting at the south-east corner
  (crossing allowed, running side by side not), exit sealed to one neighbour, Rex inserted at
  row 1 cols 5–10. View = 7 sections of column widths 1,4,3,2,1,1,1 and heights
  24,22,14,8,4,2,2 rows; sides drawn near→far, facing walls far→near (chequered), Rex on top.
  Rex moves towards the player along the larger axis (other axis if blocked), two steps per
  cell, half the player's speed when the player moves, a quarter when still, visible from 5.
  Messages: REX LIES IN WAIT (not visible and could not move), HE IS HUNTING FOR YOU (>8),
  FOOTSTEPS APPROACHING (7–8), REX HAS SEEN YOU (3–6 in line of sight), RUN HE IS BEHIND/BESIDE
  YOU (<3). Sprites are display-file row records: `[hi][off,n,chars...]...[0]`, each row's
  offset relative to the cursor *after* the previous row (33 bytes per display row); each
  character is 2×2 quadrants (codes 1–7 and inverses 0x81–0x87, 0x80 black, 8–10/0x88–0x8A
  chequer). Extracted sprites: dl/mm/disasm/rex_sprites.json.

## 6. Testing workflow that paid off

- `node tools/build.js prog.bas out.swf` and `node tools/check-examples.js` catch compiler
  errors headlessly; `node tools/avmcheck.js prog.bas` walks every function and verifies each
  branch target is an instruction boundary (caught nothing yet but rules out a class of crash).
- Browser checks via the chrome-devtools MCP: the page exposes `window.zxflash =
  {editor, player, run, setTab, buildProgram}`; fetch example sources with
  `import('./js/examples.js')` and set the editor **once** per load. Screenshots verify
  rendering; keyboard verification needs a human.
- Serve with no-store headers (tools/serve.py). A query string on index.html does not bust
  module caches. localStorage restores the last editor text: store which example it came from
  and reload the fresh example when it was never edited, or users see stale programs.
- Minimal repros beat theorising: a 3-line program isolated the eager-scroll bug, a truncated
  program isolated a "broken" build that was really a broken tab.

## 7. Pitfalls list (each cost real time)

- `String.prototype.replace` with a string replacement interprets `$'`, `$&`: use a function
  when inlining source code into HTML.
- `#id { display:flex }` overrides the `hidden` attribute; add `#id[hidden]{display:none}`.
- Animated full-viewport backdrop/gradient overlays make the page janky; keep effects small.
- Border and paper are the same grey by default; a "zoomed" screenshot was just that.
- A same-named `const` inside a loop body shadows a helper declared above it (`P`).
- RESTORE must point at the real DATA line number; generate fragment line numbers explicitly.
- Rex placement loops that reset their counter on retry never terminate; give searches a
  monotone variable and a cap.
- Python patch scripts: assert every replacement matched, or a silent miss leaves the file
  half-patched; write files only after all replacements succeed.
