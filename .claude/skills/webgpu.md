---
name: webgpu
description: WebGPU/WGSL failure modes that are silent by default — shaders that never compile, buffers that quietly disagree, limits that differ between Deno and Chrome, and what actually costs time on the GPU. Read before touching a shader or a uniform block.
---

# WebGPU, and the failures that do not announce themselves

Everything here was paid for in this repository. The unifying property: **WebGPU
almost never throws where the mistake is.** It produces plausible-looking output,
or nothing, and the error surfaces somewhere else entirely — or not at all.

Run `deno run -A magpie/mazeballs/tools/wgsl-lint.mjs` before restarting the
server after any shader edit.

---

## 1. A shader that fails to compile does not throw

`createShaderModule` **succeeds** on invalid WGSL. The pipeline built from it is
quietly invalid, and every frame thereafter logs:

```
[Invalid RenderPipeline (unlabeled)] is invalid due to a previous error.
```

— hundreds of times, never naming the previous error, with no line number. The
visible symptom is a blank canvas or, worse, a canvas that still shows the last
good frame at a suspiciously high frame rate.

**Always read `compilationInfo`:**

```js
const module = dev.createShaderModule({ code: SRC, label: 'render' });
module.getCompilationInfo?.().then(info => {
  for (const m of info.messages) {
    if (m.type !== 'error' && m.type !== 'warning') continue;
    const line = SRC.split('\n')[m.lineNum - 1] ?? '';
    console.error(`[${m.type}] ${m.lineNum}:${m.linePos} ${m.message}\n  ${line.trim()}`);
  }
});
```

Do this for **every** module, not just the one you are editing. A mote shader
failing looks exactly like a render shader failing.

## 2. A backtick in a shader comment ends the shader

Shaders live in JS template literals. Writing `` `f` `` in a WGSL comment —
the natural way to quote an identifier in prose — terminates the string. The
file then fails to parse with `Unexpected identifier 'f'`, pointing at the
comment rather than at the string it broke, and **the page does not boot at
all**: a 300×150 default canvas and an empty HUD, which reads as a WebGPU
failure and is a punctuation error.

This has happened three times. Do not write backticks inside shader source.
`tools/wgsl-lint.mjs` checks for it.

## 3. `fwidth` / `dpdx` / `dpdy` require uniform control flow

Screen-space derivatives may only be taken where every lane in the quad agrees
it is executing. Any of these makes a block non-uniform:

- a branch on a value derived from the fragment's own position
- an **early `return`** anywhere above the call, even for an unrelated reason

Adding one early-out for performance can therefore break an antialiasing call
fifty lines below it, with the error naming both locations.

**The fix is to compute the pixel footprint on the CPU and pass it in.** It is a
property of the *camera*, which is uniform by construction:

```js
dv.setFloat32(OFF, 1 / pxPerWorld, true);   // world units per DEVICE pixel
```

```wgsl
let aa = max(C.pxWorld, 1e-5);              // instead of fwidth(x)
```

If you know the world-space gradient of the quantity — often you already do —
the exact screen-space width is `length(grad) * C.pxWorld`. Same number, no
derivative, legal anywhere.

## 4. Uniform-block offsets are just numbers, and nothing type-checks them

A `DataView` offset has no type to disagree with. In this repo a field was
renamed away but its writer line survived; offset 92 had since become
`contactK`, the contact stiffness. The `u32` 12 sitting in those bytes reads as
the `f32` **1.68e-44** — positive, so the `<= 0` guard never tripped, and every
contact force in the world was multiplied by a denormal. **Cells did not collide,
for the entire life of the code, and nothing reported an error.**

**Generate both sides from one declaration** (`lib/uniform.js`): the WGSL struct
and the JS writer come from the same table, so nobody writes an offset. Also
refuse to publish a block containing a missing or non-finite value — the other
half of the same bug was a field with no default anywhere.

When adding a field, change **three** things or none: the declaration table, the
mirrored struct in any *other* shader that binds the same buffer, and the
buffer's `size` at creation. A struct larger than its buffer is a validation
error; a struct smaller is silent garbage.

Careless string-replace edits will happily corrupt a struct — a comment ending
up on the wrong member is enough to leave a field undeclared, giving
`struct member X not found` from a line that looks correct.

## 5. Storage-buffer limits differ by *stage*, and by *runtime*

`maxStorageBuffersPerShaderStage` is guaranteed **8**. Chrome commonly allows 10
in compute; the Deno adapter reported **31**.

A shader binding an 11th storage buffer **fails to create its bind group layout
in Chrome and runs happily in Deno.** That asymmetry is why it reached a user
rather than a test: headless smoke tests all passed. The symptom in the browser
was a dead brain — no exception, no message.

**Pack, do not raise.** Two buffers that are always read together become one
(`x = index bitcast to the float slot, y = value`); flags and small quantities go
into bit-fields of something already being read.

## 6. Read-then-write in the same dispatch is a race, not a bug you can see

If pass A reads `energy[j]` for neighbours *and* writes `energy[i]`, the result
depends on thread order. It will look fine. It will not be reproducible from a
seed, which quietly destroys every measurement built on it.

Write to scratch, then publish in a second dispatch. One extra dispatch and no
extra buffer is a cheap price for determinism.

Similarly: **gather, never scatter.** A gather-only pass needs no atomics and is
exactly symmetric — `i` and `j` compute equal and opposite forces from the same
two positions. That property is worth more than the duplicated arithmetic.

## 7. What is actually slow: memory, not arithmetic

Measured on this project's kernel at 288k cells:

| what | share of the step |
|---|---|
| the food system's neighbourhood walk | **58%** |
| the contact walk | 18% |
| everything else — physics, bonds, muscles, the entire CTRNN | 22% |

The step is **memory-latency bound on random access**. We were at roughly 0.1%
of the GPU's arithmetic capability.

> **Spend ALU. Never spend a scattered load. Never add a neighbourhood walk.**

Consequences worth internalising:

- **Analytic fields are nearly free; grids are not.** An fbm is a few dozen ALU
  ops. A grid is bandwidth, which is the thing you have none of.
- One aligned 16-byte load per neighbour beats three scattered loads totalling
  40 bytes to use 16.
- Keep the hot buffers narrow. `pos` is read ~108× per cell per step; widening
  it to carry mass or tags multiplies the hottest read in the simulation.

## 8. …except in fragment shaders, where ALU is not free at all

The prime directive above is about *compute over particles*. A full-screen
fragment pass runs at millions of invocations, and the arithmetic budget flips.

Real numbers from this repo: switching value noise → Perlin (8 hashes per
lattice cell instead of 4) and adding a domain warp plus a ridge term took the
background to ~30 fbm evaluations per pixel. At dpr 2 that is ~5 megapixels of
it. **The browser ate the GPU and the simulation sharing the device fell from
~100 steps/s to 47.**

Three fixes, in order of value:

1. **Render scale.** Fragment cost is quadratic in it. 0.7 is a little over
   twice as cheap, on a smooth field drawn with antialiased quads, and the
   difference is hard to see. Expose it — the right value depends on the machine
   and on whether anyone is watching.
2. **Early-out on region.** Do not shade pixels that will be dimmed to nothing.
   A third of a typical frame was fully shaded and thrown away.
3. **Let LOD actually skip work.** A fixed-bound octave loop that weights
   unwanted octaves to zero costs full price. If the octave count comes from the
   **uniform block** it is identical for every lane, so an early `break` is
   perfectly uniform — no divergence to avoid, and a 3× saving when zoomed out.
   (Note the interaction with §3: adding early-outs can invalidate `fwidth`.)

And do not recompute what is already in a register: the same flow vector was
being derived twice in one fragment, ten fbm evaluations to arrive at a number
two dozen lines above.

## 9. Anti-aliasing is a correctness problem, not a cosmetic one

Summing noise octaves finer than a pixel does not draw detail, it draws
aliasing — a smooth field renders as television snow. Band-limit to the octave
that reaches your pixel size; the simulation always wants full detail, because a
particle samples at a point and there is nothing to alias against.

Make the octave count **fractional**. An integer count snaps as the camera
moves, so detail pops into existence at threshold zooms and the world visibly
changes when only the view did. Fade the finest octave in by weight instead.

For the same reason, anything drawn on a lattice — arrows, contours, motes —
should be fixed in **world** units with spacing snapping by powers of two, not
fixed in screen units. Screen-fixed features slide under the zoom, which reads
as the field itself moving.

## 10. Debugging checklist, in order

1. Read `compilationInfo` for **every** shader module.
2. Run the backtick lint.
3. Check buffer `size` against the sum of the struct's members.
4. Check the struct is mirrored identically in every shader binding that buffer.
5. Count storage buffers per stage; assume the limit is 8, verify against 10.
6. Test in **Chrome**, not only in Deno — the limits genuinely differ.
7. Suspect a race before suspecting the maths if a result is not reproducible
   from its seed.
