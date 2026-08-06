# Worlds — the medium, the scale, and a library of starter worlds

What the physics currently *is*, what it therefore cannot represent, and the
decisions upstream of `DEVELOPMENT-2.md`. Companion to `REGIME.md`, which
establishes the locomotion regime, and `primitives.md`, which is the schema any
addition here must remain a row of.

## 1. What the physics actually is

Worth stating plainly, because the question "could we make jellyfish?" has a
precise answer and it is not obvious from the code.

Every cell is a sphere (`cellR = 0.34`) with a position and a velocity. Each step:

```
force  =  bond springs (rest length driven by muscle contraction)
       +  bond dampers along each bond
       +  contact repulsion with everything nearby      (linear in overlap)
       +  (flowAt(p) − v) · drag                        (the medium)
v      =  clamp( (v + force·dt) · damp )                (damp 0.986)
v      =  anisotropic frictional decay about the body axis, exp(−k·dt)
p      =  p + v·dt                                       (toroidal wrap)
```

So: **inertia already exists.** `v` integrates force and `p` integrates `v` — this
is a second-order system, and `REGIME.md` measured that bodies genuinely coast
between strokes (drag time constants 0.048–0.55 s against gait periods a brain can
generate). What does *not* exist is **variable mass**: there is no division by `m`
anywhere, so every cell has mass exactly 1.

**There is no gravity at all.** The world is a top-down plane.

**The medium has no state.** `flowAt(p)` is an *analytic function of position* —
curl noise, evaluated on demand. The flow pushes cells; **cells never push back.**

## 2. Could we make jellyfish? Swimmy-the-fish?

**No, and not by improving the animals — by construction.**

Jellyfish propulsion is momentum transfer to a fluid: the bell contracts, pushes
water backwards, sheds a vortex ring, and takes the reaction. Fish undulation is
the same trade in a different shape. Both require a medium that *has momentum*, can
*receive* it, and *carries it away*.

Our medium is a formula. It has no momentum to receive. A body that contracts and
pushes "water" changes nothing about the water, so there is no reaction force and
no thrust. This is `REGIME.md`'s route 1, and it is unavailable **by construction**
— no amount of evolution or development will find it, because the physics contains
no term through which it could exist. Also absent for the same reason: wake
recapture, burst-and-coast, clap-and-fling, drafting, added mass.

What *is* available, and what our creatures therefore are:

- **Route 2 — anisotropic drag.** A cell slides along its own body axis more easily
  than across it, and the anisotropy is modulated by the cell's activation, so a
  brain can grip on the power stroke and release on recovery. This is the sandfish,
  the nematode, the snake's scales, the caterpillar. It works, and it is measured
  at 151× above its isotropic control.
- **Route 3 — non-reciprocal kinematics**, plus genuine coasting because we are not
  in the Stokes limit.

**Our creatures crawl on a gritty plane. They do not swim.** `swim.html` is
misleadingly named.

### The lawful route to jellyfish, and its real cost

Give the flow field **state**: a momentum field that cells add to and take from,
conserved, advected and diffused. Then a contracting bell genuinely pushes fluid,
genuinely takes the reaction, and genuinely sheds structure that something else can
exploit later. Jellyfish, fish, wakes and drafting all become *reachable* rather
than declared.

Two costs, both real:

1. **It requires a grid**, and `CELLS.md` is explicit that our fields are
   "continuous, analytic, sampled at a position — **not a grid**." A stateful fluid
   cannot be analytic, because its whole point is that it remembers. This is an
   ontological amendment, not an addition, and it should be made deliberately.
2. **`REGIME.md` warns it must not become minting.** A "kinetic energy accumulator"
   added until bodies move is the exact failure this project retracts. A momentum
   field is lawful only if it *conserves* — what a cell gives, the fluid takes, and
   it dissipates to heat like everything else.

2D is not a blocker at moderate Reynolds number (2D turbulence is a real and
well-studied regime). It *is* a blocker in the Stokes limit — Stokes' paradox says
steady 2D flow past a cylinder at zero Re has no solution — so a fluid here should
be run at moderate Re, not micro-swimmer Re. Note also that helical/flagellar
propulsion has no 2D analogue at all and never will.

**This decision is upstream of Development 2.0.** An elongated crawler and a
radially-symmetric pulsing swimmer are different animals with different body plans.
Designing a developmental system before deciding which one the world rewards is
building toward an unknown target.

## 3. Mass, heavier cells, and why everything feels microscopic

The intuition that everything is small and inertia-free is half right, and the
diagnosis is useful.

**It is not that the world is microscopic.** Bodies coast; `REGIME.md` measured it.
The world is ~420 cell-diameters across and bodies are ~7 cells across.

**It is that the world is overdamped and uniform.** `drag = 1.6` pulls every cell
toward the local flow, `damp = 0.986` bleeds velocity with a ~1.07 s time constant,
and frictional decay is stronger still. Every cell has the same mass, so nothing is
ever *ballistic relative to its neighbour*. Inertia is present but never
*differential*, and undifferentiated inertia is invisible — it makes no
distinction between bodies, which is the same defect `REGIME.md` identifies in a
single global drift.

Two changes make inertia visible without billions of cells:

**(a) Per-cell mass from a `density` material axis.** Already specified in
`primitives.md` (`mass = f(density)`, `density`/`waterSaturation` listed as
material axes) and never built. Mechanically it is `a = F/m` — one division in the
physics kernel plus a developed property. It is lawful (a material property, not a
behaviour), it carries its own tradeoff (dense = slow to start, hard to stop, hard
to blow off course, expensive to build, a richer meal; light = nimble and
vulnerable), and it makes the flow field an **affordance**: a heavy cell resists
the current where a light one is plankton. That is `REGIME.md`'s "diverse frames of
reference" delivered as a material property rather than a map feature.

**(b) Regions with much lower drag.** Inertia shows up where it is not immediately
bled away. `REGIME.md` already notes that minimum grit is 0.151 and so "there is no
open water anywhere" — the water/land horizon `primitives.md` describes does not
physically exist. Let grit and drag actually reach zero somewhere and coasting,
ballistic collisions and momentum-trading become real in that region.

**Gravity without leaving the top-down plane: a height field.** Marbles rolling
implies a "down", which a top-down world does not have — apparently forcing a
side-on view and a large ontological change. It does not. Add a scalar **`height`**
field alongside `grit`, and let gravity be the in-plane force `−∇height`. This is a
*tilted plane*, and it gives, from one analytic field and the existing machinery:

- slopes that things roll down, at a rate set by their mass and grip
- basins where matter and energy pool
- ridges and watersheds that structure the world into places
- rivers, since flow follows `−∇height`
- a genuine reason for a heavy cell to be somewhere different from a light one

No grid, no new ontology, no side view, and it composes with (a) exactly as it
should: mass is what gravity acts on. This is the cheapest large increase in world
structure available to us.

## 4. Scale — an engineering problem, not a design limit

Target: **16,384 beasts × 256 cells = 4,194,304 cell slots**, at **worldspeed 1**
(real time; 66.7 steps/s at `dt = 0.015`).

Measured on this laptop (the current Deno/WebGPU build, no per-step readback):

    beasts  maxCells    slots    ms/step   steps/s   ×realtime   cell-steps/s
      1200        60    72,000     8.259     121.1      1.82          8.7 M
      2400        60   144,000    20.696      48.3      0.72          7.0 M
      4800        60   288,000    36.554      27.4      0.41          7.9 M
      4800       128   614,400    43.888      22.8      0.34         14.0 M
      8000       128 1,024,000    85.202      11.7      0.18         12.0 M

Throughput asymptotes around **12–14 M cell-steps/s**. Extrapolated to 4.19 M
slots: ~2.9 steps/s, or **0.04× realtime** — about 23× short of worldspeed 1.

**This is not a reason to shrink the world.** 12–14 M cell-steps/s is roughly
**0.1% of this GPU's arithmetic capability**. At a few hundred FLOPs per cell-step
that is ~4 GFLOP/s against a multi-TFLOP/s device. The simulation is nowhere near
compute-bound; it is bound by per-dispatch overhead (several kernel launches per
step through Deno's WebGPU, which is a thin and not especially fast path) and by
the spatial-hash contact pass. The fixed-overhead component is visible in the table
— throughput is *worse* at 72,000 cells than at 1,024,000.

So worldspeed 1 at 4.19 M cells needs ~280 M cell-steps/s, which is ~20× the
current asymptote and a small fraction of the hardware's ceiling. That is an
optimisation and platform problem — native compute backend, batched dispatches,
fewer synchronisation points, a better neighbour structure, and serious hardware
rather than an ageing laptop. **The laptop and the phone are viewers, not the
design constraint.** Nothing about the target scale is physically unreasonable; the
current engine is simply far from the metal.

Two consequences to design around now, before they are expensive:

- **Browser-side buffers will not fit.** At 4.19 M slots the bond table alone is
  ~268 MB and each brain edge table ~200 MB, against a browser's default 128 MiB
  storage-buffer binding limit (this Mac's Deno adapter reports 4 GiB, so the
  *server* is fine). `world.html`'s standalone in-page simulation cannot run at
  target scale and should stop pretending it can; the watch path (frames of live
  cells only) is the one that scales.
- **Link-cells triple the entity count.** The proposal in `CELLS.md` is right, and
  this is the budget it lands on. Sequence it after the engine work.

## 5. A library of starter worlds

The idea: a world designer with **no living stuff at all** should be able to make
marbles, rivers, howling windy tunnels — and those should ship as a small library
alongside the genetics.

This is a good idea for a reason beyond pleasure: **it is the honest test of
whether the primitives are actually general.** If "a river" can only be made by
adding a river feature, then the fields are not primitive enough. If it falls out
of `height`, `grit` and `flow` composed, they are. A starter world is a
falsification test for `primitives.md`, and it costs almost nothing to run because
it needs no evolution, no genome and no measurement — just the kernel and a config.

It is also the cheapest possible **physics regression suite**. A world of marbles
in a bowl has an obvious correct behaviour, and a build that gets it wrong is
broken in a way no population statistic would have surfaced. Several of this
project's worst bugs (cells with radius 0, bonds drawn between unrelated cells,
NaN cascades) would have been caught instantly by a lifeless world that visibly
misbehaved.

Sketches, all from existing or proposed fields — no new primitives:

| world | fields | what it shows |
|---|---|---|
| **marbles in a bowl** | `height` = paraboloid, low `grit`, no `flow` | gravity, mass, inertia, contact — settles into a pile |
| **the river** | `height` = valley, `flow` down-gradient, high `grit` banks | transport; matter carried and deposited |
| **howling tunnel** | `grit` ~0 in a channel, strong `flow` along it | a medium-relative frame: nothing can hold station |
| **the scree slope** | `height` = ramp, mixed `density` matter | mass sorting — heavy and light separate on their own |
| **tide pool** | basin, oscillating `flow`, `grit` high at the rim | a periodic world; somewhere to be swept into and not out of |

Each is a config, a screenshot and a one-line expectation. The library's job is to
be *looked at* — the fastest instrument this project has for "the physics is
wrong", which is otherwise only visible through statistics that take hours.

Note that `height` and per-cell mass are prerequisites for the interesting half of
this table, which is a further argument for §3.

## 6. Conway's Life as a scale guide

We are continuous and not a discrete grid, but Life is the best-calibrated
intuition available for *how big a pattern has to be before it does something
interesting*, and it is worth borrowing rather than guessing.

| Life object | live cells | what it does |
|---|---|---|
| blinker | 3 | oscillates |
| **glider** | **5** | **translates** |
| lightweight spaceship | 9 | translates, faster |
| Gosper glider gun | 36 | emits gliders forever — open-ended output |
| puffer / rake | ~50–100 | travels *and* leaves structure behind |
| OTCA metapixel | ~64,000 (2048² box) | simulates one Life cell, in Life |
| Gemini (self-replicator) | ~846,000 | builds a copy of itself |

Five things this calibrates, one of which settles an open question:

1. **Our bodies are not too small to move — this is decisive.** A glider translates
   on **five cells**. Our median body is **33** and does not move. Size is therefore
   *not* the explanation, and "we need more cells before anything can locomote" is
   ruled out. It corroborates the measured blockers — the argmax rule deleting 47%
   of contraction, the latched CTRNN, the round morphology — over any scale
   hypothesis. Fix the mechanism; do not wait for the fleet.

2. **256 cells per beast is well judged.** It sits above the glider gun (36 cells,
   already open-ended output) and in the puffer band, and far below the
   self-replicator scale. That is exactly the range where a thing can have parts, a
   rhythm and a persistent output without needing to be a universal constructor.

3. **Empty space is a resource and we are short of it.** Life's interesting objects
   live at a few percent density, and a glider needs vacuum to travel through. We
   run at ~17% areal coverage, with bodies interpenetrating and tangling — which is
   exactly what the repulsion request is about. **Scaling the population must scale
   the arena harder than it currently does.** `bound` presently tracks √beasts,
   which holds density fixed only if cells-per-beast is fixed; taking that from 60
   to 256 raises density 4.3× unless `bound` tracks √(beasts × cellsPerBeast).
   For the target that is a bound of ~1,090 rather than the ~525 that scaling by
   beasts alone would give. Going *below* current density would be better still.

4. **Complexity is found, not designed.** Gosper's gun was found by a search with a
   prize attached, not derived from theory. That is an argument for large
   populations and for the autoresearch loop, and against hand-authoring body plans
   — including against hand-tuning Development 2.0 until it makes a shape we like.

5. **The cautionary half.** Life reaches universal computation with no energy, no
   conservation and no metabolism. We have all three, deliberately, and they are
   what make this an ecology rather than a puzzle. They also mean our patterns must
   *pay for themselves*, which Life's never had to. So the Life numbers are a
   **floor on the complexity required**, not a promise that it is reachable here.
