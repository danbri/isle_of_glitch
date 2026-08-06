# Cambrian conditions — what is actually missing

> **Still current.** The standing goal, and the ranked list of what is still missing — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md) for how it
> sits in the world as a whole, and for the measurements behind it.

An audit of the possibility space, written after getting the world to move.
Movement was the hard-won thing; it is also the smallest of the things needed.

Companion to `primitives.md` (which specifies most of what is missing here and
was never built), `WORLDS.md` (the medium), `eggs.md` (reproduction in time),
`DEVELOPMENT-2.md` (the encoding).

## 0. The standing goal

**Make organisms each other's dominant selective pressure — and show it survives
deep time.**

Every economic fix so far has worked and then reverted. brainTax gave twelve
times the turnover and was outrun. contest and crowding made movers out-earn
sitters for 900k steps, then muscle fell from 54% to 3.2%. absorbTradeoff
measured 29% sensors over 50k steps and reads 3.8% live. The pattern does not
change: **a fixed cost against an adapting population is a hill the population
walks down.** The Cambrian's engine is not a harsher constant, it is that what
you must beat changes when you change.

**Success is three measurements, each of which must survive TEN TIMES the
runtime that first produced it:**

1. **Disparity rises and does not collapse.** Morphological spread across living
   lineages increasing, rather than the monoculture that keeps returning.
2. **At least two guilds, found and not declared.** Persistent clusters in trait
   space that differ in how they make a living — discovered by measurement, never
   by a flag on a cell.
3. **Escalation.** The value of a trait depends on what other lineages carry: a
   measurable arms race rather than a static optimum.

**Rules, because the failure mode is self-deception:**

- Every claim carries its control. No control means retracted.
- Nothing high-level enters the kernel. Guild, species and organism are QUERIES
  over the tree of life, never types the world branches on.
- **A result that does not survive 10x longer runtime is retracted, loudly.**
  Two have been already.
- No metric becomes a target. If tuning is aimed at a number, that number is
  thereafter suspect as a measure.

## 1. How to assess movement — the instruments

Recorded first because every claim below depends on being able to measure, and
because "it looks static" and "p50 0.98, p90 18.2" are very different statements.

| instrument | what it answers | where |
|---|---|---|
| `livemove.js` | displacement in the LIVE world, tracked by uid, with the common-drift baseline subtracted | scratch |
| `trails.js` | every body's path over N samples, as SVG. Shows the *distribution* — who moves | scratch |
| `snapshot.js` | vector render of the world from the frame format; tissue census | scratch |
| imposed-wave drive | `waveAmp > 0` drives muscles from `sin(axial·k − ωt)` instead of the brain | `world_gpu.js` |
| muscles-off control | `contract: 0`. **Required.** Any displacement claim without it is retracted | everywhere |
| span / torn check | body size at end ÷ start. Guards the dismemberment artefact | `wavetest` |

**The imposed wave is the load-bearing one.** It splits an unanswerable question
("why doesn't it move") into two answerable ones: bodies move under a perfect
gait → the controller is the blocker; bodies don't → the body and physics are.
That single split is what broke a months-long deadlock.

**Tracking by uid, not slot.** Arena slots are recycled, so a "body" tracked by
slot teleports across the world the moment its slot is reused. This silently
wrecked a displacement measurement once already.

## 2. The structural lesson: static parameters get outrun

The single most important thing learned, and it generalises past locomotion.

Every economic fix so far has worked and then reverted:

- **brainTax 0.4** — 12× the turnover, then the population evolved to be cheap,
  the fixed solar inflow again exceeded its needs, energy climbed 12 → 26.5 and
  death rates collapsed.
- **contest + crowding** — movers out-earned sitters for ~900k steps; muscle rose
  to 54% and then fell to 3.2% by generation 210.
- **absorbTradeoff 0.4** — sweeps predicted sensors at 29% over 50k steps; the
  live world at 155k steps and generation 32 reads **3.8% sensors, 88.7% muscle,
  13 lineages**.

The pattern is always the same: **a fixed cost against an adapting population is
a hill the population walks down.** Tuning harder does not fix this; it only
changes which hill.

What would fix it is scarcity that *scales with what the population has become* —
density-dependent, frequency-dependent, or supplied by other organisms rather
than by a constant. Which is the argument for §4.

## 3. The deepest gap: nothing can perceive anything

```wgsl
fn sense(...) {
  let rel = flowAt(p) - vel[i].xy;
  ext[slot] = tanh((length(rel) + fbm(p * P.flowScale * 0.5, seed) - 0.5) * senseGain);
}
```

A sensor feels **the speed of the medium past it, plus a noise field.** That is
all. It does not sense food, it does not sense other creatures, it does not sense
its own body, and it is a **scalar** — so it carries no direction even in
principle.

Consequences, and they are total:

- **No creature can perceive another creature.** Predator, prey, mate, rival,
  swarm — none are perceivable, so none are evolvable. An arms race is not
  merely absent; it is unreachable by construction.
- **Nothing can move *toward* anything.** What we have is open-loop rhythm. Even a
  perfect gait cannot become foraging without a gradient to climb.
- **Sensing is nearly useless, so selection deletes it** — and the 3.8% sensor
  census is the correct response to a sense organ that reports weather.

This is the highest-value missing piece by a wide margin. A directional sense of
*other bodies* and of *food* would make almost everything else in this document
reachable.

## 4. The material vector: specified, never built

`primitives.md` Layer 1 lists what a cell should carry. What is actually
implemented:

| axis | specified | built |
|---|---|---|
| `contractility` | yes | **yes** — continuous, drives force |
| `grabbiness` | yes | **yes** — `grippiness`, drives traction |
| `stiffness`/`brittleness` | yes | **yes** — per bond |
| `tag[]` surface identity | yes | no |
| `enzyme[]` what you can digest | yes | no |
| `toughness` resists extraction | yes | no |
| `nutrition` yield when consumed | yes | no |
| `density` → mass | yes | no — every cell has mass 1 |
| `store` energy capacity | yes | no |

Six of nine axes are unbuilt, and they are exactly the six that make an ecology
rather than a physics demo.

**The proposals — scales, leather hides, food absorbers, flesh in flavours — are
this table.** They are not new primitives; they are the ones already specified
and skipped:

- *food absorbers* → an `absorb` axis. Currently **derived** as
  `1 − k·max(contractility, grippiness)`, an imposed anticorrelation. It should be
  an evolvable property with its own cost.
- *scales, leather hides, armour* → `toughness`, gating how easily you are eaten,
  anticorrelated with `nutrition` (tough = low-value food) and paid for in
  `density` → mass → slower.
- *nutritious tissue makes you a target* → `nutrition`. This is the one that turns
  a population into an ecology, and it needs §5.

## 5. Predation, and why it is the keystone

There is a `contest` term — cells take energy from cells of other bodies on
contact — and it is what finally made movement pay. But it is not predation:
nothing is **eaten**, no body becomes food, and death leaves no matter behind.

The full primitive is already written down in `primitives.md`:

```
consume:  energy A←B at rate max(0, enzyme_A · tag_B − toughness_B) × nutrition_B
```

Roleless and graded — you must both *match* (enzyme·tag) and *overpower*
(toughness). "Predator" and "prey" are regions of that space, never types. This
one function plus `nutrition` and `toughness` gives, without naming any of them:
grazing, predation, scavenging, armour, camouflage-by-tag, and specialist versus
generalist diets.

**Why it is the keystone.** It is the only proposed mechanism whose difficulty
*scales with what the population evolved into*. A fixed metabolic tax gets
outrun; a world where the other organisms are both your food and your problem
cannot be outrun, because the target moves when you do. That is the answer to §2.

And it closes the matter loop: **corpses**. Death currently vacates a slot and the
matter vanishes. A body that dies leaving nutritious tissue behind is food, which
funds scavengers, which is another niche that costs nothing to specify.

## 6. Where reproduction comes in

The question was whether movement and sensing relate to the reproduction half of
the simulation. They do, in two specific ways.

**Reproduction is currently instantaneous and safe.** A parent crosses an energy
threshold and a fully-formed child appears adjacent. `eggs.md` names this a
`predatorSpeed`-class shortcut and asks for reproduction extended in time and
space, that can *fail*. Until it is, there is no vulnerable stage — and a
vulnerable stage is what makes parental behaviour, guarding, hiding, dispersal
and timing worth evolving. Every one of those is a *behaviour*, so every one of
them needs §3 to be perceivable.

**Development already costs and can fail** — `failedEggs` is logged and non-zero —
so the mechanism is half there. What is missing is the egg existing *in the
world*, where something can eat it.

The connection to movement is direct: dispersal only matters if where you put
your offspring matters, which requires the world to be spatially structured in a
way creatures can perceive and reach. Movement + sensing + eggs are one feature,
not three.

## 6b. Sensors as receptive fields — the design

A sensor is not a type. It is a **receptive field**: a kernel integrated over a
field, evaluated at the cell's position and orientation. One formula covers every
modality:

```
ext = SUM_sources  A_i * exp(-|d_i|^2 / 2 sigma^2) * (1 - dir + dir * max(0, cos theta_i))
                   ^amplitude   ^range               ^directionality
```

The gaussian sum is the natural representation for "several sources nearby":
they compose into one scalar with no special casing, which is what a smell or a
warmth actually is.

Four evolvable numbers per sensor cell — modality, range, directionality,
acuity — and the named organs are regions of that space rather than types:

| range | directionality | what we would call it |
|---|---|---|
| large | ~0 | smell |
| large | ~1 | vision |
| small | ~0 | touch, warmth |
| medium | ~0.5 | lateral line, vibration |

**Vector representation: do not give one cell a vector.** Each cell has a
preferred direction already — its axial orientation, which the compass uses — and
the POPULATION encodes the vector. That is population coding, it is what nervous
systems do, and it needs no change to the one-scalar-per-neuron arena.

**What emits.** Every cell radiates without anything being declared: heat in
proportion to its energy burn, chemical in proportion to its tag, motion in
proportion to its speed. Creatures become sources automatically, which is what
makes predator and prey perceivable without either being named.

**Cost.** One neighbourhood walk, and PHYSICS-2.md is emphatic that walks are the
expensive thing — the existing ones are 78% of the step. It must therefore FOLD
INTO the contact walk that already runs, as a branch inside a loop already paid
for, not as a new traversal.

**Already built, as the first instance of this:** a compass. Each cell reads its
own bearing against the world basis — northness or eastness, selected per cell —
with graded acuity, and what it does not know it reads as NOISE rather than as
zero. A blind compass returning 0 would be a confident claim of due east;
returning noise is honest ignorance, and it gives accuracy something to climb
from. Acuity costs energy in proportion to its sharpness, so a perfect sense is
not free and a cheap noisy one stays a live option.

## 7. What is missing, ranked

1. **Directional sensing of other bodies and of food** (§3). Nothing else on this
   list is reachable without it, and it is why sensors are being deleted.
2. **Consumption, `nutrition`, `toughness`, and corpses** (§5). The keystone: the
   only pressure that adapts as fast as the population does.
3. **`density` → mass** (`WORLDS.md` §3). Armour that costs speed needs mass to
   exist; it is one division in the integrator and is already specified.
4. **Eggs as physical objects** (§6, `eggs.md`).
5. **`tag`/`enzyme` matching** — diet specialisation, and the substrate for
   adhesion and multicellularity.
6. **A medium with state** (`WORLDS.md` §2) — jellyfish, wakes, drafting. Large,
   and not on the critical path.

The honest summary: **movement is working and is the least of it.** What stands
between here and a Cambrian is that nothing can see anything, and nothing is
food.
