# hoxpox

The portable core of the mazeballs world. Pure functions over explicit state,
with no GPU, no DOM, and no hidden globals — so the same logic runs in Deno, in
a browser, and (via WASM) from Rust.

## Why it exists

The simulation runs on the GPU in WGSL, and the CPU side decides birth, death,
mutation and allocation. That CPU logic had begun to exist in several places at
once: once in `lib/`, again hand-copied into a test, again approximated in an
analysis tool. Copies drift. In this project they drifted three times and each
drift produced a wrong result that was believed for a while.

`hoxpox` is the one place that logic lives. It is written twice on purpose — once
in JavaScript and once in Rust — and the two are checked against each other by
tests rather than trusted to match.

## Shape

**Functional core, imperative shell.** Everything here is pure: state goes in,
new state comes out, nothing is mutated that the caller did not hand over, and
nothing is read that was not passed. The effectful parts — uploading to GPU
buffers, writing snapshots, serving HTTP — live outside and call in.

**Randomness is threaded, not ambient.** Every function that needs entropy takes
an RNG state and returns the advanced one alongside its result:

```js
const [child, rng2] = mutateGenome(parent, params, rng1);
```

This is the discipline that makes a run reproducible from a seed, and it is the
first thing lost when a module reaches for `Math.random()`.

**State is plain and flat.** Typed arrays and plain objects, no classes, no
prototypes, nothing that cannot cross a WASM boundary or be written to a file.
Where a hot path must mutate in place for speed, it takes the buffer to write
into as an explicit argument, so the effect is visible in the signature.

## Modules

| module | holds |
|---|---|
| `hoxpox/rng` | the seeded generator, as pure state transitions |
| `hoxpox/field` | the analytic noise, flow and resource fields |
| `hoxpox/genome` | what descent copies, and how mutation changes it |
| `hoxpox/arena` | contiguous slot allocation, birth and death |
| `hoxpox/select` | who divides and who starves, as a pure decision |

## The WASM half

`rust/` mirrors `src/` and compiles to `wasm/`. JS imports the WASM build when it
is present and falls back to the JS implementation when it is not, so the package
is usable without a Rust toolchain.

The two are held together by tests that run both and compare, not by intent.
