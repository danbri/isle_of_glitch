# ZX Flash BASIC: language and machine specification

Version 1, October 2026. This document specifies the BASIC dialect run by ZX Flash, and the
virtual machine (screen, sound, input, time) that its programs see, precisely enough that a
second implementation can be written without reading the first. Two implementations exist:

- **ZX Flash** (`js/basic.js`, `js/runtime.js`): compiles BASIC to Flash 8 AVM1 bytecode, played by Ruffle.
- **ZX GPU** (`gpu/`): compiles BASIC to JavaScript and draws with WebGPU, or Canvas 2D where WebGPU is missing.

The words MUST, SHOULD and MAY are used in their usual sense. Where the two implementations
are known to differ, or where ZX Flash's behaviour is an accident that programs should not lean
on, the text says so in a *Note*. Section 20 lists behaviour left to the implementation.

The dialect is Sinclair ZX Spectrum BASIC, with long variable names, structured loops, an
`ELSE`, a held-key test, a vector drawing API, sprites, emoji, soft chimes, a frame clock and
persistent numbers. It is not a Spectrum emulator: there is no Z80, no memory map and no
attribute clash.

---

## 1. Program text

A program is a sequence of lines separated by line feeds (U+000A). Carriage returns are
ignored. A line that is empty or all white space is skipped.

A line begins with an optional line number (decimal digits, 0 to 2^31−1), then statements. A
line without a number takes the previous line's number plus 10 (the first such line is 10).
Line numbers MUST strictly increase; a line whose number is not greater than the previous
one is a compile-time error.

Statements on a line are separated by `:`. Empty statements (`::`) are allowed.

`REM` ends the line: everything after it, including colons, is a comment. A `REM` may follow
other statements on the same line (`LET a=1: REM start`).

A line whose text is `REM touch: ...` is metadata for the host (section 17); to the program it
is an ordinary comment. A line beginning `REM ===` is a *section banner*; it means nothing to
the language, but an implementation MAY use banners as natural boundaries (section 21).

## 2. Lexical structure

Tokens may be separated by spaces or tabs; spaces are otherwise insignificant except inside
strings and between the words of `GO TO` and `GO SUB`.

**Keywords** are case-insensitive and are recognised only as whole words. These words are
reserved and MUST NOT be used as variable names:

```
ABS ACS AND ASN AT ATN ATTR BEEP BIN BORDER BRIGHT CAT CHR$ CIRCLE CLEAR CLOSE CLS CODE
CONTINUE COPY COS DATA DEF DIM DRAW ELSE EMOJI END ERASE EXP FLASH FN FOR FORMAT FX FXP GO
GOSUB GOTO HALT IF IN INK INKEY$ INPUT INT INVERSE KEEP KEPT KEY LEN LET LINE LIST LLIST LN
LOAD LOADER LPRINT MERGE MOUSEB MOUSEX MOUSEY MOVE NEW NEXT NOT OPEN OR OUT OVER PAPER PAUSE
PEEK PI PLOT POINT POKE PRINT RANDOMISE RANDOMIZE READ RECT REM REPEAT RESTORE RETURN RND RUN
SAVE SCREEN$ SGN SIN SPRITE SQR STEP STOP STR$ SUB TAB TAN THEN TICKS TO TONE UNTIL USR VAL
VAL$ VERIFY WEND WHILE WRAP
```

`GO TO` and `GO SUB` may be written with or without the space (`GOTO`, `GOSUB`).

**Identifiers** start with a letter or `_`, continue with letters, digits and `_`, and may end
with `$`. They are case-insensitive. A name ending in `$` is a string name; any other is a
numeric name. `a` and `a$` are different variables.

**Numbers**: decimal (`12`, `3.5`, `.5`, `1e3`, `2.5E-4`), or hexadecimal written `#ff8000` or
`0x1F`. There is no sign in a literal; `-3` is unary minus applied to `3`, except in `DATA`
(section 7.9).

**Strings** are enclosed in `"`; a doubled `""` inside stands for one `"`. Characters are
mapped to the machine's character set (section 10.6) when the program is compiled: the
Unicode block graphics `▝ ▘ ▀ ▗ ▐ ▚ ▜ ▖ ▞ ▌ ▛ ▄ ▟ ▙ █` become codes 129 to 143, `£` becomes 96 and
`©` 127, and any other character outside 32 to 164 becomes `?`. *Exception*: the string
arguments of `EMOJI`, and of `SPRITE` definitions, are taken literally (section 13).

**Operators and punctuation**: `+ - * / ^ = <> < > <= >= ( ) , ; : '`.

## 3. Values

A **number** is an IEEE 754 double. Arithmetic follows IEEE rules: division by zero gives an
infinity, `0/0` gives NaN, and none of these is an error.

A **string** is a sequence of character codes 0 to 255 of any length (there is no 255-character
limit). Strings compare by code, lexicographically.

**Truth**: a condition is true when its value is a non-zero number. Comparisons and `NOT`
give 1 for true and 0 for false.

## 4. Variables and arrays

Every variable exists from the start of the run: numeric variables are 0 and string
variables `""` until assigned.

`DIM name(d1, d2, ...)` creates an array with one or more dimensions. Each subscript runs from
0 to its bound inclusive (so `DIM a(10)` has 11 elements; programs written in the Spectrum
manner use 1 to 10 and never notice element 0). Numeric elements start as 0, string elements
as `""`. `DIM` may be executed again; it replaces the array with a fresh one.

`DIM name$(d1, d2, ...)` creates a string array whose elements each hold a whole string of
any length (strings are never padded), with subscripts as for numeric arrays: `DIM n$(10)`
gives `n$(0)` to `n$(10)`. Spectrum listings declare string arrays with a final *length*
bound, `DIM n$(10,24)`, and index them with one subscript, `n$(3)`. An implementation MUST
accept a string array indexed with one subscript fewer than it has bounds; the last bound is
then ignored, and such an element reads as `""` until assigned. *Note*: in ZX Flash the
ignored bound still exists as an inner array, so reading such an element before assigning it
yields that array, not `""`. Programs SHOULD assign string elements before reading them.

**One namespace.** An array and a scalar of the same name are the same variable: `LET a=1`
after `DIM a(5)` destroys the array, and a `FOR a=...` loop does too. `DIM` MUST appear in the
program text (not merely be executed) before any line that subscripts that name, because the
compiler needs to know that `a(...)` is an array and not a string slice or an error.

**Subscripts** SHOULD be integers within bounds. Reading outside the bounds or with a
non-integer subscript is undefined (ZX Flash yields an undefined value that behaves as NaN in
arithmetic; ZX GPU yields 0 or `""`). Writing outside the bounds is undefined.

## 5. Expressions

### 5.1 Precedence, lowest first

| level | operators | notes |
|---|---|---|
| 1 | `OR` | left to right |
| 2 | `AND` | left to right |
| 3 | `NOT` | prefix |
| 4 | `=` `<>` `<` `>` `<=` `>=` | left to right; both sides must be the same type |
| 5 | `+` `-` | `+` also joins strings |
| 6 | `*` `/` | numbers only |
| 7 | unary `-`, unary `+` | `-2^2` is −4 |
| 8 | `^` | `a^b^c` is `a^(b^c)` |
| 9 | atoms: literals, variables, array elements, slices, function calls, `( )` | |

### 5.2 Logical operators (Spectrum semantics)

- `a OR b` is 1 if `b` is true, else `a`.
- `a AND b` is `a` if `b` is true, else 0 (or `""` if `a` is a string).
- `NOT a` is 1 if `a` is 0, else 0.

Both operands are always evaluated; `b` is evaluated before `a`. Programs SHOULD NOT depend on
the evaluation order of operands that have side effects (`RND`, `INKEY$`).

### 5.3 Comparison

Numbers compare numerically; strings by character code. A comparison between a string and a
number is a compile-time error. The result is 1 or 0. `a<b<c` means `(a<b)<c`.

### 5.4 Strings

`+` joins two strings. Mixing a string and a number in `+`, or using a string in `-`, `*`, `/`
or `^`, is a compile-time error.

**Slicing** (1-based, inclusive):

| form | value |
|---|---|
| `s$(n)` | the n-th character |
| `s$(a TO b)` | characters a to b |
| `s$(TO b)` | characters 1 to b |
| `s$(a TO)` | characters a to the end |

Out-of-range slices are clipped (they never error). A slice of an array element is written
`n$(i)(a TO b)`.

### 5.5 Functions

A function's argument may be written with or without brackets. Without brackets the argument
is a unary-level expression, so `SIN x*2` is `(SIN x)*2` and `INT -2.5` is −3.

| function | value |
|---|---|
| `ABS x` | absolute value |
| `ACS x`, `ASN x`, `ATN x` | arc cosine, arc sine, arc tangent (radians) |
| `COS x`, `SIN x`, `TAN x` | radians |
| `EXP x`, `LN x` | e^x, natural logarithm |
| `INT x` | the largest integer ≤ x (floor, as on the Spectrum) |
| `SGN x` | −1, 0 or 1 |
| `SQR x` | square root |
| `PI` | π |
| `RND` | a pseudo-random number, 0 ≤ RND < 1. `RANDOMIZE` does not reseed it |
| `LEN s$` | length |
| `CODE s$` | code of the first character (NaN for `""`) |
| `CHR$ n` | one-character string with code n |
| `STR$ n` | n as `PRINT` would show it (section 10.4) |
| `VAL s$` | the number written in s$ (decimal or `0x` hex, surrounding spaces allowed; `""` is 0; anything else NaN). *Unlike the Spectrum, VAL does not evaluate expressions.* |
| `VAL$ s$` | s$ unchanged |
| `BIN 1011` | the binary digits read as a number (here 11); the digits are a literal, not an expression |
| `INKEY$` | section 15.2 |
| `KEY s$` | 1 while that key is held, else 0 (section 15.3) |
| `TICKS` | frames since the program started (section 9) |
| `MOUSEX`, `MOUSEY`, `MOUSEB` | section 15.5 |
| `KEPT s$` | section 16 |
| `PEEK a` | the FRAMES system variable: `PEEK 23672` is TICKS mod 256 and `PEEK 23673` is (TICKS div 256) mod 256. Any other address reads 0 |
| `IN p` | 255 |
| `ATTR (r,c)` | 56 |
| `POINT (x,y)` | 0 |
| `SCREEN$ (r,c)` | `""` |
| `USR n` | stops the program with report `machine code (USR) cannot run here` |

`FN` and `DEF FN` are not supported (`DEF FN` is skipped; `FN` is a compile-time error).

## 6. Assignment

`LET name = expr`, `LET name(i, ...) = expr`; `LET` may be omitted. The value's type MUST match
the name's type (compile-time error otherwise). Assigning to a subscripted name requires a
prior `DIM` in the text (section 4).

## 7. Statements

### 7.1 Output and colour

`PRINT items` (section 10.3); `CLS`; `INK n`; `PAPER n`; `BRIGHT n`; `BORDER n`; `WRAP n`
(section 10.3). `INK`, `PAPER` and `BRIGHT` as statements set the permanent colours.

### 7.2 Graphics

`PLOT x,y`, `DRAW dx,dy`, `CIRCLE x,y,r`, `RECT x,y,w,h` (section 11). Each may begin with
temporary colour items: `RECT INK 2; 10,10,4,4`.

### 7.3 Drawing API

`FX "method", args...` and `FXP "property", value` (section 12).

### 7.4 Sprites

`SPRITE "name", "row", "row", ...` (definition), `SPRITE name$, x, y [, xs [, ys [, rot [, alpha]]]]`
(draw), `SPRITE CLEAR`, `EMOJI "text", "name" [, size]` (section 13).

### 7.5 Sound

`BEEP duration, pitch`; `TONE pitch [, seconds]` (section 14).

### 7.6 Time

`PAUSE n`; `HALT` (section 9).

### 7.7 Input

`INPUT [prompt] variable [; [prompt] variable ...]` (section 15.4). Prompts are string
literals; `;` and `,` between items are separators; `LINE` before a variable is accepted and
ignored.

### 7.8 Persistence and the host

`KEEP name$, value` (section 16); `LOADER [name$]` (section 17).

### 7.9 Data

`DATA item, item, ...` where each item is a number (optionally preceded by `-`) or a string
literal. All `DATA` items of the program form one list in program order, whether or not the
`DATA` lines are ever executed.

`READ target, ...` assigns the next items to variables or array elements. Reading a string
item into a numeric target, or a number into a string target, is undefined. Reading past the
end stops the program with report `E Out of DATA`.

`RESTORE` moves the data pointer to the start; `RESTORE n` (n a literal line number) moves it
to the first item on or after line n.

### 7.10 Control

`GO TO`, `GO SUB`, `RETURN`, `IF`, `FOR`/`NEXT`, `REPEAT`/`UNTIL`, `WHILE`/`WEND`, `STOP`, `END`,
`RUN` (section 8).

### 7.11 Accepted and ignored

`FLASH`, `INVERSE`, `OVER`, `POKE`, `CLEAR`, `RANDOMIZE`/`RANDOMISE`, `NEW`, `LIST`, `OUT`: their
arguments are evaluated and the statement does nothing. `FLASH`, `INVERSE` and `OVER` are also
accepted, and ignored, as items inside `PRINT` and graphics statements.

`LOAD`, `SAVE`, `VERIFY`, `MERGE`, `CAT`, `FORMAT`, `MOVE`, `ERASE`, `OPEN`, `CLOSE`, `LPRINT`,
`LLIST`, `COPY`, `CONTINUE`, `DEF`: skipped up to the end of the statement without parsing.

## 8. Control flow

**GO TO n**, **GO SUB n** with a literal n jump to the first line whose number is ≥ n; if
there is none it is a compile-time error. With a computed expression the line number MUST
exist exactly, otherwise report `N Line not found`.

**GO SUB** pushes the point after the statement on a return stack; **RETURN** pops it, and with
an empty stack stops with report `7 RETURN without GOSUB`. The stack depth is unbounded.

**IF c THEN s1 : s2 ... [ELSE t1 : t2 ...]**: if c is true the statements after `THEN` up to
`ELSE` or the end of the line run; otherwise those after `ELSE` (if any). `IF c THEN 100` is a
`GO TO 100`. `ELSE` belongs to the nearest unclosed `IF` on the line. An `IF` without `ELSE`
skips the rest of the line when false, as on the Spectrum.

**FOR v = a TO b [STEP s]** sets v to a and records b and s (default 1). The loop body runs
while (s ≥ 0 ? v ≤ b : v ≥ b), tested before each pass, so a loop may run zero times.
**NEXT v** adds s to v and goes back to the test. FOR and NEXT are matched *by their position in
the text*, innermost first; `NEXT` with a different variable than the innermost open `FOR` is a
compile-time error, as is a `FOR` without `NEXT`. When the test fails, execution continues
after the matching `NEXT`. The loop state lives in the variable and two hidden values per
variable name, so `GO TO` into or out of a loop body is allowed and behaves as the jumps say.

**REPEAT ... UNTIL c** runs the body at least once, until c is true. **WHILE c ... WEND** tests
c before each pass. Both nest with each other and with `FOR`, matched by position in the text.

**STOP** ends the program with report `9 STOP statement`; **END**, or running past the last
line, ends it with `0 OK`. **RUN** clears the screen and jumps to the first line; variables are
not reset.

## 9. Time

The machine runs on a clock of **50 frames per second**. `TICKS` counts frames from the start
of the run, whether the program is running, waiting or finished.

Within a frame the program runs until it **yields**. It yields at `HALT`, `PAUSE`, `BEEP`,
`TONE` with a duration, and `INPUT`. The screen as left at a yield is what the viewer sees.

- `HALT` resumes on the next frame.
- `PAUSE n` (n ≥ 1) idles for n frames and resumes on the frame after: a loop with one
  `PAUSE 1` runs 25 times a second. Any key pressed while paused ends the pause early.
- `PAUSE 0` waits for a key. The key that ends a pause is still there for the next `INKEY$`.
- `BEEP d,p` plays and idles for round(50·d) frames.
- `TONE p, s` plays and idles for round(50·s) frames; `TONE p` does not wait.

A program that does not yield (a long calculation, a loop with no `HALT`) MUST NOT freeze the
host. An implementation MUST keep updating the display at least a few times a second during
such a run, and SHOULD let it use most of each frame's time. Programs MUST NOT depend on how
much work fits into one frame; they keep time with `HALT`, `PAUSE` or `TICKS`.

## 10. The screen

### 10.1 Geometry

The screen is **256 × 192** pixels inside a border; the whole display is 320 × 240, with the
screen at (32, 24). The host scales the display to fit, preserving its aspect ratio.

The top 22 character rows (176 pixels) are the **upper screen**, where `PRINT` writes and
where `PLOT`-style coordinates live; rows 22 and 23 are the **lower screen**, used for `INPUT`
prompts and reports.

Two coordinate systems are used:

- **Spectrum coordinates** (`PLOT`, `DRAW`, `CIRCLE`, `RECT`, `MOUSEY`): x 0 to 255 left to
  right, y 0 to 175 *bottom to top* of the upper screen. Pixel (x, y) is screen pixel
  (x, 175 − y).
- **Screen pixels** (`FX`, `SPRITE`): x 0 to 255, y 0 to 191 *top to bottom*, fractional
  values allowed.

### 10.2 Layers

From back to front:

1. **border**, the `BORDER` colour, around and behind everything;
2. **paper**, the `PAPER` colour at the last `CLS`, filling the screen, with each printed
   character cell's own paper colour over it;
3. **drawing**, everything drawn by `FX`, `PLOT`, `DRAW`, `CIRCLE` and `RECT`;
4. **text**, the ink pixels of printed characters;
5. **sprites**, in the order drawn;
6. **lower screen**, the prompt or report, when there is one.

Everything except the border is clipped to the screen rectangle. `CLS` empties the paper
cells, drawing, text and sprites, refills the paper with the current `PAPER` colour, and puts
the print position at row 0, column 0.

### 10.3 PRINT

`PRINT` writes at the **print position** (row, column), starting from row 0, column 0 after
`CLS`. Items:

| item | effect |
|---|---|
| expression | its text (numbers formatted as in 10.4) |
| `;` | nothing: the next item follows on |
| `,` | prints spaces up to the next column that is a multiple of 16 (at least one space) |
| `'` | new line |
| `AT r,c` | moves the print position to row r, column c (r is clamped to 0..23) |
| `TAB n` | prints spaces up to column n mod 32, starting a new line first if already past it |
| `INK n`, `PAPER n`, `BRIGHT n` | colours for the rest of this `PRINT` only |

After the last item a new line is printed, unless that item was `;` or `,`. (So `PRINT AT 3,4;` leaves the position after the text, while `PRINT AT 3,4` moves to the next line.)

Printing a character writes it at the print position in the current ink and paper (both
affected by `BRIGHT`) and moves one column right. A character printed at column 32 or more
goes to column 0 of the next row first. Code 13 is a new line.

**Scrolling**: a new line only moves the print position; when a character is about to be
printed on row 22 or below, the whole upper screen, *including drawing and sprites*, moves up
one row (8 pixels) at a time until the position is on row 21. Afterwards `AT r` addresses rows
of the visible screen as before. `PLOT`-family coordinates and sprite positions refer to the
visible screen; `FX` coordinates are fixed to the drawing layer, which has moved. *Note*: ZX
Flash moves the layers, so earlier drawing scrolls away with the text. Programs that draw with
`FX` should not let `PRINT` scroll.

**WRAP 1** turns on word wrap: a word (a run of non-space characters) that would cross the
right edge starts on a new line, unless it is longer than a whole row, and a space that would
fall at column 32 is dropped. `WRAP 0` turns it off (the default).

### 10.4 Number format

A number is printed rounded to 9 significant digits, then written in the shortest decimal
form that reads back as the same double (the ECMAScript `Number.prototype.toString`
algorithm): `1/3` prints as `0.333333333`, `1e21` as `1e+21`, NaN as `NaN`, infinity as
`Infinity`. Numbers with magnitude ≥ 10^9 are written without the rounding. There is no
leading space for positive numbers.

### 10.5 Colour

Colours 0 to 7 are the Spectrum's: black, blue, red, magenta, green, cyan, yellow, white.
With `BRIGHT 1` in effect, 0 to 7 become their bright versions 8 to 15. Values 8 to 15 name the
bright colours directly. A value of 16 or more is a 24-bit RGB colour (`INK #ff8000`).

| | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| normal | 000000 | 0000D7 | D70000 | D700D7 | 00D700 | 00D7D7 | D7D700 | D7D7D7 |
| bright | 000000 | 0000FF | FF0000 | FF00FF | 00FF00 | 00FFFF | FFFF00 | FFFFFF |

The defaults are ink 0, paper 7, border 7, bright 0. Negative colours are black. `BRIGHT`
applies at the moment something is drawn; changing it later does not recolour the screen.

### 10.6 Character set

Codes 32 to 127 are the 48K Spectrum ROM character set (96 glyphs of 8 × 8 pixels; the
reference data is in `js/font.js`). Codes 128 to 143 are the block graphics: bit 0 lights the
top-right quarter, bit 1 the top-left, bit 2 the bottom-right, bit 3 the bottom-left. Codes 144
to 164 are user-defined graphics, which are fixed to look like the letters A to U. Any other
code prints as `?`.

### 10.7 Lower screen

The lower screen shows, in the permanent ink and paper, either an `INPUT` prompt with what has
been typed and a cursor (code 143), or a report when the program ends: `0 OK, l:s` at the end of
the program (l the last line number, s the statement), or an error report (section 18).

## 11. Graphics statements

These draw into the drawing layer (10.2) in the ink colour, using Spectrum coordinates.

- `PLOT x,y` fills the 1 × 1 pixel at (x, y) and makes it the **pen position**.
- `DRAW dx,dy` draws a line, one pixel wide, from the pen position to (pen + (dx, dy)) and
  moves the pen there. (The Spectrum's arc form `DRAW dx,dy,a` is not supported.)
- `CIRCLE x,y,r` draws a circle outline one pixel wide, as a polygon of max(12, round(2r))
  sides, and puts the pen at (x, y).
- `RECT x,y,w,h` (an extension) fills the rectangle whose bottom-left pixel is (x, y), w pixels
  wide and h tall.

Lines are drawn through pixel centres. *Note*: these statements share the drawing layer's pen
with `FX`; afterwards the `FX` line style is undefined (ZX Flash leaves it unset after `PLOT`
and `RECT`, and one pixel in the ink colour after `DRAW` and `CIRCLE`).

## 12. The drawing API: FX and FXP

`FX` gives BASIC the Flash drawing API on the drawing layer. Coordinates are screen pixels
(10.1). The layer is **retained**: what is drawn stays until `FX "clear"` or `CLS`.

`FX "method", a, b, ...` with these methods:

| method | effect |
|---|---|
| `"lineStyle", w, c, a` | lines from now on are w pixels wide (0 is a hairline), colour c (24-bit RGB), opacity a (0 to 100, default 100). `FX "lineStyle"` with no arguments turns lines off |
| `"beginFill", c, a` | starts a filled shape in colour c with opacity a (default 100); an open fill is ended first |
| `"moveTo", x, y` | moves the pen without drawing; inside a fill it starts a new outline |
| `"lineTo", x, y` | a straight edge to (x, y), stroked if a line style is on |
| `"curveTo", cx, cy, x, y` | a quadratic Bézier edge to (x, y) with control point (cx, cy) |
| `"endFill"` | closes each outline of the open fill back to its start and paints the fill, with its outline strokes on top |
| `"clear"` | empties the layer and turns lines off |
| `"chequer"` | like `beginFill`, with a black-and-white chequerboard of 4 × 4 pixel squares fixed to the screen (the ZX81 grey) |
| `"beginGradientFill"`, `"lineGradientStyle"`, `"beginBitmapFill"` | accepted. Their arguments need Flash objects that BASIC cannot make, so their effect is undefined; an implementation MAY treat them as a solid fill or line in the first colour, or ignore them |

Any other method name is a compile-time error.

**Fill rule**: a fill is painted by the **even-odd rule** over all of its outlines, so an outline
drawn inside another makes a hole. Outlines are closed implicitly at `endFill`.

Strokes are painted in the order they are drawn. A stroke made while a fill is open is
painted after (on top of) that fill. Overlapping parts of one translucent stroke SHOULD NOT
darken twice; an implementation MAY let them.

`FXP "property", value` sets a property of the whole drawing layer, as a transform of
everything in it, past and future, until changed:

| property | meaning | default |
|---|---|---|
| `"_x"`, `"_y"` | offset in pixels | 0 |
| `"_xscale"`, `"_yscale"` | scale in per cent, about the layer origin (0,0) | 100 |
| `"_rotation"` | clockwise rotation in degrees about the origin | 0 |
| `"_alpha"` | opacity of the whole layer, per cent | 100 |

Other property names are undefined. The transform is scale, then rotate, then offset.

## 13. Sprites and emoji

**Definition** (compile time; may appear anywhere and need not be executed):

`SPRITE "name", "row1", "row2", ...` defines a bitmap, one pixel per character. Characters:
`.` and space are transparent; `#` black; `+` grey (808080); `W` white; `0` to `7` the normal
colours; `a` to `h` the bright colours 8 to 15 (`a` black, `h` white). A later definition with
the same name appends rows. Row strings are taken literally (no character set mapping).

`EMOJI "text", "name" [, size]` defines a bitmap of size × size pixels (default 48, clamped to
8..256), rasterised by the host from the text using its colour emoji font. Text with no
pictographic character is drawn as bold outlined lettering (yellow to orange, dark outline),
shrunk to fit the width. The result depends on the host's fonts.

**Drawing**: `SPRITE name$, x, y [, xs [, ys [, rot [, alpha]]]]` adds an instance of the bitmap
to the sprite layer, in front of earlier instances. xs and ys are scales in per cent (ys
defaults to xs, both to 100), rot a clockwise rotation in degrees, alpha an opacity in per cent.
A **SPRITE bitmap** is placed with its top-left corner at screen pixel (x, y), and scales and
rotates about that corner. An **EMOJI bitmap** is placed with its centre at (x, y), and scales
and rotates about its centre. Instances stay until `SPRITE CLEAR` or `CLS`. Drawing an
undefined name does nothing.

Sprite pixels SHOULD be drawn crisp (nearest neighbour); emoji smooth.

## 14. Sound

**BEEP d, p** plays a square wave of pitch p semitones above middle C (261.63 Hz × 2^(p/12)),
with p rounded and clamped to −24..36, for d seconds, then idles (section 9).

**TONE p [, s]** plays a soft chime: frequency f = 261.63 × 2^(p/12) with p rounded and clamped
to −12..24; the waveform 0.8·sin(2πft) + 0.2·sin(4πft) under an envelope min(1, 400t) ·
e^(−14t), lasting 0.22 seconds, at a moderate volume. Chimes may overlap. With s the program
idles for round(50·s) frames.

Sound MAY be silent until the viewer has interacted with the page (browsers require it).

## 15. Input

### 15.1 Keys and characters

Keys are named by the characters they produce. The cursor keys produce codes 8 (left), 9
(right), 10 (down) and 11 (up), as on the Spectrum. Enter is 13, Backspace 8 (only within
`INPUT`), Space 32. Letter keys produce their lower- or upper-case letter.

### 15.2 INKEY$

`INKEY$` is the character of the key held down right now, if any; otherwise the character of
the last key pressed since `INKEY$` was last read (then forgotten); otherwise `""`.

### 15.3 KEY

`KEY s$` is 1 while the key that produces the first character of s$ is held, else 0. Letters
match either case; `CHR$ 8` to `CHR$ 11` are the cursor keys; `" "` is Space; `CHR$ 13` is Enter.
Any number of keys may be held at once.

### 15.4 INPUT

`INPUT` shows its prompt in the lower screen and stops the program until Enter. Printable
characters (32 to 126) are added to the line, Backspace removes the last one. On Enter the line
is assigned to the variable: a string variable takes it as typed; a numeric variable takes
`VAL` of it, or 0 if that is NaN. The lower screen is then cleared and the program continues
with the next prompt or statement. Frames keep counting while it waits.

### 15.5 Mouse and touch

`MOUSEX` and `MOUSEY` give the pointer position in Spectrum coordinates (x left to right, y
bottom to top; values outside 0..255 and 0..175 are possible when the pointer is outside).
`MOUSEB` is 1 while the button is held. A press and release that both happen between two
frames in which the program runs MUST still be seen: `MOUSEB` is 1 in the next frame the
program runs, and `MOUSEX`/`MOUSEY` give the position of that press. Touches count as the
mouse.

## 16. Persistent numbers

`KEEP name$, value` stores a number under a name so that it survives reloading the page.
`KEPT name$` returns it, or 0 if nothing was kept under that name. Kept numbers are shared by all
programs run from the same site. Only numbers can be kept.

## 17. The host

**LOADER [name$]** ends the program and asks the host to open the program called name$, or the
menu when there is no name. What is opened depends on the host: the ZX Flash page opens an
example by its id (`LOADER "miner-ned"`).

**Touch keys**: a line `REM touch: tokens` tells a touch-screen host which buttons to show.
Each token is `name` or `name=LABEL`. A name is a key (`left`, `right`, `up`, `down`, `space`,
`enter`, or a single character) that is held for as long as the button is, and for at least
0.12 s; a name starting with `>` is a whole command to type followed by Enter (`>look=LOOK`;
`_` stands for a space). With no such line a host shows the cursor keys, Space and Enter.

**Play mode**: a host MAY show a program on its own, for embedding (the ZX Flash page does this
with `?play` in its address).

## 18. Errors

**Compile-time errors** (the program does not start) are reported with the source line and
column: syntax errors, type mismatches, `NEXT` without `FOR`, unknown line numbers in literal
jumps, unknown `FX` methods, subscripts of names with no `DIM`.

**Run-time reports** stop the program and appear in the lower screen as `code message, line:statement`:

| report | cause |
|---|---|
| `0 OK` | normal end |
| `7 RETURN without GOSUB` | |
| `9 STOP statement` | |
| `E Out of DATA` | |
| `N Line not found` | computed `GO TO`/`GO SUB` |
| `machine code (USR) cannot run here` | |

Division by zero, square roots of negatives and other numeric faults are not errors (section 3).

## 19. A minimal example

```
10 BORDER 0: PAPER 0: INK 7: CLS
20 PRINT AT 10,8; INK 6; "HELLO, 1982"
30 FOR i=1 TO 50: FX "lineStyle", 1, #ff8000, 60
40 FX "moveTo", 128, 96: FX "lineTo", 128+90*COS (i/8), 96+60*SIN (i/8)
50 NEXT i
60 IF KEY " " THEN BEEP 0.1, 12
70 HALT: GO TO 60
```

## 20. Left to the implementation

- How the program is compiled or interpreted, and how its run is divided between frames,
  within the rules of section 9.
- The sequence of `RND`.
- Exactly how lines and curves are rasterised and antialiased, and how strokes join.
- Out-of-bounds or non-integer subscripts (section 4); reading an unassigned string array
  element in ZX Flash (section 4).
- The effect of `beginGradientFill`, `lineGradientStyle` and `beginBitmapFill`.
- The pen and line style after `PLOT`, `DRAW`, `CIRCLE` and `RECT` (section 11).
- Emoji appearance (fonts).
- Where kept numbers are stored.

## 21. Notes on the implementations (not normative)

**ZX Flash** compiles each line to AVM1 bytecode in one function per *chunk* of the program.
Every line, loop head, `GO SUB` return point and yield is a *resume point*; re-entering the
program walks a chain of resume-point tests from the start of the chunk. `RETURN`, computed
jumps and jumps between chunks re-enter, so their cost grows with the target's distance from
its chunk's start. Programs over 64 KB of bytecode are split into chunks of up to 56 KB,
preferably at section banners (`REM ===`). Backward jumps spend a per-frame budget; when it is
spent the frame continues while it has used less than 14 ms. Sprites and emoji are baked into
the SWF; text is Flash clips per character cell.

**ZX GPU** compiles the program to one JavaScript function holding a `switch` over resume
points, which the browser's JIT compiles to native code. It keeps the screen as data (cells,
a retained display list of fills and strokes, sprite instances) and redraws it each display
frame with WebGPU: fills by stencil-then-cover (an even-odd stencil pass over a triangle fan,
then a covering quad), strokes as triangles, text and paper as textures, sprites as textured
quads, all multisampled. Canvas 2D is the fallback.

**Conformance**: the example programs in `js/examples.js` are the test suite. Each MUST
compile, and run for 600 frames with scripted input without a run-time report other than the
ones its design produces. `gpu/test/` runs them headless.
