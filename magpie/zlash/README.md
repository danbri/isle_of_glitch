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
`examples/monster-maze.bas` and its entry in `pugzx/examples.js` in sync; the check
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
| `pugzx/font.js` | the 768-byte character set from the 48K ROM (shared by both engines) |
| `pugzx/examples.js` | the example programs (shared by both engines) |

**The language is specified in [`SPEC.md`](SPEC.md)** and has two implementations. **PUGZX** ([`pugzx/`](pugzx/)), the default engine on the main page, skips Flash: it compiles BASIC to one JavaScript function holding a `switch` over resume points (so the browser's JIT runs it natively), keeps the screen as data, and draws it with WebGPU: fills by stencil-then-cover (an even-odd stencil pass over a triangle fan, then a covering quad), strokes the same way so translucent lines stay even, paper and text as textures, sprites as textured quads, all 4x multisampled; Canvas 2D is the fallback (`?renderer=canvas`). Running the BASIC on the GPU itself would not help (AVM1-style bytecode is one sequential, branching stream, the worst case for a GPU, and Ruffle already draws with wgpu); the gain is in not interpreting it at all. The Four Hallows spends about 0.4 ms per game update there. PUGZX is a set of web components (`<pugzx-player>`, `<pugzx-keys>`, `<pugzx-examples>`, `<pugzx-editor>`, in [`pugzx/pugzx.js`](pugzx/pugzx.js); see SPEC section 21), and players on one page share kept numbers, so programs can talk: [`pugzx/demo.html`](pugzx/demo.html). `npm run test:pugzx` runs every example headless for 600 frames, checks the Lisp's answers and runs the Monster Maze gameplay checks. The Flash engine (Ruffle, fetched only when chosen) stays available from the ENGINE menu and `?engine=flash`, and DOWNLOAD .SWF works with either.

Any program can be shown on its own, filling the window, by adding `?play` to the page address: `index.html?play#four-hallows` shows only The Four Hallows, with a click-to-play prompt (a browser gives keys to the player only after a click) and a full-screen button, and its `LOADER` back to the menu is ignored. To embed one in another site:

```html
<iframe src="https://danbri.github.io/isle_of_glitch/magpie/zlash/?play#four-hallows"
        width="800" height="600" allow="fullscreen" style="border:0"></iframe>
```

The program becomes one AVM1 function that is re-entered every frame
(50 fps). Backward jumps spend a per-frame budget so `10 GO TO 10` can't
hang the player; `PAUSE`, `BEEP` and `INPUT` yield and resume via a jump
table at the top of the function. A program over 64 KB of bytecode is split into functions of up to 56 KB; a function ends at a section banner (a line beginning `REM ====`) in its second half when there is one, because a jump into another function walks that function's resume chain and is cheap only near its start, so code that runs every frame should not straddle a split. When the budget runs out the frame carries on in
slices while it is under 14 ms, so long computations use the frame rather than
crawl. `PEEK 23672` and `PEEK 23673` read the FRAMES counter, as on the Spectrum,
and a key that ends a `PAUSE` is still there for the next `INKEY$`.

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
/ `KEPT "name"` keep a number between visits in a Flash SharedObject. `examples/elite.bas` is Vector Trader, an Elite tribute: a 128-world galaxy
grown from seeds with the ZX81's RND formula, hidden-line wireframes from
face normals, a universe that rotates around you, trading, charts, hyperspace,
pirates, a spinning station to dock with (or a docking computer playing the Blue
Danube), and the commander kept with KEEP. `examples/titan.bas` is Farewell, Titan!, a short illustrated adventure in
the manner of Level 9: a two-word parser, thirteen places, each with a picture
painted like a 1950s science fiction magazine cover (sky gradients, ringed
Saturn, finned rockets, ink outlines), two endings and a score out of 100. `examples/lisp.bas` is a small Lisp written in
plain Spectrum BASIC (arrays for the heap, a mark-and-sweep collector, closures,
DEFUN, LET, COND), drawn as a Lear Siegler ADM-3A terminal, with a toy RDF store queried by
SPARQL-style basic graph patterns, `(QUERY '(SELECT (?X ?Y) WHERE (?X FOAF:KNOWS ?Y) (?Y EX:LIVESON TITAN)))`,
and forward-chaining RDFS rules; type `(DEMO)`, or press up and down to bring back
earlier lines and ready-made examples to edit and run. While it works, a spinner turns at the cursor, the power lamp flickers, and an `EMOJI` timer spins and throbs on the case. `examples/hallows.bas` is The Four Hallows, an isometric quest in the manner of Knight Lore, Ant Attack, Fairlight and Tir Na Nog: nine flick-screen rooms on a height map, redrawn with `FX` back to front every frame so blocks hide whatever is behind them, giant ants that cannot climb, crates to carry between rooms and stack, wraiths that only bite by night, and a sun and moon (`EMOJI`) counting twenty days. Blocks cast shadows and catch a bevel of light, the floor darkens where walls and blocks meet it, water shimmers, and at night three even-odd veils of dark leave a soft pool of lamplight round Oisin. Its figures are DATA (polygons, ellipses and strokes whose points belong to a rig of feet, head, hem, hair, hands and eyes), animated after the twelve principles: easing, anticipation, squash and stretch, follow-through, arcs, secondary action. Oisin faces front, back or in profile and turns through the profile, looks at the nearest danger or treasure, and when left alone taps a toe, pockets his hands, looks about, stretches, shifts his weight, leans on a block beside him or sits down and nods off; he shoves at walls, flails as he falls and recoils from ants. Blocks in front of him turn to glass, the tile he stands on is lit, Z and X turn the view a quarter (Ant Attack's four views), and dust, splashes, sparkles, stars, sleepy z's and fireflies are particles. Its every-frame code avoids `GO SUB` (each `RETURN` re-enters the program and walks its resume chain). On touch screens the page shows keys under the screen, chosen by each program
with a `REM touch: left right space=JUMP >north=N` line; they send real key
events (held, several at once) and a type box feeds `INPUT`. `examples/loader.bas` is the menu the page opens with. Its `LOADER
"name"` statement compiles to an AVM1 `getURL("#name", "_self")`: a same-page
link, so it needs no script access, and the page's `hashchange` handler opens
that example (by id, as in `#monster-maze`), or the loader itself when no name
is given; `node tools/avmcheck.js prog.bas` verifies every AVM1 branch
in a build lands on an instruction boundary.

Programs bigger than 32 KB of bytecode work: every resume point gets a
prologue in a chain of short hops, and any branch the assembler reports as
out of range is recompiled as "set the program counter and re-enter".

Ruffle and CodeMirror are vendored from npm into `vendor/`.
