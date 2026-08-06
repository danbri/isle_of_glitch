# Physics 2.0 — richer world, same machine

> **Still current.** The engine: where the time actually goes, and what any new physics must obey — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md) for how it
> sits in the world as a whole, and for the measurements behind it.

A design doc for the physics upgrades argued in `WORLDS.md` — per-cell mass,
tag-mediated adhesion, a height field and gravity, real open water, and
(conditionally) a medium with state — **together with the engineering that keeps
them fast at 4.19 M cells.**

**Status: proposed. Nothing here is built.** The measurements are real and were
taken on the current build.

The governing claim of this document: *the physics we want to add is nearly free,
and the physics we already have is nearly all waste.* Adding features and getting
faster are the same project, not opposing ones.

## 1. Where the time actually goes — measured, and not where anyone guessed

Ablation at 4,800 beasts × 60 = **288,000 slots**, one compute pass, no per-step
readback:

| configuration | ms/step | steps/s | attributable cost |
|---|---|---|---|
| baseline | 20.944 | 47.7 | — |
| `contactK = 0` (no contact walk) | 17.240 | 58.0 | contact = 3.70 ms (**18%**) |
| `nMotes = 0` (no mote walk) | 8.782 | 113.9 | motes = 12.16 ms (**58%**) |
| `contestRate = 0` | 21.303 | 46.9 | nil (within noise) |
| `contactK = 0` **and** `nMotes = 0` | 4.595 | 217.6 | both = 16.35 ms (**78%**) |

**The food system costs 3.6× the entire rest of the simulation.** Bonds, muscles,
traction, integration, and the whole CTRNN together are 4.6 ms; motes alone are
12.2 ms.

Two earlier hypotheses are **withdrawn**:

- *"It is dispatch-overhead bound."* It is not. `step(n)` already batches: one
  command encoder, one compute pass, `n × 8` dispatches, one submit. That is the
  right structure and it is not the problem.
- *"Contact is the cost centre."* It is 18%. The comment in `lib/world_gpu.js`
  claiming contact "disappears into the noise" against "~100M edge gathers the
  brains already do each step" is wrong twice over: the brains do ~864k edge
  gathers per step at this size, not 100M, and contact does ~7.8M neighbour tests
  — **9× more than the brain, not less.** Worth fixing in the source comment.

**The real cost is neighbourhood traversal**, and there are four separate 3×3 hash
walks per step (`contact`, the contest pass, the crowding count, and mote
grazing), each doing scattered reads. The step is **memory-latency bound on random
access**, not ALU bound.

That single fact determines every recommendation below.

## 2. The budget

Target: **4,194,304 slots at worldspeed 1** = 66.7 steps/s at `dt = 0.015`, i.e.
**280 M cell-steps/s**.

| what | cell-steps/s | note |
|---|---|---|
| current baseline | ~13.8 M | measured, 288k slots |
| core only (no motes, no contact) | **62.7 M** | measured — physics + brains |
| target | 280 M | 4.5× above the core, 20× above baseline |

So the core simulation is already within 4.5× of target, and the gap is dominated
by two neighbourhood systems, one of which is 58% of everything. **This is not a
"needs a supercomputer" problem.** It is an access-pattern problem, and access
patterns are the cheapest thing in graphics to fix.

We are at roughly **0.1% of this GPU's arithmetic capability**. ALU is free; memory
traffic is everything. Hence the prime directive:

> **Spend ALU. Never spend a scattered load. Never add a neighbourhood walk.**

## 3. The rules any new physics must obey

1. **No new neighbourhood walk.** Walks are 78% of the step. Every new pairwise
   interaction folds into an *existing* walk, reading data already in registers.
   A new force that needs its own 3×3 traversal is rejected on cost alone.
2. **Analytic fields are nearly free; grids are not.** An fbm evaluation is ~40 ALU
   ops against a budget we are using 0.1% of. A grid is bandwidth, which is the
   thing we have none of. This is an *engineering* reason to keep
   `CELLS.md`'s "fields are analytic, not a grid" — it happens to also be the fast
   choice. Deviating from it (§5.5) must be justified against that.
3. **One aligned load per neighbour, not three.** See §4.1 — the single highest-value
   change in this document.
4. **Gather, never scatter.** The existing contact pass is gather-only and therefore
   needs no atomics and is exactly symmetric (`i` and `j` compute equal and opposite
   forces from the same two positions). Keep this property; it is worth more than
   the duplicated arithmetic. Any new force must be expressible as a gather.
5. **Keep the hot buffers narrow.** `pos` is read ~108× per cell per step. It must
   stay `vec2<f32>`; widening it to carry mass or tags would multiply the
   simulation's hottest read.
6. **Uniform work per lane.** Divergence inside a neighbour loop makes every lane in
   a subgroup pay for the fullest bucket. Bucket occupancy should be bounded and
   even, not merely capped.

## 4. The engineering, in priority order

### 4.1 Pack a contact record — the single biggest win

The inner loop of `contact()` currently reads, per neighbour test:

```wgsl
if (cmeta[j].x < 0) { continue; }      // vec4<i32>  = 16 B, uses 4
let d = minImage(pos[j] - p);          // vec2<f32>  =  8 B, uses 8
let touch = myR + vel[j].z;            // vec4<f32>  = 16 B, uses 4
```

**40 bytes fetched from three separate scattered locations to use 16.** At ~108
tests per cell per step this is the dominant memory traffic in the simulation.

Replace with one `vec4<f32>` per cell — `(x, y, radius, packed)` where `packed`
carries the alive flag and the adhesion tag in bit-fields. **One aligned 16-byte
load per neighbour test instead of three loads totalling 40.** A 2.5× bandwidth
reduction on the hottest loop, and — importantly — *it is also where tag-based
adhesion wants to live*. The feature and the optimisation are the same change.

Cost: one extra cheap pass per step to build the record (a coherent, sequential
write), plus 16 B/cell of storage.

### 4.2 Sort the contact record by bucket, so neighbour reads are coherent

Even with §4.1, `hashData` stores arena indices, so the 108 reads land at random
addresses across the whole arena. Neighbours in a bucket are physically adjacent
but memory-distant.

The standard fix is to reorder particles spatially. **We cannot reorder the arena**
— the brain relies on each body owning a contiguous island of slots, and breaking
that invariant would be catastrophic and subtle.

So instead: **rebuild the contact record each step in bucket order**, alongside a
per-bucket offset table (a counting sort, which the hash build is already 90% of
the way to). The physics pass then reads neighbours from a *contiguous run* rather
than 108 random addresses. The arena is untouched; only a 16 B/cell derived copy is
sorted.

This is the classic particle-GPU win and is typically **2–5×** on exactly this
access pattern. It composes with §4.1 multiplicatively.

### 4.3 Fix the mote system — 58% of the step

Not yet diagnosed to a line, and it should be before it is redesigned. The system
runs its own particle set (`nMotes = 40,800` at 1,200 beasts), its own hash, its own
offer/commit dispatches, **and** a third 3×3 walk in the grazing path.

Three candidate treatments, in increasing order of ambition:

- **Apply §4.1 and §4.2 to the mote walk too.** Same pathology, same fix; likely
  recovers a large fraction for little design risk.
- **Fold grazing into the existing contact walk.** Motes and cells are both spheres
  in the same world. If motes lived in the *same* hash as cells, distinguished by a
  flag in the packed field, grazing would cost a branch inside a walk we already
  pay for, instead of a whole traversal. This is rule 1 applied to the thing that
  most violates it, and it is philosophically right as well: `CELLS.md` already says
  a rock, a corpse and a living cell should be the same object.
- **Reconsider whether standing crop needs to be particles at all.** It was made
  particulate so that grazing a patch to nothing was visible and local. That
  requirement is real, but a per-bucket scalar stock would satisfy it at a fraction
  of the cost. This is a world-design change, not just an optimisation, so it needs
  the usual control.

**Do this before adding any new physics.** It is the largest single number in the
budget, and every feature added before it is paid for at inflated prices.

### 4.4 Stop stalling the pipeline on readback

The live server runs at **81 steps/s** where the same configuration benches at
**121** — about a third lost to synchronisation. `readState()` every 5 steps for the
trace, plus `readCells()` per frame, each `mapAsync` and drain the queue.

Fix: double-buffer the staging buffers and accept one frame of latency. Nothing
that reads this data needs it to be the current step — the viewer is a viewport and
the trace is a scope. Also: the trace should not force a readback at all when
nobody is attached.

## 5. The physics upgrades, each with its cost

### 5.1 Per-cell mass — essentially free

`a = F/m`: one multiply by `invMass` in the integrator. Store `invMass` in the
per-cell material buffer, read **once** per cell per step in the physics pass (not
in any neighbour loop). **Cost: ~1 scattered load per cell per step and one
multiply — under 0.2% of the step.**

Two correctness notes that matter more than the cost:

- The frictional and traction decays are `exp(−k·dt)` on velocity, which are
  mass-independent by construction. That is *right* for Coulomb-style traction but
  means grip does not automatically scale with weight. Decide deliberately whether
  a heavy cell should grip harder; `grabbiness × mass` is the physical answer and it
  is one more multiply.
- The medium drag `(flow − v)·drag` becomes `(flow − v)·drag·invMass`, which is what
  makes a heavy cell resist the current and a light one become plankton. **This is
  the point of the feature** — it turns the flow field into an affordance that
  distinguishes bodies, which `REGIME.md` argues is exactly what a single global
  drift fails to do.
- Keep `invMass` rather than `mass`: it removes a divide from the hot path and makes
  immovable matter (`invMass = 0`) free — which is how you get rocks, walls and
  fixed obstacles with no new code path.

### 5.2 Tag-mediated adhesion and repulsion — free, if it rides §4.1

The request is gentle repulsion between some cell pairs so colocated beasts
disentangle. **It must not branch on cell type** — that is the same argmax-on-a-
discrete-label mistake that is currently discarding 47% of the world's contractile
capacity (`DEVELOPMENT-2.md` §5).

The lawful form is already in `primitives.md`: a continuous `tag`, with the contact
force modulated by tag agreement.

```wgsl
// inside the EXISTING contact loop, on data already loaded by §4.1
let affinity = tagMatch(myTag, rec.packed);        // −1 repel … +1 adhere
force -= dir * (touch - dist) * P.contactK;        // existing exclusion
force += dir * affinity * P.adhesionK * falloff;   // new, one extra term
```

Cells of one body share tags and cohere; strangers repel and separate. **Cost: a
few ALU ops inside a loop we already pay for, and zero extra memory traffic**,
because the tag arrived in the same 16-byte load as the position. No new walk.

This also delivers, for free, the attachment rule that link-cells will later need
("glued to whatever it touches" — `CELLS.md`), and the adhesion axis `primitives.md`
has always specified and never had.

Discipline: adhesion must be dissipative or conservative, never generative. A
sticky bond that releases more energy than it took to form is minting.

### 5.3 Height field and gravity — free, and the largest structural gain

Gravity as an in-plane force `−∇height`, i.e. a tilted plane, giving slopes,
basins, watersheds, rivers and mass-sorting without leaving the top-down view
(`WORLDS.md` §3).

`height` is one more analytic fbm field. The gradient is either an analytic
derivative or a 4-tap central difference — **~4 extra fbm evaluations, ~160 ALU
ops, zero memory traffic.** Against a budget we are using 0.1% of, this is
indistinguishable from free, and it is the single largest increase in world
structure available.

It composes exactly with §5.1: gravity acts on mass, so `F_gravity = −∇height ·
mass` and `a = F/m` cancels to `−∇height` for a free-falling cell — heavy and light
fall alike, as they should, while heavy cells resist *drag* and light ones do not.
That is the correct and interesting asymmetry.

Cache the gradient per cell per step in the physics pass; do not recompute it in a
neighbour loop.

### 5.4 Real open water — free, it is a parameter

`REGIME.md` measured minimum grit at 0.151, so the water/land horizon
`primitives.md` describes does not physically exist anywhere in the world. Letting
grit and drag actually reach zero over some region is a change to the field's
distribution — **no new code, no new cost** — and it is what makes inertia visible,
since inertia only shows where it is not immediately bled away.

Do this early. It is the cheapest test of whether the mass work (§5.1) did anything.

### 5.5 A medium with state — the expensive one, and cheaper than it sounds

Required for jellyfish, fish, wakes and drafting; unavailable by construction today
(`WORLDS.md` §2). This is the one item that breaks rule 2, so it needs a real cost
model rather than a verdict.

**Counter-intuitive finding: a fluid grid is coherent, and coherence is what we are
short of.** A 512² velocity field is 262k cells × 8 B = 2 MB, updated with
*sequential, cache-friendly, perfectly-parallel* access — the opposite of the
scattered particle work that is currently eating the frame. The grid update is
plausibly cheaper than the mote system it would sit beside.

The genuinely expensive part is **particle → grid scatter**, which needs atomics and
is the one place rule 4 cannot hold. Mitigate by scattering at low resolution and
by depositing only from cells whose motion is significant.

**Recommendation: a momentum-diffusion field, not incompressible Navier–Stokes.**
Skip the pressure projection. Projection is 20–40 Jacobi sweeps per step (the bulk
of a fluid solver's cost) and buys incompressibility, which we do not need — what a
swimmer needs is that momentum given to the medium is *conserved, transported and
dissipated*, not that the medium is divergence-free. A diffusion-advection field
conserves **by construction**, which is also far easier to defend against the
friction law than a projected solver whose conservation is a property of the
numerics.

Explicitly: cells add momentum to the field, the field advects and diffuses it, the
field pushes cells (the existing `(flow − v)·drag` term, now reading a stateful
field instead of a formula), and momentum decays to heat. What a cell takes, the
medium loses.

Ontological cost, to be accepted knowingly: `CELLS.md` says fields are analytic and
not a grid. A stateful medium cannot be analytic — remembering is its entire
purpose. This is an amendment to that document, not an oversight, and it should be
recorded there if adopted.

**Gate it behind a flag and keep the analytic path.** Most worlds do not need a
fluid; the starter worlds (`WORLDS.md` §5) mostly do not. A world that does not
enable it should pay nothing.

### 5.6 Link-cells — deferred, and the reason is quantitative

`CELLS.md` proposes links become cells (segment geometry, two endpoints, rigidity,
signal propagation). Right idea; the cost is that it roughly **triples the entity
count** at the exact moment entity count is the binding constraint, and it puts
stiff constraint chains into the part of the kernel with a history of NaN cascades
and parametric resonance.

Revisit after §4.1–§4.4 land. If those recover the expected 4–10×, link-cells become
affordable rather than reckless. Meanwhile §5.2 gives them their attachment rule in
advance, so the ground is prepared.

## 6. Sequencing

1. **Fix the motes (§4.3).** 58% of the step. Everything is cheaper afterwards.
2. **Pack and sort the contact record (§4.1, §4.2).** The largest structural win,
   and it is a prerequisite for tag adhesion being free.
3. **Un-stall the readbacks (§4.4).** Recovers ~⅓ of the live server immediately.
4. **Mass, tags, height, open water (§5.1–§5.4).** All nearly free once 1–3 land,
   and together they are most of the world's new structure.
5. **Re-benchmark and decide about the fluid (§5.5)** with a real number in hand
   rather than an estimate.
6. **Link-cells (§5.6)**, if the budget allows.

Note that steps 1–3 are pure engineering with **no effect on the world's
behaviour** — which means they can be verified by an exact-reproduction test:
same seed, same steps, bit-comparable trajectories before and after. That is a much
stronger acceptance criterion than any population statistic, and it should be
written before the optimisation, not after.

## 7. Acceptance tests

- **Optimisation (steps 1–3):** identical trajectories from an identical seed, and
  a throughput table like §1 showing where the time went. No world-behaviour claim
  is needed or permitted.
- **New physics (steps 4–5):** each feature gets a **starter world** (`WORLDS.md`
  §5) that demonstrates it visibly and cheaply — marbles in a bowl for mass and
  gravity, the scree slope for mass sorting, the tunnel for open water, a pulsing
  bell for the fluid. A lifeless world with an obvious correct behaviour is the
  fastest instrument this project has, and several of its worst bugs (cells with
  radius 0, bonds drawn between unrelated cells, NaN cascades) would have been
  caught instantly by one.
- **Anything touching energy:** the friction-law check from `primitives.md` — every
  term traces to the sun and loses to heat — plus a conserved control, per
  `AUTORESEARCH.md`. Adhesion (§5.2) and the fluid (§5.5) are the two that can mint,
  and both must be shown not to.
