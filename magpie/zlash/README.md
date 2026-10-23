# ZX Flash

Lives at magpie/zlash in github.com/danbri/isle_of_glitch and is served by GitHub Pages.

A single-page app that compiles a ZX Spectrum flavoured BASIC to Flash
(SWF, AVM1 bytecode) entirely in the browser, and plays the result with
[Ruffle](https://ruffle.rs). Every edit rebuilds the movie and reloads it.

    npm run serve        # http://127.0.0.1:8765/  (no-store headers, so plain reloads pick up edits)
    npm run build examples/hello.bas out.swf   # command-line compile
    npm run check        # compile every example and check Monster Maze gameplay
    npm run stamp        # version-stamp script URLs and imports before committing (GitHub Pages caches for 10 min)

Open the page, pick an example from LOAD, type. CODE shows the editor over
the running movie through frosted glass; SCREEN shows the movie full size
(click it to give it the keyboard, Esc returns to the code); MANUAL is the
language reference.

Open [3D Monster Maze directly](./#monster-maze), or choose it from LOAD.
Use the cursor keys or W/A/D (S turns around), or the four on-screen buttons.
Turns happen once per press; holding forward keeps walking. The title and result
screens also accept a tap. Other examples have their own shareable URL hashes.

The maze keeps a complete wall border and chooses a reachable exit without
closing passages. Its original greedy Rex pursuit and monochrome sprites remain.
`npm run check` includes 128 seeded mazes, five constant random sources, and
keyboard, pointer, wall collision, visibility, win and retry checks against the
compiled BASIC IR. Drawing and audio are stubbed in those checks; use Ruffle for
visual verification and `tools/avmcheck.js` for the emitted AVM1 branches. Keep
`examples/monster-maze.bas` and its entry in `js/examples.js` in sync; the check
also verifies that the browser uses the tested listing.

## How it works

| file | role |
| --- | --- |
| `js/swf.js` | bit-level SWF writer: RECT/MATRIX, DefineShape, DefineSprite, PlaceObject2, ExportAssets, DefineSound, DoAction |
| `js/avm1.js` | AVM1 assembler with labels and a tiny tree IR (expressions, if/while, functions) |
| `js/runtime.js` | the "ROM": Spectrum screen, ROM font glyph sprites, PRINT/PLOT/DRAW/CIRCLE, BEEP bank, INPUT, key listener, frame loop, all as AVM1 |
| `js/basic.js` | tokenizer + single-pass compiler from BASIC to IR |
| `js/compiler.js` | glue: source in, SWF bytes out |
| `js/app.js` | editor (CodeMirror 5), tabs, auto-reload into Ruffle |
| `js/font.js` | the 768-byte character set from the 48K ROM |

The program becomes one AVM1 function that is re-entered every frame
(50 fps). Backward jumps spend a per-frame budget so `10 GO TO 10` can't
hang the player; `PAUSE`, `BEEP` and `INPUT` yield and resume via a jump
table at the top of the function.

The language is Spectrum BASIC plus a few extensions (ELSE, REPEAT/UNTIL,
WHILE/WEND, RECT, DATA/READ/RESTORE, hex colours, MOUSEX/MOUSEY/TICKS,
cursor keys via INKEY$, `SPRITE` for bitmap sprites baked into the SWF as
Flash shapes, and `FX`/`FXP` which call any MovieClip drawing-API
method or set any clip property, so BASIC can reach the whole Flash 8
vector API without touching the compiler). `examples/monster-maze.bas` is a 3D Monster Maze
homage written in it, using Rex's sprites and the view geometry recovered from
the commented ZX81 disassembly (dl/mm); `examples/platform.bas` is Miner Ned, a
Manic Miner tribute: the original's movement rules (fixed jump arc, conveyors,
crumbling floors, fatal falls, air) from mrcook's C++ port, with new caverns
and sprites and Grieg's Hall of the Mountain King, using the new `KEY "p"` held-key test; `examples/hobbit.bas` ("Pipkin's Quest") is a 49-room text
adventure in the shape of the 1982 Melbourne House one, with all names and
text rewritten (personal use); `WRAP 1` gives it word-wrapped PRINT; `examples/asteroids.bas` (Emo Asteroids) shows `EMOJI`,
which rasterises emoji through the browser's canvas at compile time into
alpha bitmaps (DefineBitsLossless2) that `SPRITE` can rotate and fade, plus
`TONE` chimes and `MOUSEB`; `examples/tvp.bas` is a traced vector logo
splash; `examples/pop-party.bas` is a Flash-style emoji game written to be read: a
contents REM, long variable names, a DATA table of things to pop, one
subroutine per idea, and Percy the pelican cycling past in FX vectors with
legs that follow the pedals (law of cosines). Plain-text `EMOJI` comes out as
outlined cartoon lettering; `HALT` waits one frame (50 Hz loops), and `KEEP "name", n`
/ `KEPT "name"` keep a number between visits in a Flash SharedObject. `examples/loader.bas` is the menu the page opens with. Its `LOADER
"name"` statement compiles to an AVM1 `getURL("#name", "_self")`: a same-page
link, so it needs no script access, and the page's `hashchange` handler opens
that example (by id, as in `#monster-maze`), or the loader itself when no name
is given; `node tools/avmcheck.js prog.bas` verifies every AVM1 branch
in a build lands on an instruction boundary.

Programs bigger than 32 KB of bytecode work: every resume point gets a
prologue in a chain of short hops, and any branch the assembler reports as
out of range is recompiled as "set the program counter and re-enter".

Ruffle and CodeMirror are vendored from npm into `vendor/`.
