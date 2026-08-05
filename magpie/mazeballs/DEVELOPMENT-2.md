# Development 2.0 — a gene regulatory network in an egg

The developmental encoding this project is built on: a sparse GRN, running in time
inside a contained egg, **growing** a body rather than painting one. This document
is the spec and the reasoning behind it.

**Status.** The encoding exists — `lib/devo2.js`, first build 2026-08-05. Growth
and morphology work. Patterning (§6) does not exist yet and is the next substantial
piece. The live world still runs Dev 1.0 until §9.3 lands.

Companions: `eggs.md` (why a container is required at all), `METHODS.md`
(brain-is-body, one encoding grows every tissue), `primitives.md` (the schema this
must remain a row of), `CELLS.md` (why the cell is a legitimate atom), `REGIME.md`
(what the world's physics can reward).

## 1. Background — what this replaces

Dev 1.0 (`lib/devo.js`) is a **positional readout**. Every property of a cell is a
weighted sum of nine fixed basis functions of two maternal coordinates:

```
property(ap, dv) = Σ w_k · BASIS_k(ap, dv)   BASIS = [1, ap, dv, |dv|, ap|dv|,
                                                      ap², sin2ap, sin3ap, sin4ap|dv|]
```

Cells sit on a hex lattice inside a disc; a site becomes a cell when
`presence(ap, dv) > 0`. That is the whole map — 73 floats.

It has no time, no cell-cell signalling, no diffusion, no division and no
regulation. Nothing *develops*: the genome is evaluated, and a body appears. Every
structure it can make is a level set of a nine-term function, so its expressive
ceiling is fixed at design time and no amount of evolution raises it.

The observable consequence, over 64 living genomes across 44 lineages at generation
22: elongation p50 = p90 = max = **1.15**, identical to random founders and
unmoved in 22 generations. Bodies were discs because a thresholded smooth function
on a disc is what the map computes.

The reason to move is not that number. It is that a genotype→phenotype map with no
dynamics cannot produce open-ended structure, and open-ended structure is the
project. Segments, stripes, travelling fronts, clocks, lifelong expression,
environmental response — none are reachable from a fixed basis, and all fall out of
regulation in time.

## 2. The design

A circular egg. Cells develop inside it over **~12,000 ms** from first cell to
hatching. Each cell has an orientation, which establishes a maternal gradient, plus
small noise.

The GRN holds associations between **numbered gene products**, in a CTRNN shape,
dominant during development (lifelong expression is a later question). If the
network has a strong association 000 → 007, cells with much 000 express 007 over
the coming milliseconds; if 038 is boosted by both, cells expressing both express
038. A mutual-exclusion motif between two products separates left from right, and
given equations of excitement in time, interacting **"crap clocks"** (cf. Jaeger)
give banding and stripes as in fly embryos.

Five design decisions turn that into something that runs.

### 2.1 Maternal orientation sets the axes; noise decorates them

Noise-driven symmetry breaking gives a **random** side each generation — a coin
flip, not a coordinate system, and selection cannot act on it because the same
genome yields a different body each time. Real embryos treat left-right as
genuinely hard and use dedicated machinery.

The cell orientation in the design solves it: the mother is a physical object with
a heading, so she deposits an oriented egg. That vector gives AP; its perpendicular
gives DV — deterministic, heritable, free. **Maternal orientation sets the frame;
noise and reaction-diffusion produce the finer pattern on top.** That is the
division of labour in real development, and it keeps the body plan repeatable while
leaving structure emergent.

Dev 2.0 therefore keeps a maternal AP/DV frame, as Dev 1.0 had. The difference is
that Dev 1.0 *only* has the frame, and Dev 2.0 runs a dynamical system on it.

### 2.2 Differential diffusion is the mechanism, not a detail

If each cell's network runs independently, the only spatial information is the
maternal gradient and the result is a smooth readout. Gene products must diffuse
between adjacent cells, **at different rates per product**: a Turing instability
needs a slow activator against a fast inhibitor, so the reachable span must
comfortably contain an order-of-magnitude ratio. Equal diffusion gives no stripes,
ever.

Diffusion is also what couples the clocks: sloppy oscillators synchronise through
diffusive coupling, and a receding gradient converts temporal oscillation into
spatial banding.

### 2.3 CTRNN-shaped, but concentrations are non-negative

A CTRNN neuron has state in ℝ and `tanh` → [−1, 1]. A concentration cannot be
negative, and borrowing `tanh` also loses degradation — which is what oscillation
is built from. The standard GRN form is CTRNN-shaped *and* correct:

```
dc_i/dt  =  P_i · σ(Σ_j w_ij · c_j + b_i)  −  λ_i · c_i  +  D_i · ∇²c_i
             ^ production, sigmoid, ≥ 0        ^ decay      ^ diffusion
```

`w_ij > 0` activates, `w_ij < 0` represses, and mutual exclusion is simply
`w_ab < 0, w_ba < 0` — the motif falls out of weight sign rather than being a
special case. Decay `λ_i` gives each product its own timescale.

This is **the same equation shape as the brain**, with production and decay where
the neuron has leak. `METHODS.md`'s brain-is-body claim gets sharper: one dynamical
form, two roles, differing only in what the state means and what it couples to.

### 2.4 Sparse regulation

A dense 256-product network is 65,536 weights; mutation explores none of it, and
per-cell state of 256 floats is gigabytes at population scale. Real regulatory
networks are sparse — a transcription factor has few targets.

So: **K regulators per gene**, exactly as the brain has K incoming edges per
neuron, with structural mutation moving edges as well as perturbing weights. The
numbering scheme (000 maternal, high range external) is defined by offset, so the
product count can widen later without renumbering anything.

Only cells **currently developing** carry concentrations; a hatched adult drops
them until lifelong expression is taken up.

### 2.5 The body grows — and growth needs somewhere to go

Development starts from one cell and adds cells where the network says to grow, so
morphology is the record of a process. This is what makes non-round bodies cheap:
a body that grows preferentially along an axis *is* elongated, and that is one gene
being high at one pole.

Two things the growth rule needs, both learned the hard way (§5):

- **Room.** The egg must be much larger than a compact body of `maxCells`, or
  growth fills the shell and the body is a disc regardless of the network.
- **Locality.** Growth must be able to concentrate at a tip. Every surface cell
  growing at once is isotropic expansion, which is a disc however sophisticated the
  regulation driving it.

Locality is provided as a **signal, not a mechanism**: crowding (how enclosed a
cell is) is exposed as an input gene. A genome can grow only where it is uncrowded
— apical growth, filaments, branches — or weight it to zero and stay a blob.
Reachable, not imposed.

## 3. As built

`lib/devo2.js`, defaults as of the first build.

**Scale.** `NGENE = 64`, `K = 6`. Per gene: K source indices, K weights, bias,
log-decay, log-diffusion — stride 15, genome **960 floats** (Dev 1.0 was 73). 64 is
what evolves in a reasonable number of generations; the sketch's 256 remains the
target once the machinery is proven.

**Reserved genes.** Maternal genes are *boundary conditions* — clamped from
geometry every step, never integrated, so regulation cannot delete them.

| index | name | meaning |
|---|---|---|
| 0 | `G_AP` | anterior-posterior, 0…1 along the egg's heading |
| 1 | `G_DV` | dorsal-ventral, 0…1 across it |
| 2 | `G_RAD` | distance from centre, 0 core … 1 shell |
| 3 | `G_NOISE` | fixed per-site noise — the symmetry-breaking seed |
| 4 | `G_CROWD` | how enclosed this cell is, 0 alone … 1 surrounded |
| 8… | outputs | `grow`, `contract`, `sense`, `grip`, `stiff`, `tau`, `bias` |
| 56… | external | reserved for environmental signals; nothing writes them yet |

Outputs are a **fixed readout block over an evolved network**, mapped
`2·tanh(c) − 1` into the ranges the rest of the pipeline expects, so `describe()`,
`bond()` and the arena are untouched and the encoding is swappable.

**Rates.** Decay `0.6 · 10^[−1.2, 1.2]`; diffusion `0.02 · 10^[−1, 2]` — two
decades, wide enough to contain a Turing ratio.

**Time.** 12,000 ms at 40 ms steps = 300 integration steps. Growth is evaluated
every 5th step against a threshold, so a body cannot appear at once.

**Growth is a self-limiting transient.** Steady state is `σ(net)/decay`; division
halves the mother's concentrations into the daughter, dropping the tip below
threshold, so a growing tip must actively re-produce to grow again. That turns
`grow` from a switch into a rate, which is what lets one end keep growing while
another stops. Daughters take half — cytoplasm is divided, not created — so a tip
carries a decaying memory of where it came from, which is what a travelling front
needs.

**What it does.** Random genomes: elongation p90 1.73, **max 7.51**, 14 of 60
viable embryos above 1.3 and 2 above 2.0 — against Dev 1.0's random ceiling of
1.15, which hand-crafted extreme genomes could only push to 4.04.

**What is rough.** Viability is 60 of 200 random embryos, and bodies are small
(p50 10 cells) — the founder seeding is tuned for shape at the expense of getting
off the ground. Development is stochastic per embryo, so the same genome develops
differently each time and fitness is noisy; seeding noise per genome would fix it.
Segments are ~0.

## 4. Geometry is part of the developmental map

The strongest lesson from the first build, and the one most likely to be forgotten:

> When the GRN produces something dull, suspect the **substrate it is growing
> into** before suspecting the regulation.

The lattice, the egg dimensions, the division rule and the set of signals a cell
can read are as much part of the genotype→phenotype map as the weights are. A
network cannot express a morphology the growth geometry cannot represent, and no
amount of regulation escapes it.

Two concrete failures, both invisible from reading the network code:

- **The egg was sized to the body it contained** (extent 4.5 ≈ the radius of a
  compact 60-cell blob), so every embryo filled the shell and elongation p50 fell
  to 0.90 — worse than the map it replaced. Fixed by extent 12.
- **Growth had no way to be local**, so expansion was isotropic. Fixed by exposing
  crowding as an input (§2.5).

The standing constraint that follows: **the egg must not be rigidly circular in its
effect on the body.** Either the shell is deformable — its shape an outcome of the
growing mass pressing on it — or the body must be free to occupy only part of it.
The current design takes the second option.

## 5. Ontology

**"Gene product", not "protein".** We are not simulating folding, and in real
development the regulatory actors are not uniformly folded proteins — maternal
deposits act as RNA, and much patterning regulation runs through transcripts before
any protein exists. "Gene product" is the honest superset. It is the same move as
`LifeStuff` in `CELLS.md`: take the *properties* the biology would supply, skip the
machinery that supplies them. A gene product here is **a numbered quantity with a
concentration, a decay rate and a diffusion rate**, and that is the whole ontology.

**Cells stay spheres**, living and lifeless alike, per `CELLS.md`. Nothing here
needs to break that.

**Links may become cells.** The proposal — a link is a cell whose geometry is a
segment, with an orientation, two endpoints, a rigidity and a signal-propagation
property — is in `CELLS.md` under *Open proposal: links should be cells too*. If
links become matter, the GRN must pattern **two kinds of thing**: where cells are,
and where links run between them. Dev 2.0 should not be architected so that adding
that means starting over. Concretely: keep the outputs an *interpretation layer*
over cell state, so "what link runs from here" can be added as further output genes
without changing the network's shape. The current fixed readout block already has
this property.

## 6. Patterning — the next substantial piece

Growth and shape work. **Patterning does not exist yet**, and it is where the
interesting structure lives. Segments measure ~0; there are no stripes, no bands,
no clock.

What is missing is not more genes but the two halves of clock-and-wavefront:

- **A clock.** A regulatory oscillator — minimally a delayed negative feedback loop,
  or a two-gene activator/inhibitor pair with separated decay rates. The machinery
  is present (signed weights, per-gene decay), but nothing biases founders toward
  finding one, and a random sparse network almost never oscillates. Worth asking
  whether founders should be seeded with a candidate oscillator the way `grow` is
  seeded — reachable-not-imposed, with mutation free to destroy it.
- **A wavefront.** A receding gradient that freezes the oscillator's phase into
  space as the body extends. The growing tip already supplies one for free: it
  carries a decaying inherited concentration away from the source, which *is* a
  receding front. Coupling the clock to it is the experiment.

Diffusion ratios are the other lever, and they are already evolvable across two
decades. The honest open question is whether 300 developmental steps is enough time
for a clock to run enough cycles to lay down bands — at 40 ms steps a 1 Hz
oscillator gets ~12 cycles, which is plausible but not generous.

Instrumentation first: a per-gene concentration trace over developmental time,
per cell, so an oscillation can be *seen* rather than inferred from a segment
count. The brain scope already does this for activations and the same shape works
here.

## 7. Instrumentation

Probes, not gates. A single morphology scalar is a bad goal function, and
optimising one is how reward hacking starts.

- **Developmental trace** — concentration against time per gene per cell (§6). The
  primary instrument; everything else is a summary of it.
- **Morphology** — elongation, segments, symmetry, cell count. Elongation is a
  cheap familiar probe for "are shapes happening", not a target.
- **Reproducibility** — develop one genome N times and compare. Currently poor by
  construction; canalisation is a real developmental property worth measuring.
- **Evolvability** — does a morphology statistic respond to direct selection at
  all? An instrument test, run under a regime that would be illegitimate as an
  ecology claim, and useful precisely because it isolates the encoding.
- **Ecology** — what the world actually selects, with the conserved control that
  every claim in this project requires.

## 8. Not fixed by this

Recorded so nothing is mis-attributed. Two measured constraints on locomotion sit
downstream of any developmental map:

- **The argmax type rule discards 47% of contractile capacity.** `describe()` labels
  a cell by argmax over three continuous props, and only cells labelled MUSCLE
  contract. Dev 2.0 changes what numbers the props take, not the rule that throws
  half of them away.
- **The CTRNN is latched or chattering.** Sampled at 33 Hz: 85 of 204 muscle cells
  change at all, 40% of cells pinned at a rail. A new dev map inherits this brain.

## 9. Roadmap

1. **Viability and canalisation.** Founder seeding that reliably produces bodies;
   developmental noise seeded per genome so a genome develops the same way twice.
   Fitness is noisy until this lands, which makes every later result harder to read.
2. **The developmental trace** (§7) — needed before patterning work can be judged.
3. **Integration.** Wire `devo2.js` into `lib/evolve.js` behind a flag so both
   encodings can run against the same world.
4. **Patterning** (§6) — clock, wavefront, bands.
5. **Widen** to the full product range and revisit K, once the above is stable.
6. **Eggs as physical objects** — development happening in the world over real time,
   vulnerable and interruptible, per `eggs.md`. Dev 2.0 currently develops as an
   internal integration at birth; making eggs physical is a separate and larger
   change to reproduction, and this encoding is the prerequisite for it.
