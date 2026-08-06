# The World Manual

**The single current description of what this world is and how it works.** If
another document here disagrees with this one, this one is right and the other is
history. Twenty-odd design notes had accumulated, several describing mechanisms
that no longer exist; this exists so that stops happening.

Everything below is what the code does *now*, with the measurement that justifies
it. Where something is unmeasured it says so. Where something was measured and
then failed, it is marked **RETRACTED** rather than deleted, because the
retractions are the most reusable part of this project.

---

## 1. The laws

Two, and they have survived everything.

**First Law — nothing high-level is a primitive.** "Predator", "prey", "species",
"organism", "muscle", "armour", "locomotion" are *regions* of a low-level space.
Never types the kernel branches on, never role knobs, never interaction matrices.
If a change names a behaviour, it is wrong.

This is not decoration. It has been violated three times and each violation cost
real results:

- Contraction branched on `ctype == 2`, discarding **47%** of the contractile
  capacity in the tissue and leaving 18 of 64 bodies unable to move a bond
  despite carrying muscle.
- Feeding was independent of what a cell was, so specialising cost nothing and
  the world became **94% muscle**.
- "Organism" was an allocation unit with a hard slot count, which capped the
  population **4.3× below** what the memory held and forced births to equal
  deaths.

**Friction law — never mint, always conserve.** Every joule traces to the fixed
sun and dissipates to heat. One currency. Global-uniform inflow is legitimate;
local-targeted grants are fiction. Test: *if nothing is ever unaffordable, you
minted somewhere.*

The world has exactly two boundary conditions, both explicit: **the sun**, and
**cellzero's packed lunch** (§4).

---

## 2. What a world is made of

A **list of cells**. That is the whole ontology.

A cell has a continuous position on an unbounded 2D plane (toroidal wrap), a
radius, a velocity, an energy, a durable 64-bit identity, one or two parents, a
lifebook, and a set of continuous material capacities. It persists in continuous
time. There is **no grid anywhere** — positions are floats, fields are analytic,
and the spatial hash is a query radius that nothing is ever snapped to.

Every cell is also a CTRNN node. There is no separate neuron population; that is
what "brain-is-body" means, and it is why a HUD field named "neurons" could only
ever repeat "cells".

**Organism, species, clone and guild are QUERIES**, not types. A body is the
maximal set of bonded cells sharing a lifebook. Nothing in the kernel needs to
know what an organism is.

### Cell state, as built

| quantity | where | notes |
|---|---|---|
| position, velocity | `pos`, `vel` | continuous f32 |
| radius | `vel.z` | per cell, varies |
| energy | `energy` | capped at `eCap`, floored at `eFloor` |
| cell type | `cmeta.x` bits 0–1 | a *label read off* the capacities, not stored intent |
| compass acuity / axis | `cmeta.x` bits 2–7 | |
| contractility | `cmeta.x` bits 8–15 | drives force, continuously |
| grippiness | `cmeta.x` bits 16–23 | drives traction |
| axial position | `cmeta.x` bits 24–30 | head→tail, for gaits and bearings |
| brain slot | `cmeta.y` | |
| body id | `cmeta.z` | for analytics and self/other |
| body size | `cmeta.w` bits 0–7 | |
| surface tag | `cmeta.w` bits 8–15 | what you are made of |
| toughness | `cmeta.w` bits 16–23 | resists being eaten |
| enzyme | `cmeta.w` bits 24–30 | what you can digest |

Everything is packed because **Chrome caps a compute stage at 10 storage buffers
and the world uses all 10**. Adding an eleventh does not throw — the bind group
goes silently invalid, the pipeline no-ops, and every activation reads zero,
which presents as a dead brain nowhere near its cause. `device_limits_test.js`
exists to catch exactly that.

---

## 3. Descent

**Nothing appears from nowhere.** Every cell was made by a prior cell. Exactly one
cell in a world's history makes itself: **cellzero**.

- `lib/lineage.js` mints ids and appends `id,parentA,parentB,lifebook,step` to
  disk. Full ancestry needs the dead, and they do not fit in memory. ~60 bytes a
  record at ~4 creations/step: the file *is* the tree of life and outlives the
  process.
- **`parentB` exists and is always −1.** Two-parent creation is syngamy and needs
  a mechanism that does not exist yet. The slot is reserved because retrofitting
  arity into a lineage format is miserable — and because the moment it is used
  **the tree becomes a DAG** and everything walking it must know.
- Float64, not BigInt: exact to 2^53, which is >100,000 years at this rate.
- A **lifebook** is the chapter. Cells in a body share one and are clonal; an egg
  copies its parent's with variation, and that is where a line divides. Two
  lifebooks may hold identical genomes by coincidence and remain different
  chapters — descent is a fact, similarity is an observation.

A resumed world inherits whatever ancestry its snapshot carries, possibly none.
History lost is a fact about that run, recorded as parent −1.

---

## 4. Development — the GRN in an egg

`lib/devo2.js`. A genome is a sparse **gene regulatory network**: 64 products, 6
regulators each, non-negative concentrations with production, decay and
per-product diffusion.

```
dc/dt = P·σ(bias + Σ w·c) − λ·c + D·∇²c
```

Same shape as the brain, with production and decay where the neuron has leak.
Mutual exclusion is just `w_ab < 0, w_ba < 0`.

**The body grows.** One cell, dividing where the network says to. Division is a
**rate**, not a poll: readiness accumulates at a rate set by the `grow` output and
fires at 1. Daughters are placed outward from the local crowd, rotated by an
evolved `divideAngle`, at an evolved `spacing`, refusing to overlap.

**There is no lattice.** Both encodings used to lay cells on a hex grid, which
fixed every neighbour count at 4–6 and made every body a triangulated truss —
bodies deformed **3.4%** of their length under muscle. On continuous placement
that became **103%**, and 46% of cells now sit at degree ≤2.

Reserved genes: `AP DV RAD NOISE CROWD` (maternal/local inputs, clamped, never
integrated). Outputs: `grow survive contract sense grip stiff tau bias senseTune
divideAngle spacing dispersal toughness tag enzyme`.

**Development is canalised.** Noise is derived from the genome, so a genome builds
the same body every time. Before this, within-genome variance was 3× the
between-genome signal (h² = 0.093) and directed selection ran *downhill* because
it was chasing lucky developments.

**Seeding is variation, not outcome.** Evolution cannot select for a capacity that
is not in the population. Founders are seeded with contractility, an axial
connectome, and edible tissue — each because measuring found it absent and the
trait unreachable. Whether any survives is still the economy's decision.

### RETRACTED
- *"Dev 2.0 fixes morphology."* Elongation p50 is ~0.94 — round. The machinery for
  filaments exists (crowding as an input, evolved angle and spacing) and nothing
  rewards using it.
- *"The egg is a shape."* A body filling a shell is a disc whatever the network
  says; the egg must be much larger than a compact body of `maxCells`.

---

## 5. Physics

Cells are spheres. Each step: bond springs (rest length driven by muscle) → bond
dampers → contact repulsion → medium drag → integrate → anisotropic frictional
decay about the body axis → toroidal wrap.

**Inertia exists** (`v` integrates force). **Mass does not** — every cell is mass
1, and `density`→mass remains unbuilt.

**The medium has no state.** `flowAt(p)` is an analytic curl field: it pushes
cells, cells never push back. So **jellyfish and fish are unavailable by
construction** — no wake, no vortex, no added mass, no drafting. What exists is
crawling on a gritty plane: anisotropic drag (route 2) and non-reciprocal
kinematics (route 3).

### Locomotion, measured

Two routes, and they are synergistic. 30 founders, 300 s, muscles-off control at
exactly zero:

```
both routes                p50 1.119   p90  9.098
no undulation (aniso 0)    p50 0.057
no grabber (gripHold 0)    p50 0.176
neither (isotropic)        p50 0.005     ← no third route exists
grip unmodulated           p50 0.119     ← the scallop theorem, 9× worse
```

Three things had to be true and none were:

1. **Muscle was 10–20× too weak.** `contract` 0.45 → 5.0 gave 24× the
   displacement, with bodies ending at 0.82–0.97 of their starting span (so not
   the dismemberment artefact). `muscleCost` scales with it or the population
   dies — at the old rate it fell 300 → 11.
2. **Grip did not anchor.** It only resisted *sideways* slip, so a gripping cell
   slid along its own axis as freely as a released one and there was nothing to
   pull against. `gripHold` fixes it. `fricK` 6 → 2 because at 6 *both* phases of
   the cycle were overdamped against a 0.7 s gait.
3. **Nothing drove it.** `SYN_BASIS`'s antisymmetric `axial` term — the exact
   asymmetry a travelling wave needs — was never seeded, so a CPG had to be
   invented from nothing.

**The diagnostic that broke a months-long deadlock**: drive muscles from an
imposed `sin(axial·k − ωt)` instead of the brain. It splits "why doesn't it move"
into "body or controller?", which are both answerable.

### RETRACTED
- **`swim-verify.js` was never a control on our physics.** It is a *separate CPU
  model* — hand-placed 9-node chain, transverse force rather than rest-length
  change, own constants, body 30× smaller, no shared code. Its 36 body-lengths
  says nothing about the GPU kernel.
- **The body axis was arbitrary** (first two bonds in slot order) — correct for a
  chain, meaningless for a hex body. Fixed to follow the head–tail gradient.
  Displacement moved 0.110 → 0.095: *no effect*. A correct fix that bought
  nothing.

---

## 6. The brain

CTRNN, one node per cell, K incoming edges, `state += (acc − state)·dt/tau`,
`act = tanh(state + bias)`.

**tau is a cliff, not a gradient.** `dt/tau` is how far a neuron moves toward its
input each step; at the old floor of 0.018 s against dt 0.015 that was **0.83** —
a comparator, not an integrator, emitting square waves whatever the weights did.

```
0.018–1.80s   jumpy 1.000   med 33.3 Hz   in-band  1–13%
0.126–1.26s   jumpy 0.065   med  1.72 Hz  in-band    34%    ← shipped
0.239–1.51s   jumpy 0.025   med  0.33 Hz  in-band    49%
```

Below `dt/tau ≈ 0.12` traces are smooth and the rhythm lands in the 0.3–3 Hz band
the drag time constants can convert into travel.

**Logistic vs tanh.** For the GRN the output must be non-negative, and
`(tanh(x)+1)/2 = σ(2x)` exactly — so there it is purely a gain, not a shape. Where
it is substantive is the brain, which uses tanh and is *centred*: a silent network
is quiescent and excitation/inhibition are symmetric about zero. Untested.

### RETRACTED
- **`SYN_RANGE = 64`**, set on a sweep concluding "drive is too weak". That sweep
  ran when every fast neuron was a comparator. Re-measured at corrected tau, 64
  and 128 return to `jumpy 1.000` and flip at the sample rate. 32 is where
  smoothness, in-band rhythm and median self-propulsion coincide.
- **Fan-in normalisation**, re-tested and still rejected: it lowers `|state|` by
  ~K, which is the *same lever* as lowering gain, and buys nothing on top.

---

## 7. The economy

Energy enters as a fixed sun, is drawn from motes, and leaves as heat. Costs:
`brainTax` per cell, `muscleCost × |contraction|`, `senseCost × acuity`,
`toughCost × toughness`. Feeding is anticorrelated with force capacity
(`absorbTradeoff`) so a cell committed to contraction is worse at uptake.

**Consumption** — primitives.md's, roleless and graded:

```
energy A←B  at  max(0, effort_A − toughness_B) × nutrition_B × digestMatch(enzyme_A, tag_B)
```

You must overpower it, it must be worth taking, and you must be able to digest it.
The capability is the attacker's own contraction — pressing is what a muscle does,
already commanded and already costed — so **biting costs exactly what pressing
costs and no new verb enters the world.**

**Nutrition is not a trait.** It was one, and selection deleted it in 30
generations (seeded 0.396 → measured 0.006), because being edible is a pure
liability. It is now read from the cell's **stored energy**: you cannot be
simultaneously energy-rich enough to live and worthless as a meal. Reserves make
you viable *and* make you a target.

**Armour must be able to pay.** At `toughCost 0.30` it broke even only against 3.3
*simultaneous* attackers and toughness collapsed 0.149 → 0.019. At 0.05 it breaks
even below one attacker.

### THE STRUCTURAL LESSON

**A fixed cost against an adapting population is a hill the population walks
down.** Three times over:

- `brainTax 0.4` — 12× turnover, then the population evolved cheap, energy climbed
  12 → 26.5, deaths collapsed.
- `contest + crowding` — movers out-earned sitters for 900k steps; muscle rose to
  54% then fell to **3.2% by generation 210**.
- `absorbTradeoff 0.4` — sweeps said 29% sensors; the live world read 3.8%.

Tuning harder only changes which hill. This is the argument for consumption: it is
the only pressure whose difficulty **scales with what the population became**.

---

## 8. Perception

Until recently **nothing in this world could perceive anything alive.** A sensor
read `tanh(|flow − v| + noise)` — the medium and a noise field. Predator, prey,
mate and rival were not absent but *unreachable*, and 3.8% sensors was the correct
response to an organ reporting the weather.

Two senses now exist, both graded by an evolved acuity that **costs energy**:

- **A compass.** The cell's own bearing against the world basis (northness or
  eastness, selected per cell). What it does not know it reads as **noise, not
  zero** — a blind compass returning 0 is a confident claim of due east.
- **Neighbours.** Sensors integrate nearby cells' *relative motion* over a
  gaussian receptive field with cosine directional tuning. Own body excluded by
  body id.

Verified with a double control: a lone body reads **exactly** the no-sense control
(0.4968 both); the same body in a crowd reads differently.

**Range is a hard limit, not a tuning choice.** The walk reaches
`senseBuckets × hashCell`; three sigma must fit inside it. At σ 6.0 against a 3×3
walk of hashCell 1.2 the field was silently truncated to a tenth of itself — the
maths described vision and the walk delivered touch. It is a **proximity** sense
(~4.8 units), and long-range perception needs a different structure, not a bigger
number. Cost: 115 → 77 steps/s, paid only by sensor cells.

---

## 9. Where it stands against the goal

**Goal: make organisms each other's dominant selective pressure, and show it
survives deep time.** Three criteria, each of which must hold at 10× the runtime
that produced it.

**Escalation — first real evidence.** Same seed, one difference:

```
                            contract        toughness
consumption, armour @0.05  0.355 → 0.510   0.149 → 0.188   ← both rise
consumption, armour @0.30  0.355 → 0.467   0.149 → 0.008   ← defence collapses
no consumption at all      0.378 → 0.034   —               ← attack collapses
```

Muscle pays only when there is something to press against; armour appears only
when it can pay; then they climb together.

**Disparity — not shown.** Noisy, with spikes (0.42 → 0.49, briefly 1.31), no
sustained rise.

**Guilds — not shown.** Dietary matching (tag/enzyme) has just landed and its
diversity effect is unmeasured.

**Deep time — not shown for anything.** Measurements are at 75k steps. The muscle
result that looked solid at 900k reversed by generation 210.

A correction to my own framing: **lineage count is the wrong diversity measure.**
It counts surviving founder lines, and since no new founders are created it can
only fall — coalescence, not extinction. In a real Cambrian every lineage also
traces to one ancestor. **Disparity is the measure.**

---

## 10. Running and measuring

```sh
deno run -A --unstable-webgpu tools/serve-world.js --cells 100000
```

**One knob: `--cells`, the universe's cell budget.** Body count and body size are
outcomes of development and the economy; a flag that appears to set them lies
about what this world is. Body slots, arena width and world bound are all derived.
`--founders 1` is a literal single-cell origin and currently **stalls** (the pair
settles at 8.3 against a birth threshold of 18).

Instruments in `tools/motion-*.js`: live displacement tracked by **uid** (slots
recycle; tracking by slot records recycling as movement, which wrecked a
measurement once), trajectory plots, vector snapshots, the imposed-wave drive.

**The rules that keep it honest:**

- Every displacement claim carries its **muscles-off control**. No control ⇒
  retracted.
- **Distrust every single run.** Three separate times a trend from one measurement
  per rung turned out to be noise, and the three disagreed including on sign.
- **A result that does not survive 10× longer runtime is retracted, loudly.**
- **No metric becomes a target.** If tuning aims at a number, that number is
  thereafter suspect as a measure.

---

## 11. What is missing, ranked

1. **Geography** — a height field and a mud field, giving islands, water, lush
   lowlands, impassable heights and mud-rivers that carry things. Spatial
   heterogeneity is the strongest diversity-maintaining force there is, and
   diversity is exactly what is failing.
2. **Corpses** — death vacates a slot and the matter vanishes. A body that dies
   still-nutritious funds scavengers, and closes the matter loop.
3. **`density` → mass** — armour that costs speed needs mass to exist. One
   division in the integrator.
4. **Eggs as physical objects** — a vulnerable stage is what makes guarding,
   hiding, dispersal and timing worth evolving. All behaviours, so all blocked on
   perception, which now exists.
5. **Syngamy** — `parentB` is reserved and unused.
6. **A medium with state** — wakes, drafting, jellyfish. Large, needs a grid, and
   `CELLS.md` would need amending rather than ignoring.

---

## 12. The other documents

Every design document in this directory now carries a banner under its title
saying which of these two it is. **Where any of them disagrees with this manual,
this manual is right** — that is the whole point of there being one.

**Still current** — this manual summarises them; they hold the detail and the
argument, and they are maintained.

| document | what it is for |
|---|---|
| `primitives.md` | the schema everything hangs off. Six of nine material axes now built |
| `energy-speculative-friction.md` | the conservation law, in full |
| `CELLS.md` | the ontology ruling — why a cell is a legitimate atom and a species is not |
| `CambrianConditions.md` | the standing goal, and the ranked list of what is missing |
| `DEVELOPMENT-2.md` | the spec for the encoding that is running |
| `WORLDS.md` | the medium, the scale budget, the starter-world library |
| `PHYSICS-2.md` | the engine: where the time goes, what new physics must obey |
| `REGIME.md` | what this world's physics can and cannot reward |
| `eggs.md` | reproduction in time and space. Still the programme; unbuilt |
| `METHODS.md` | autoresearch over primitives; the brain-is-body argument |
| `ASCENT.md` | the category-free ascent instrument |
| `AUTORESEARCH.md` | closing the loop, and the anti-reward-hacking guards |
| `RUNNING.md` | how to run the world |
| `visual-language.md` | how the world is drawn, and why |
| `RESEARCH.md`, `LAB-NOTES.md` | the ledger. Long, and where the retractions live |

**Superseded** — history. Read them for how the reasoning was arrived at, never
as a description of what the code does.

| document | why it is history |
|---|---|
| `WORLD.md` | the world as designed before development, perception, consumption and geography existed |
| `ARCHITECTURE.md` | a code arrangement since rebuilt around cells and descent |
| `AUDIT.md` | its central finding — cell types violate the First Law — was **withdrawn** by `CELLS.md` |
| `MISSION.md` | the ambition still stands; its "17× locomotion" headline is **retracted** |
| `CELLWISE.md` | a cellwise redesign that has since been built, differently |
| `sample-drawings.md` | sketches from before the visual language settled |

## 13. See also

- Chancellor, G. & Keynes, R. D., *Darwin and the Galapagos*, Darwin Online.
  <https://darwin-online.org.uk/EditorialIntroductions/Chancellor_Keynes_Galapagos.html>
