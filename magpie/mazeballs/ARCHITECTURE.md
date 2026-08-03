# Where the work happens, and why

Three surfaces can run this world, and the differences are not preferences.

| | zero readback | survives tab close | many viewers | exists |
|---|---|---|---|---|
| browser alone (`/world.html`) | yes | no | no | yes |
| Deno server + browser viewport (`?watch=1`) | no, ~1 MB/frame | yes | yes | yes |
| native Rust + wgpu | yes | yes | needs building | no |

**The browser alone is the fast path.** Compute and render share one GPU device,
so positions never leave the GPU — the vertex shader reads the same buffer the
physics kernel wrote. Nothing is faster than this, including anything in Deno.

**The server exists for persistence, not speed.** One process steps the world
forever, nobody has to be watching, and several people can watch at once. That
costs a round trip: GPU to CPU, over HTTP, back onto the viewer's GPU.

## Why the round trip is forced

Deno's WebGPU has compute but **no surface**. There is no window and nothing to
present to, and no API is exposed for creating one. So a persistent headless run
must be in Deno and the drawing must be somewhere else. It is not a choice that
was made; it is the only split available.

Deno FFI does not rescue it either. A shim could open a window, but Deno's
`GPUDevice` cannot be handed across FFI, so the shim would have to own the device
— which means moving the simulation into the shim, at which point it is a native
application and Deno is a launcher.

## What the round trip costs

Per frame, at 48,000 cell slots:

    pos     375 KB   needed
    act     188 KB   needed
    type    188 KB   changes only on birth or death
    energy  188 KB   NEVER READ BY THE RENDERER
    bonds  ~240 KB   changes slowly

About 1 MB, and 25 MB/s at 25fps. It also ships every slot including the ~23,000
dead ones. Roughly 4x is available without touching the architecture: drop
energy, send only live cells, quantise positions to i16 against the world bound.
The GPU-to-CPU readback stalls the pipeline briefly each frame, which does not
matter at 4 steps per frame and would at 60.

## A native port, if it is ever wanted

Rust with wgpu gives one device doing compute and render, headless by default and
fullscreen when asked — the screensaver shape. The port is smaller than it
sounds because **the WGSL moves over unchanged**; that is what WGSL being
portable buys. Only the orchestration (`lib/evolve.js` and the buffer plumbing,
around 500 lines) becomes Rust.

Deferred deliberately: it is a rewrite of working code for an ergonomic gain, and
snapshots already give most of what it promises. A world saved to disk can be
resumed by this server, read by a script, or picked up by a native build later,
so where it runs is already independent of where it is watched.

## WASM would not solve the duplication problem

The tempting argument is that porting the JS to WASM gives one implementation for
Deno and the browser. It does not help, for a reason worth writing down:

**`lib/*.js` already runs byte-identical in both.** Same files, no copies. The
duplication in this project is not between two JS surfaces — it is between JS and
WGSL, CPU and GPU. WASM cannot run on the GPU, so a port yields one WASM
implementation PLUS the WGSL one. Same drift, extra build step.

The duplication is real and has cost this project three times (see RESEARCH.md).
The answer is not a shared language but an enforced check: `lib/field_cpu.js` is
the single JS mirror of the shader's field functions, and `lib/field_cpu_test.js`
compiles the real WGSL, runs it on a GPU over 4096 points, and fails if the two
disagree. Drifting one constant by 0.5% on the JS side fails it immediately.

A duplicate that is checked is a cache. A duplicate that is merely intended to
match is a bug waiting for a maintainer to forget.
