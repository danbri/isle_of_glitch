# Audit: the GPU world against the design notes

Written after merging the two lines, reading ASCENT.md, METHODS.md, eggs.md and
energy-speculative-friction.md, and checking each claim against what the code
actually does. The question asked was whether the spec's author would be pleased
with what was built — not with its potential. Honest answer: **with about a third
of it**, and there are violations of both stated laws.

## What the notes say, in brief

**ASCENT.md** — ascent is not one endless climb but an *unbounded staircase of
bounded steps*: each capability climbs a bounded hill and saturates; a new lawful
capability breaks that ceiling and opens the next. "Infinite ascent" in finite
compute can only mean *does each transition open, repeatably*. Rung 1
(unicellular → multicellular) measured cleanly; rung 3 (differentiation) did not
open because evolution bypassed it via single-cell plasticity.

**energy-speculative-friction.md** — energy exists to be *friction*, a law that
can tell a design no. Invent plumbing, never energy. One currency, one boundary
inflow, every conversion loses, nothing mints. The test: *you should frequently
fail to afford things you wanted.*

**METHODS.md** — point the loop at the world and the primitive set, not the
organism's hyperparameters, because every organism-side enrichment measured null
and every environment change landed. Brain is body: one developmental encoding
patterns all tissue; expose **patterning operators, not size knobs**; wiring cost
makes modularity physical rather than designed.

**eggs.md** — reproduction as a point-event is a `predatorSpeed`-class shortcut.
It should be a process in time and space that can fail. An egg is a container, a
yolk, and — the deep one — a *contained chemical chamber*, because open turbulent
fields advect morphogen gradients away and reliable complex bodies may be
impossible without containment.

## Where the code agrees

**The instrument converged independently.** `lib/tournament.js` was built here
without having read ASCENT.md and is the same design: freeze pools at two times,
mix 50/50 in one fresh neutral world, read the later pool's share, >0.5 is ascent,
no species or role label anywhere. Two implementations arriving at the same
category-free measure is meaningful evidence it is the right one.

**And it reproduced the number.** ASCENT.md reports rung 1's ladder second-half at
0.508 and body size plateauing around 20. This line measured a post-transient
margin of 0.52 with size saturating at its cap. Different code, different world,
same result — a bounded hill that saturates.

**Brain is body, literally.** METHODS §3 wants the brain as tissue rather than a
capacity hyperparameter. Here every cell *is* a CTRNN node in one shared arena;
there is no separate brain object, and a sensor, a muscle and an interneuron
differ only in which kernel reads their activation. This is the strongest
agreement in the codebase.

**GPU inner sim.** METHODS §7 asks for fields as compute shaders and particles
via an in-shader spatial hash. Both exist: 2.1 G edge-gathers/s, the whole
sense → brain → muscle → move loop resident, and the hash serving crowding,
contact and contest.

**Controls, and retracting when they fail.** RESEARCH.md carries four retractions
of this session's own claims. That matches the doc's "controls are first-class"
discipline, and the self-versus-self tie is exactly the guard it asks for.

## Where the code violates the notes

### 1. Cell types are declared roles — a First Law violation

```
export const CELL_NEURON = 0; CELL_SENSOR = 1; CELL_MUSCLE = 2; CELL_ANCHOR = 3;
if (m.x == 2 && m.y >= 0) { return P.contract * act[...]; }   // only type 2 pulls
if (me2.x == 3) { grip = P.gripAnchor; }                      // only type 3 grips
```

An integer tag decides which physics a cell gets. That is structurally the same
move as `predatorSpeed`: a high-level category the engine privileges, rather than
a behaviour falling out of low-level state. ASCENT.md is explicit that
differentiation must *emerge as the means to a chemical end, never be scored
directly* — and here it is not even scored, it is declared.

The lawful version: a cell has continuous properties (contractility, adhesion,
grip) that its own chemistry sets, and "muscle" is a description of a cell whose
contractility is high, not a type the kernel branches on.

### 2. Energy is minted — the exact example the law forbids

```
let efficiency = (1.0 - exp(-mySize / scale)) * P.sizeNorm;
let gain = P.harvest * resourceAt(np) * share * efficiency;
```

Bigger bodies extract **more energy per cell from the same ground**. The law says:
*"You may not grant energy to a capability. 'Bodies get +X so multicellularity
pays' mints, and privileges a chosen outcome. Fiction."* This is that, verbatim,
and it was added deliberately to make multicellularity pay.

Worse, it fails the windfall test the doc sets — *whose fixed gradient does it tap,
and where does the loss go?* — because there is no fixed gradient at all. The
resource field is an analytic function sampled without depletion: infinite free
energy, everywhere, forever. There is no sun, no boundary inflow, no conservation.

Three further leaks: `eCap`/`eFloor` clamp per-cell energy, destroying it at the
ceiling and creating it at the floor; the contest was lossy at those same clamps
until fixed; and nothing anywhere accounts for where dissipated energy goes.

The doc's test — *"if nothing is ever unaffordable, you have minted somewhere"* —
fails here. Bodies are never unable to afford a capability. They starve only when
standing on poor ground.

### 3. There is no development, in a project named evo-devo

Reproduction is a point-event: `divide()` copies a genome and instantiates a
finished adult body adjacent to the parent, in one step, guaranteed. eggs.md opens
by naming exactly this as the shortcut to remove. There is no propagule, no yolk,
no shell, no chamber, no failure mode, and no time.

Nor is there a genotype→phenotype map. METHODS §2 lists the developmental encoding
— GRN, neural CA, CPPN — as the central thing the loop should mutate. Here the
genome *is* the phenotype: a graph copied with perturbation. Nothing develops.

### 4. Size knobs, precisely where the notes say patterning operators

METHODS §3 ends: *"expose patterning operators, not size knobs... body size, brain
size, module count, number of eyes, symmetry order are all outcomes the loop
reads, never inputs it sets."*

This codebase added `maxCells` as a knob, then ran an experiment sweeping it
(40 → 140) and reported the result. That is the anti-pattern, implemented and
then measured. There are no patterning operators at all: no gradient, no symmetry
axis, no segmentation, no reaction-diffusion. Bodies are random graphs, which is
why they have no head, no sides and no repeated unit.

### 5. The tournament runs with mutation on, and without the monoculture control

ASCENT.md specifies the instrument as mixing two frozen pools *with mutation OFF*,
cross-checked by a **monoculture assay** that separates absolute foraging skill
from frequency-dependent Red-Queen effects.

`lib/tournament.js` constructs a full `Evolver` and ticks it, so mutation, birth
and death all run during the contest. That measures something legitimate but
different — competitive dynamics including ongoing evolution — and it was reported
as though it were the specified measure. The monoculture control was never run at
all, so no result here separates "got better at foraging" from "got better at
beating that particular opponent."

### 6. Deep time, and a premature conclusion

METHODS §6: *"Each hill saturates fast (~8k steps here); seeing several
transitions needs 10^7–10^8 steps."* The longest run here is about 1.3 × 10^6 —
one to two orders of magnitude short. Several confident statements this session
that "ascent stops" were made inside a window the notes say is too small to see
the next step in.

### 7. Wiring has no cost

METHODS §3 calls wiring cost *"the deepest payoff of brain-in-body"* — once
neurons have positions, connections have length, so modularity emerges physically
rather than as a designed prior. Neurons here have positions and edges have no
length term whatsoever. A synapse across the body costs exactly what a synapse to
a neighbour costs, so there is no physical pressure toward modular structure —
and then the bodies come out unstructured, which should not be a surprise.

## The verdict

Pleased with: the instrument, its independent convergence and its reproduction of
rung 1's number; brain-as-body taken literally; the GPU scale the notes ask for;
and the habit of retracting measurements when the substrate turns out to be
broken.

Not pleased with: two declared-role systems the First Law forbids, an energy model
that mints in the specific way the friction law names as fiction, no development
whatsoever, size knobs where patterning operators were asked for, an instrument
run differently from its specification and without its control, and conclusions
drawn from runs an order of magnitude too short.

The through-line in the failures is the same one the notes warn about repeatedly:
**every violation here is a shortcut that made a desired outcome happen directly,
rather than making it possible and letting it be found.** Cell types make
specialisation happen. Size-efficiency makes multicellularity pay. Instant birth
makes reproduction reliable. Each is the `predatorSpeed` move wearing different
clothes, and each was added in good faith to fix something that was not working.

## Priority order to fix

1. **Stop minting.** Delete the size-efficiency multiplier; give the resource
   field a finite, depleting, regrowing stock so harvest is conserved; account for
   the clamps. Expect the population to crash — that is the constraint working.
2. **Dissolve the cell types** into continuous, chemically-set properties.
3. **Make reproduction a process** — propagule, yolk from conserved parental
   energy, a bond-shell chamber, and the possibility of failure.
4. **Add one patterning operator** — a maternal gradient in the egg is the
   cheapest and gives symmetry and segmentation something to be about.
5. **Run the instrument as specified** — mutation off, plus the monoculture assay.
6. **Add a wiring length cost**, and let modularity be physical.
