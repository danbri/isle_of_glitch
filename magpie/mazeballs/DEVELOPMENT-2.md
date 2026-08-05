# Development 2.0 — a GRN in an egg

A design sketch and its critique. **Nothing here is built.** This document exists
so the argument happens before the code, and so the reasons survive the build.

Companions: `eggs.md` (why a container is required at all), `METHODS.md`
(brain-is-body, one encoding grows every tissue), `primitives.md` (the schema this
must remain a row of), `CELLS.md` (why the cell is a legitimate atom),
`REGIME.md` (what the world's physics can and cannot reward).

## 1. Why Dev 1.0 is not enough — measured, not asserted

Dev 1.0 (`lib/devo.js`) is a **positional readout**. Every property of a cell is a
weighted sum of nine fixed basis functions of two maternal coordinates:

```
property(ap, dv) = Σ w_k · BASIS_k(ap, dv)      BASIS = [1, ap, dv, |dv|, ap|dv|,
                                                          ap², sin2ap, sin3ap, sin4ap|dv|]
```

Cells are laid on a hex lattice inside a **disc**, and a site becomes a cell when
`presence(ap, dv) > 0`. That is the whole map: 63 property weights plus 10 synapse
weights, 73 floats.

It has no time, no cell-cell signalling, no diffusion, no division, and no
symmetry breaking — `ap` and `dv` are *handed to it* by the mother. It is a
painting operator, not a developmental one.

**The measured consequence.** Over 64 living genomes sampled across 44 lineages at
step ~924,000 (generation 22):

    elongation   p10 0.96   p50 1.15   p90 1.15   max 1.15
    all 64 bodies below 1.3 — that is, round

The distribution is *pinned*. Random founder genomes measure **1.155** — identical.
So elongation has not moved from its founder value in 22 generations. It is not a
hard cap: hand-made extreme genomes (weights ±6) reach elongation **4.04**. The map
*can* make a worm; evolution never finds one.

That is what a bad prior looks like. `presence` is a smooth function thresholded on
a disc, and `randomGenome` deliberately biases presence positive over most of the
egg, so the default body is "the whole disc" — aspect 1.155. Escaping to an
elongated body needs several of nine basis terms to cancel over most of the disc
simultaneously. It is reachable and vanishingly improbable, and evolution measures
improbable as impossible.

**Why this is the binding constraint on locomotion.** `REGIME.md` establishes that
the only locomotion route available in this world is **anisotropic drag** (route 2)
— which requires a body axis to be anisotropic *about*. A round blob has no axis.
So no controller fix and no muscle fix can produce crawling while the developmental
map has a hard prior toward circles.

## 2. The sketch

A circular egg. Cells develop inside it over **~12,000 ms** from first cell to
hatching. Each cell has an **orientation**, which establishes a maternal gradient,
plus small noise which eventually serves as a symmetry breaker.

The **Gene Regulatory Network** holds associations between numbered gene products
**0–255**, in what is essentially a CTRNN shape. This is dominant only during egg
development (lifelong expression is a later question).

- The maternal gradient is gene product **000**.
- If the GRN has a strong association 000 → 007, then cells with much 000 express
  007 over the coming milliseconds.
- If 038 is boosted by both 007 and 000, cells expressing both express 038.
- Sooner or later cells on left vs right have more of some product, via external
  signals — **201–255 reserved for external/environmental inputs**.
- A **mutual exclusion** regulatory motif between 010 and 038 makes left vs right
  emerge. With 010 as the cell's left hand and 038 as its right, there is now a
  two-dimensional coordinate system.

Given CTRNN-style equations of excitement with respect to time, and the arbitrary
12 seconds of early life, this is enough for interacting **"crap clocks"** (cf.
Jaeger) to give banding and stripes as in fly embryos.

## 3. Assessment — the sketch is sound, with four corrections

The architecture is the one real embryos use: maternal positional information,
a regulatory network reading it, and reaction-diffusion producing finer pattern on
top. Jaeger's gap-gene work is precisely this system. Adopting it is not
speculative; it is catching up.

It also lands exactly where `eggs.md` already argued the ceiling-breaker was: *"in
the open turbulent soup, morphogen gradients get advected and diffused away… a
boundary that contains the chemistry gives stable gradients → repeatable
patterning."* Dev 2.0 is the mechanism that the egg was being proposed **for**. The
two documents are one argument.

Four things the sketch under-specifies, each of which decides whether it works.

### 3.1 Do not ask noise for the primary axes

The sketch invokes two different symmetry-breaking mechanisms — "small amounts of
noise" and "impacts from external signals" — for the same job. Neither will
reliably give a *heritable* left/right.

Noise-driven symmetry breaking produces a **random** side each generation. That is
not a coordinate system; it is a coin flip, and selection cannot act on it because
the same genome gives a different body each time. Real embryos treat left-right as
genuinely hard and use dedicated machinery for it.

**The cell orientation in the sketch already solves this, and should be load-bearing.**
If the mother deposits the egg with an orientation, that vector defines one axis
(call it AP) and its perpendicular defines the other (DV) — deterministically, for
free, and heritably. That is a lawful maternal contribution, not a knob: the mother
is a physical object with a heading.

So: **maternal orientation sets the two axes; noise and Turing produce the finer
pattern on top of them** — segments, stripes, spots, limb fields. That is the
division of labour in real development, and it keeps the body plan repeatable while
leaving the interesting structure emergent.

This is a real concession: Dev 2.0 keeps a maternal AP/DV frame, exactly as Dev 1.0
has. The difference is that Dev 1.0 *only* has that frame, and Dev 2.0 runs a
dynamical system on top of it.

### 3.2 Differential diffusion is not optional — it is the whole mechanism

The sketch does not mention transport, and without it there is no Dev 2.0. If each
cell's GRN runs independently, the only spatial information available is the
maternal gradient, and the result is a smooth readout — Dev 1.0 with extra steps.

Gene products must **diffuse between adjacent cells**, and — this is the load-
bearing part — **at different rates per product**. Turing patterns require a slow
activator and a fast inhibitor (or the reverse). Equal diffusion gives no stripes,
ever. So diffusion rate must be a per-product, genome-set property, free to evolve
across a wide range.

This is also what makes the "crap clocks" work: coupled sloppy oscillators
synchronise through diffusive coupling, and a receding gradient converts temporal
oscillation into spatial banding (clock-and-wavefront). Both halves are needed.

### 3.3 CTRNN shape, but concentrations are non-negative

A CTRNN neuron has state in ℝ and activation `tanh` → [−1, 1]. A concentration
cannot be negative. Borrowing the CTRNN form wholesale gives negative
concentrations, which are meaningless, and loses degradation, which is what makes
oscillation possible.

The standard GRN form is CTRNN-shaped *and* correct:

```
dc_i/dt  =  P_i · σ(Σ_j w_ij · c_j + b_i)  −  λ_i · c_i  +  D_i · ∇²c_i
             ^ production, sigmoid, ≥ 0        ^ decay      ^ diffusion
```

`w_ij > 0` is activation, `w_ij < 0` is repression, and mutual exclusion is just
`w_ab < 0, w_ba < 0` — the motif the sketch wants, falling out of the weight sign
rather than being a special case. Decay `λ_i` gives each product its own timescale,
which is the analogue of the CTRNN's `tau` and the thing clocks are built from.

Note the pleasing consequence: this is **the same equation shape as the brain**,
with production/decay where the neuron has leak. `METHODS.md`'s "brain-is-body"
claim gets sharper — one dynamical form, two roles, differing only in what the
state means and what it couples to.

### 3.4 256 × 256 is too big a genome; make the network sparse

A dense 256-product GRN is 65,536 weights per genome, against Dev 1.0's 73. Two
problems: mutation on 65k weights explores nothing in 22 generations, and the
per-cell state is 256 floats = 1 KB, which at any interesting population is
gigabytes.

Real regulatory networks are **sparse** — a transcription factor has few targets.
Adopt the arena's own solution: **K regulators per gene**, exactly as the brain has
K incoming edges per neuron. At K = 8 that is 2,048 weights, and structural
mutation (an edge appears or vanishes) evolves the topology as well as the
strengths — machinery `lib/evolve.js` already has and has debugged.

On state size: only cells **currently developing** need carry gene concentrations.
An adult that has hatched can drop them (until lifelong expression is taken up).
That confines the memory to eggs in progress rather than the whole population, and
it is worth designing for from the start because it decides the buffer layout.

Consider also whether 256 products is needed at the outset. 32 or 64 with K = 8 is
a much smaller thing to get right first, and the numbering scheme (000 maternal,
201–255 external) survives a smaller range unchanged.

## 4. What Dev 2.0 buys, stated so it can be checked

The instrument already exists: develop a population's genomes offline and measure
morphology. Dev 2.0 is worth building if, and only if, it moves these:

| measure | Dev 1.0 today | what would count |
|---|---|---|
| elongation p90 | 1.15 (= founder) | a distribution with *spread*, reaching 2+ |
| elongation, evolved vs random | identical | evolved separates from random |
| segments | p50 3, from a `sin(k·ap)` term | segments from a clock, varying by lineage |
| bodies with no muscle | 18 / 64 | — |
| self-propulsion (control 0.0000) | median 0.0148 / 22.5 s | any order-of-magnitude gain |

The failure mode to watch for: Dev 2.0 produces *beautifully patterned round
blobs*. Pattern is not morphology. If elongation stays pinned, the new map has
inherited the old prior and the disc geometry is the culprit, not the encoding.

**The egg must therefore not be rigidly circular in its effect on the body.** If
cells divide inside a hard circular shell and fill it, the body is a disc again
whatever the GRN says. Either the shell must be deformable (and its shape an
outcome of the growing mass pressing on it), or the body must be free to occupy
only part of it. This is the single most likely way to rebuild the same problem.

## 5. What Dev 2.0 does NOT fix

Two of the three measured blockers on locomotion are downstream of *any*
developmental map and survive this change untouched:

- **The argmax type rule discards 47% of contractile capacity.** `describe()` in
  `lib/evolve.js` labels a cell by the argmax of three continuous props, and
  `contractionOf` only contracts cells labelled MUSCLE. Measured: contract capacity
  in tissue 366.9, capacity the kernel can use 192.9. 351 cells have contract > 0.15
  and are not muscle; 151 of them lost by less than 0.2. Dev 2.0 changes *what
  numbers the props take*, not the rule that throws half of them away.
- **The CTRNN is latched or chattering, rarely rhythmic.** Sampled every step (33 Hz
  Nyquist): 85 of 204 muscle cells change at all, median peak-to-peak 0.00000, 40%
  of all cells pinned at a tanh rail; those that do move flip at p90 7.2 Hz against
  a body whose drag relaxation is ~0.18 s. A new dev model inherits this brain.

Both are cheap to address and neither depends on which development is in use, which
is why they should not wait behind it.

## 6. Ontology notes

**"Gene product", not "protein" — keep it.** The naming is deliberate and correct.
We are not simulating folding, and in real development the regulatory actors are
not uniformly folded proteins: maternal deposits act as RNA, and a good deal of
patterning regulation runs through transcripts and non-coding RNA before any
protein exists. "Gene product" is the honest superset and commits us to nothing we
are not modelling. It is the same move as `LifeStuff` in `CELLS.md` — take the
*properties* the biology would have supplied, and skip the machinery that supplies
them. A gene product here is a **numbered quantity with a concentration, a decay
rate and a diffusion rate**, and that is the entire ontology.

**Cells stay spheres.** Simple spheres for physics and graphics, living and
lifeless alike, is the commitment `CELLS.md` already makes and nothing in Dev 2.0
needs to break it.

**Links may become cells, and development would have to grow them.** The proposal —
a link is a cell whose geometry is a segment, with an orientation, two endpoints, a
rigidity and a signal-propagation property — is written up in `CELLS.md` under
*Open proposal: links should be cells too*. It matters here because if links become
matter, then the GRN must pattern **two kinds of thing**: where cells are, and where
links run between them. That is a larger developmental problem than patterning
tissue alone, and the encoding should be designed knowing whether it faces it.

The recommendation there is *right idea, wrong time* — it roughly triples the entity
count at the moment that budget binds, and it destabilises the part of the physics
with a NaN history. But Dev 2.0 should not be architected so that adding it later
means starting over. Concretely: keep the GRN's output an interpretation layer over
cell state, so that "what link runs from here" can be added as further outputs
without changing the network's shape.

## 7. Sequencing — the recommendation

The question posed was: make the old system move first, or move to this one?

**Neither, in that order.** The honest reading of the measurements is:

1. **Fix the two dev-independent blockers first** (§5). They are small, they are
   prerequisites for *measuring* whether Dev 2.0 helped, and if they are left in
   place then any Dev 2.0 result is confounded — a better body plan whose muscles
   are half-deleted and whose brain is latched will read as "no improvement" and
   the new encoding will be blamed.

2. **Settle the medium question before designing body plans** (`WORLDS.md`, §on the
   medium). Whether the world gains a fluid with state decides whether the
   morphological target is an elongated crawler or a radially-symmetric pulsing
   swimmer. Those are different animals, and it is wasteful to build a
   developmental system aimed at the wrong one. This is a bigger decision than the
   dev model and it is upstream of it.

3. **Then build Dev 2.0.** By then the world pays for the morphology the new map
   can produce, and the instrument can attribute the result.

Do **not** attempt to make Dev 1.0 "move" as a project in its own right. Its
morphology prior is round, and route 2 needs an axis; effort spent tuning it is
spent against a straitjacket. Fix what is cheap and general, then replace it.

The counter-argument, recorded because it is strong: `RESEARCH.md`'s 29.4M-step run
showed that **the economy decides**, and a world that pays creatures to sit still
will produce sessile animals under any encoding. If movement still does not pay
when Dev 2.0 lands, it will produce well-patterned sessile animals and we will have
learned nothing about locomotion. The crowding-suppression work is the open thread
there and it is unfinished — shipped at k = 1.5 with its deep-time comparison
against the sessile endpoint **not yet run**. That comparison is cheaper than Dev
2.0 and partially determines whether Dev 2.0 can show anything.
