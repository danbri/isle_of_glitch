# World design — conditions for an infinite-ascent arms race

Companion to `MISSION.md` (the goal) and `RESEARCH.md` (what has been measured).
This is the world we are trying to build and *why* — the god's-eye design brief.
Captured from the design conversation; treat it as binding intent, to be built
incrementally and measured the way everything else here is.

## THE FIRST LAW — nothing high-level is a primitive (read this before you tune anything)

**"Predator" is not a property of anything in this world. Neither is "prey,"
"organism," or even "entity." The only primitives are cells, the forces between
them, and the fields they sit in. Everything above that — a body, a herd, a
hunt, a boat, a corpse — is a PATTERN that those primitives fall into, never a
flag you set.**

This is a standing correction to a real mistake made in `godsim.html`: to get
predators to catch prey, the code did `predatorSpeed = 1.35` — it reached into
the equations of motion and hand-set the outcome it wanted. That is forbidden.
If one lineage outruns another, the cause must be **lower down**: its muscle
cells convert fuel to force more efficiently, or it carries more fuel, or its
body plan is better shaped for thrust. You earn the fast predator by building
the chemistry that makes it fast; you never type the speed in.

The test to apply to any new mechanism, every time: **"Am I setting a high-level
outcome, or causing it from below?"** If a knob is named for a role
(`predatorSpeed`, `preyFleeRate`, `herbivoreRepro`), it is almost certainly the
wrong knob. When you catch yourself wanting a role-named knob, stop and work out
the low-level story that would produce it — that story is the actual feature.
Playing god means setting initial conditions and chemistry, then watching what
grows; it does not mean editing the motion of the things that grew. Every crutch
we take before this is possible (see "The shortcuts ledger," Part III) is logged
as a debt to be paid.

**The primitive boundary, drawn exactly (a sharpening forced by a second mistake
— an "attraction between two cell types" matrix, which is the same sin as
`predatorSpeed`: it hands a cell the *decision* to approach or flee).** The ONLY
primitives are:
- **Physics** — point masses, volume exclusion (cells can't overlap), muscle
  actuation (force along a bond a cell drives with its own fuel), viscous drag,
  and persistent division bonds.
- **Chemistry** — fields that diffuse and decay; a cell *secretes* into them
  (what it secretes is expressed, under its own genetic/neural control); a cell
  *senses* them; surface-adhesion molecules that *bond by physical
  complementarity* (a cell sets its own surface flavour, so kin match and stick);
  digestive enzymes that *react with a matching substrate on contact*.

Anything about **which way to move** — approach, flee, chase, herd — is NOT a
primitive. It is the **CTRNN's output**: the cell smells what another secretes
and its evolved brain drives its muscles up or down that gradient. "Attraction to
type X," predator/prey, and "type i eats type j" all dissolve into the same
evolved loop — **secrete, sense, decide (brain), actuate (muscle), react
(enzyme)** — none of it declared. If a knob sets a force, a rate, or a preference
*between named types*, it is the wrong knob; the right ones set diffusion, fuel
yields, drag, exclusion stiffness, and mutation — the stage, never the choice.

## The problem this answers

Eight experiments established one wall, stated most sharply as: **sensing never
pays because wandering is free.** In a small arena with a mobile body, a reflex
that covers or sits collects almost any stationary reward without ever using a
sense, and selection — which scores *what a body does, never how* — can never
prefer a sensing mind to a reflex that acts the same. Every world change below
is, at root, a way to make the environment one where the reflexive shortcut
does not exist and sensing is the only implementation of the winning behaviour.

## Organizing principle: minimalism, and vector fields as the one primitive

**Feel a pressure for minimalism.** Do not build needless infrastructure
complexity. Every mechanism must earn its place by creating a trade-off, a
niche, or a reason to sense — not by being realistic. Prefer a few general
primitives that compose over many bespoke systems.

The unifying primitive is the **vector/scalar field**: a small number of fields
over the 2D world, sampled per cell, updated cheaply. This is the parsimonious,
GPU-friendly backbone — field update is a stencil pass, per-cell sampling is
O(cells), and generators like Perlin/curl noise are closed-form and cheap.
Almost everything below is expressible as "another field" or "a coupling
between fields," which is the point: one efficient mechanism, many dynamics.

## The central idea: the medium sets the planning horizon

The deepest design intuition, worth stating first because it reframes the whole
mission. **Evolving underwater vs on land differs in how far you can sense.**

- **Underwater / opaque medium:** poor long-range vision. Survival behaviour is
  necessarily *reactive* — hide or run the instant a threat is close. There is
  no time to plan, so intelligence beyond a fast reflex does not pay.
- **On land / transparent medium:** you see a predator coming seconds, minutes,
  even hours out. That lead time is *what motivates smarts* — planning,
  anticipation, route choice, deception. Foresight only pays when the world is
  legible far enough ahead to act on.

So sensing range is not a parameter to tune for its own sake — it *is* the knob
that decides whether cognition can pay at all. A world where the relevant
signal has **sufficient dropoff/gradient to affect distant behaviour** gives
sensing a horizon to work in. The measured wall ("sensing never pays") may be
partly a wall of our own making: a short-range sense in a small arena is the
underwater world, and we never built the land.

## World structure and scale

- **Make the play world larger.** A small arena lets coverage substitute for
  search; scale defeats the free-wandering shortcut because you cannot sweep
  what you cannot reach in an episode.
- **No gravity, and that is good.** Keep it — a gravity-free plane uses all of
  2D (cf. Pac-Man / Asteroids, which use the whole board) rather than collapsing
  to a platformer's 1D-plus-jump. Exploration and problem-solving in two full
  dimensions is the space we want.
- **Beware the curse of low dimensionality.** A 2D world is easy to get
  *stuck* in — a body wedged in a corner or a gap. Creatures must be able to
  squeeze **through narrow spaces** (think squishy octopus): the soft body is an
  asset here, deformable enough to pass gaps a rigid body could not. Narrow
  passages then become real problems that reward spatial sensing and planning.
- **Macro-ecology: deserts, jungles, islands.** Heterogeneous regions with
  different resource densities and dynamics create distinct niches. Remember
  Darwin and island speciation — separated regions let sub-populations diverge,
  which is a generative source of diversity an homogeneous world cannot supply.
  Islands and barriers are cheap (a terrain field) and buy speciation.

## Resource dynamics — make food impossible to collect by wandering

- **Mobile food / predation.** A moving target cannot be collected by a fixed
  coverage pattern — tracking it requires reading where it is now. This is the
  most direct answer to "wandering is free": make the reward move.
- **Shaped resource distributions** — food in **crescents, circles, trails**,
  not uniform scatter. Structure creates followable gradients and spatial
  problems (follow the trail, round the crescent) that a blind sweep handles
  worse than a sensing follower. Shape is information.
- **Sufficient gradient dropoff** so the resource signal carries useful
  direction at range, per the medium/horizon point above.
- **Food from the same lifecycle as the other life forms.** Close the food web:
  the food is itself an organism (autotroph / plant / prey) on the same
  developmental substrate, growing and evolving, not a scattered scalar. A
  living, evolving resource base is the precondition for a real arms race rather
  than a foraging task against a static field.

## Field dynamics — chemicals, flow, terrain

Model as a small set of coupled fields, sampled by cells:

- **Chemical fields:** CO2, oxygen, water. Diffusing scalar fields that cells
  produce/consume and sense — the substrate for gradients worth following and
  for metabolic trade-offs (an oxygen debt, a CO2 plume that marks where life
  has been).
- **Flow fields:** wind, water current, rain. Vector fields that push bodies and
  advect the chemical fields, so a smell is carried downstream and sensing
  upstream/downstream matters. Flow makes the chemical fields directional and
  time-varying for free.
- **Terrain from noise:** Perlin/curl-noise **rocks and structure** to shape the
  flow and chemical dynamics — obstacles that channel current, create eddies,
  cast chemical shadows. A closed-form noise field is the cheapest possible
  terrain generator and gives endless non-repeating structure.
- **Coupling into development.** Some interaction between these fields and cell
  development — a cell's fate/growth responds to the local chemical or flow
  environment, so morphology is shaped by where in the world an organism grows
  (an oxygen-rich vs starved region grows different bodies). This is where the
  world writes back into the evo-devo, closing a loop the current substrate
  does not have.

## Locomotion, topology, and invented dynamics

- **Narrow-space passage** as above — the squishy-octopus affordance turns
  topology into a solvable problem rather than a trap.
- **Invented state-dependent dynamics** that create trade-offs, e.g. **water
  retention after eating** — a fed body holds water, becomes larger/less
  deformable, and is *more easily trapped* in narrow spaces. Eating now has a
  mobility cost, so gorging vs staying nimble is a real decision. This is the
  kind of cheap invented rule (one scalar of body state coupling to
  deformability) that manufactures a trade-off without new infrastructure.

## Localised forces — later, but plan for them

No sunshine or weather as such, but plan the architecture to allow **localised
force effects**: magnetism-like or local-gravity-like fields that are confined
to a region and can create **microorbits** — a body caught in a local attractor,
a region you must power through or exploit. These are just more vector fields
with a local kernel, so they fit the one-primitive design; flagged as future
because they earn their place only once the base fields exist.

## The god's job, and the discipline

We are playing god: engineering conditions for an infinite-ascent arms race
through **trade-offs and niches** — deserts and jungles and islands, mobile prey
and living food, currents and chemical gradients and narrow passages, each
creating a way to make a living that a different body does better. The aim is a
world rich enough that no single reflexive strategy dominates, so that sensing,
planning, and morphological specialization each pay somewhere.

**But hold the minimalism line.** Every one of these is a candidate, not a
commitment. Build the cheapest version that could create the trade-off, measure
whether it does (does blinding the relevant sense finally cost something?), and
keep it only if it earns its keep — exactly as every mechanism in `RESEARCH.md`
was kept or retired. A world of needless infrastructure is a failure even if it
is realistic. Parsimonious mechanisms — a handful of GPU-efficient fields that
compose — over bespoke complexity, always.

## Build order (proposed, to be revised by measurement)

1. **Larger world + a real gradient with range** — the "land not water" test:
   does a long horizon make sensing pay where the small arena did not.
2. **Mobile / living food** on the same lifecycle — remove the stationary
   reflexive route and close the food web.
3. **One chemical field + one flow field** advecting it — the minimal vector-
   field backbone, sensing made directional and time-varying.
4. **Noise terrain + narrow passages + the deformability/water-retention
   trade-off** — topology as a solvable problem.
5. **Field↔development coupling**, then **islands/regions**, then **localised
   forces** — only once each prior layer has earned its place.

Each step judged by the one measurement this project trusts: does the sense
become load-bearing — does blinding it finally cost something — and does it do
so without a reflexive shortcut sneaking back in.

---

# Part II — the sensory and physical primitives, and the architecture

Added after `fieldsim.html` proved the field backbone works and looks right, and
after the motor-burden finding (see RESEARCH.md) showed the creatures can be made
to sense once locomotion is decoupled from sensing. Written plainly on purpose:
other AIs and humans both need to read and act on this, so nothing here is
shorthand.

## The one idea that unifies the whole wishlist

The long list below — pheromone trails, writing, sound, sonar, screams, heat,
light, shadows, portable rocks and lamps, stickiness, sensing the age or size of
things — looks like a dozen separate systems. It is not. **Almost every item is
one of three cheap, GPU-friendly things, or a coupling between them:**

1. **A field.** A scalar or vector quantity spread over the 2D world on a grid,
   that diffuses, drifts in a current, or propagates as a wave, and that anything
   can deposit into or sample from. This is exactly what `lib/fields.js` and
   `fieldsim.html` already do. A smell, a sound, heat, light — all fields, they
   differ only in how fast they spread and decay.
2. **An entity.** A thing with a position: a creature, a food item, a rock, a
   lamp. Stored as a buffer of particles. Entities emit into fields, read from
   fields, and can attach to one another.
3. **A coupling.** A rule that connects the two: a body *writes* to a field (lays
   a trail, makes a sound), a body *reads* a field (smells, hears), a body
   *attaches* to an entity (picks up a rock), or a field *reflects* off an entity
   (sonar echo).

So the design discipline stays the same as the mission's: do not build a dozen
bespoke systems. Build a good **field engine** and a good **entity/attachment
engine**, and then everything below is a short entry in a table of couplings.
That is the parsimony that keeps this cheap and keeps it portable to the GPU. If
an idea cannot be expressed as a field, an entity, or a coupling, be suspicious
of it.

## The primitive catalogue — decisions made

For each: what it is, which of {field, entity, coupling} it is, its cost and
whether it is continuous (all of these are continuous, which is required), and
the decision. "Decided in" means it belongs in the world; ordering is a build-
order hint, not a veto.

- **Pheromone trails / footprints.** A chemical field a body deposits into as it
  moves; other bodies read the gradient and follow it. This is stigmergy — ant
  trails, scent marking. Coupling: body writes (deposit), body reads (sample).
  Cost: trivial, it is the `deposit` + `diffuse` that already exist. Decided in.
  It gives coordination and trail-following without any direct body-to-body
  channel, which is the cheapest possible route to collective behaviour.

- **Writing / messaging.** The same as a trail, except the body *chooses the
  payload*: a motor output selects what value (or which of several fields) to
  deposit. A reader senses it. This is the seed of signalling and proto-language:
  a mark that means something because behaviour evolved around it. Coupling as
  above. Cost: trivial. Decided in.

- **Sound / clicks / screams.** An acoustic field that propagates FAST and decays
  fast, unlike slow chemical diffusion — so it is long-range and near-instant. A
  wave-equation stencil, or, if that is too costly, a fast-relaxing field as an
  approximation. Coupling: body emits a pulse, bodies sample. **This is important
  for the mission:** sound is how you get a long sensory horizon in an opaque
  ("underwater") medium where light does not carry — echolocation is the marine
  animal's answer to the water-vs-land problem. Cost: a stencil, cheap-ish.
  Decided in.

- **Sonar / echolocation.** Emit a pulse and sense its ECHO — the reflection off
  terrain and other bodies. Coupling: emit, reflect off the terrain field and
  entities, sense the return. Gives distance and shape in the dark, a long-range
  spatial sense. Slightly more expensive (needs the reflection step). Decided in,
  after plain sound works.

- **Hot / cold (temperature).** A heat field that diffuses out from sources;
  bodies sense local temperature and may have thermal preferences or pay a cost
  off their preferred band. Coupling: source emits, body reads. Cost: a diffusion
  field, cheap. Decided in. Creates thermal niches (deserts vs shade) for free.

- **Light and heat sources.** Emitters — entities that cast a field. Heat as a
  diffusing field is cheap. Light with hard shadows needs occlusion and is more
  expensive; start with soft occlusion (attenuate light by how much terrain sits
  between source and point) and add sharp shadows only if they earn their place.
  Coupling: emitter writes a field, possibly occluded by terrain/bodies. Decided
  in (heat first, light/shadow as a refinement).

- **Shadows.** Occlusion of the light field by terrain and bodies — the dark side
  of a rock, the shade a big body throws. Cheap approximation: attenuate light
  along the line from source to point by the terrain density it crosses. A place
  to hide, a thing to sense. Decided in, as a refinement of light.

- **Portable light/heat sources and portable rocks.** Sources and rocks are
  ENTITIES a body can GRAB and CARRY — an attachment constraint in the physics.
  This unlocks tool use and niche construction: carry a lamp into the dark, drag
  a rock to block a passage or build a wall, move a heat source to warm a nest.
  Coupling: an attach/detach constraint between a body and an entity. Cost: a
  cheap extra constraint in the physics pass. Decided in — this is high value for
  problem-solving and is a strong driver of intelligence, because a portable
  object is a lever on the world.

- **Stickiness.** A per-surface adhesion value that adds an attractive force in
  the contact pass, so bodies stick to sticky terrain or to each other. Enables
  climbing, trapping prey, building, holding on in a current. Coupling: modifies
  the existing contact force by a stickiness scalar (evolvable per cell, and
  per-terrain-region). Cost: a term in the contact pass, cheap. Decided in.

- **Refined sensory distinctions — age, size, identity.** Sensable things carry a
  short TAG vector: how old they are, how big, what type, and a few evolvable
  identity bits (so kin-recognition or signalling can evolve). Close-range
  sensors read the tag; distant sensing gets only presence. This is what lets a
  creature tell an old prey from a young one, a big threat from a small one, kin
  from stranger. Coupling: entity carries a tag, sensor reads it within a radius.
  Cost: linear in the tag width, a handful of extra sensor channels. Decided in.

## How the primitives touch the three engines — so the work is clear

- **Physics engine.** Portability = attach/detach constraints. Stickiness = a
  term in the contact force. Rocks = obstacles in the collision pass. Sound
  pressure could optionally push bodies. All of these are small additions to the
  XPBD constraint/contact passes that already exist, and all keep the
  Jacobi/per-particle shape that makes the physics GPU-portable.

- **Cell / DNA (development) model.** Development gains new cell ROLES to grow:
  not just sensor/neuron/muscle, but sensor-of-what (chemical, acoustic, thermal,
  photic) and emitter-of-what (deposit chemical, emit sound, emit light), and
  grabber cells that can attach to entities. The role readout gets more channels.
  And — this is the part the user asked for directly — **development can read the
  fields**: a cell's fate can depend on the local heat, light, or chemical it
  grows in, so the same genome grows a different body in a warm bright region
  than in a cold dark one. That closes the loop where the world writes back into
  the creature, which the current substrate does not have.

- **Living-cell stepping (lifetime).** Sensors sample the fields at the cell's
  position; emitter cells deposit into fields; grabber cells form/break
  attachments; the CTRNN is unchanged in form but gains input channels for the
  new senses and output channels for the new signals and grabs. Nothing about
  the integrator changes — it is more channels on the same machine.

## The four architecture questions, answered plainly

### Can it all go on the GPU? Yes, and the codebase has been kept in the shape that makes it a port rather than a rewrite.

Everything here is either a field (a grid updated by a stencil, sampled per
point) or a per-particle kernel with no sequential dependency between elements.
Both `lib/softbody.js` and `lib/fields.js` are already written that way on
purpose — Jacobi diffusion, semi-Lagrangian advection, structure-of-arrays
buffers, the XPBD constraint solve split into accumulate/apply so there is no
read-write hazard between workgroups. That is exactly the WebGPU compute-shader
dispatch shape.

The port, concretely: fields become storage textures or buffers, their updates
become one compute pass each (these port almost trivially — a stencil is the
easiest thing a GPU does). Cells become particle buffers; the physics passes
become compute passes. The CTRNN becomes a batched matrix-vector product. The
one genuinely harder piece is neighbour-finding for the soft-body contacts and
adhesion on the GPU, which needs a spatial-hash grid — a standard, well-
documented technique, not research. The host in this session has no GPU, so we
develop on the typed-array CPU fallback, but the shape is preserved so the port
is mechanical. `tools/backend.js` already scopes the WebGPU path (Deno exposes
`navigator.gpu`). Bottom line: yes, feasible; fields are easy, physics needs a
spatial hash, and the whole design has been protecting this option the entire
time.

### Bigger and wraparound? Yes — cheap, and actually better.

Bigger is not cosmetic: `tools/land-control.js` measured that a world too large
to sweep in a body's travel budget is exactly what makes sensing pay instead of
coverage. So a larger world is a feature, directly in service of the mission.

Wraparound (a toroidal world, edges wrap to the opposite side) is cheap and
removes problems. In the fields it is a one-line change: the diffusion stencil's
neighbour index wraps instead of clamping. In the physics, body positions wrap
(position modulo world size). Toroidal has three benefits: it deletes walls and
corners, which the creatures kept exploiting as degenerate refuges; it makes all
of the 2D plane uniformly usable (no privileged centre or edge); and it is
actually simpler code because there are no boundary special cases. It composes
fine with regions and islands — you get those from terrain-field barriers
(ridges of rock), not from hard walls. Decision: go toroidal and go bigger.

### Use Karpathy's autoresearch to structure the god-play? Yes — but the objective has to be one that cannot saturate.

The research loop in `RESEARCH.md` is already autoresearch-shaped: propose a
change, run a fixed-budget experiment, keep it only if it clears a significance
bar, roll back otherwise. For god-play — twiddling world knobs, enabling
primitives, tuning fields — each experiment is a world-config change, which fits
that loop directly.

The one thing to get right: **infinite ascent has no fixed scalar to maximise.**
We measured that single objectives saturate (the 17× displacement climb, then
nothing). So the autoresearch objective for god-play cannot be a fixed fitness —
it must be something that keeps rising only while the world keeps generating new
capability. The honest candidates are the **ancestral tournament** (is this
generation more capable than its frozen ancestors — the instrument we already
built for the arms race) and **open-endedness / diversity / complexity metrics**
(is the population still producing genuinely new behaviours). So: yes, wire an
autoresearch harness whose inner job is "evolve in world-config X for a budget,
measure capability-against-ancestors and behavioural diversity, and keep the
config change only if the ascent curve gets steeper or longer." That is the
god's version of the loop, and it is the right way to search the enormous space
of world designs this document opens up without hand-tuning every knob.

### Save/load across installations — portable creatures, varying worlds. Yes, and design for it now.

The principle: **a creature's genome is a stable, versioned, portable format
independent of the world; the world config is separate and varies per
installation.** Like DNA that develops in whatever environment it lands in. This
is what turns a pile of isolated runs into a shared ecosystem — you can take a
creature evolved on one machine, in one world, and drop it into someone else's
world and watch it cope.

To make that real: separate the two schemas cleanly. The **creature file** carries
the developmental genome (the `genR`/`genM` matrices and the few parameters that
fix its phenotype — gene count, cell budget) plus a **capability declaration**: a
list of which sensory and motor channels the creature actually uses (this one
senses chemical and sound and uses grabbers; that one is blind and only
chemotactic). The **world config** is a separate file: which fields exist, the
terrain, the size, which primitives are switched on. Loading develops the
creature in the local world; if the local world lacks a channel the creature
declares (it wants sonar, this world has none), that channel simply reads null —
the creature is deaf to it and copes or does not, gracefully, never an error.
Version the genome format from the start, because the moment two installations
diverge, forward and backward compatibility is what lets their menageries meet.
The payoff is concrete: a shared, growing bestiary that any world can host and
pit against its own natives — which is itself a source of open-ended pressure,
because the invaders were shaped by pressures your world never had.

## In one paragraph, for whoever reads this next

The world is built from fields, entities, and couplings — and `fieldsim.html`
already shows the field half working and beautiful. Every sense and signal on the
wishlist (smell, trails, writing, sound, sonar, heat, light, shadow) is a field
plus a coupling; every physical affordance (carrying rocks and lamps, stickiness)
is an entity plus a constraint; and development can read the fields so the world
shapes the body. It is all continuous, all cheap, all shaped for the GPU, and all
portable if we keep the creature genome stable while letting worlds vary. The
build order is: get one creature to genuinely sense (seed-the-gait, in progress),
then make the world uncoverable and toroidal and bigger, then add fields one at a
time — trail, then sound, then heat/light, then portability — each kept only if
it makes capability keep climbing against its own ancestors, under an autoresearch
loop. Hold the parsimony line: a field, an entity, or a coupling, or be suspicious.

---

# Part III — cells as the world's atoms, and energy as its currency

*Recorded from the design conversation. Read Part III together with THE FIRST
LAW at the top: this part says what the primitives ARE; that law says you may
never bypass them.*

## Cells are the atoms. Bodies are molecules.

Do not make "entities" foundational. Multicellularity is made of simpler stuff,
and so is everything else. The one building block is the **cell**, and a cell is
much more like an atom or a small molecule than like an animal:

- It has a position and velocity in the 2D world (R²), a **size**, and some
  fuel. That is nearly all its *state*.
- It may be **living or non-living**. A living cell has DNA and runs
  development; a dead cell has neither. But a cell need not ever have been alive
  to matter — the same particle is the stuff of **boats, shelter, firewood,
  food, corpses, silt**. Inanimate structure is just cells that aren't running a
  genome. A raft is a clump of stuck-together dead cells; a wall is the same.
- **"Squishiness" is not a deformed-circle shape.** It is a small set of
  **forces** — attraction and repulsion — that govern how a cell interacts with
  other cell types, living and non-living alike. A cell type is defined largely
  by its row in an interaction matrix: how strongly it is drawn to, or pushed
  from, each other type within a short range, plus a universal short-range
  volume-exclusion so cells don't occupy the same point. Membranes, tissues,
  limbs, and rigid tools all emerge from these pairwise forces; we do not model
  polygon deformation. This is the "particle-life" family of dynamics — cheap,
  continuous, GPU-friendly — pressed into service as chemistry.

## Death, decay, and food are the same substance moving

When a living cell dies it simply **loses its DNA and its development** — it
stops being computed as alive. It does **not** leave the world. It remains a
physics particle (it still pushes and is pushed) and it becomes **food**:
another cell can consume it, taking its mass/fuel. Left uneaten it **decays**,
slowly releasing its energy back into the fields (a corpse feeds the sugar/
nutrient field around it) and eventually vanishing. Nothing is created or
destroyed so much as **moved**: field → living cell → corpse → field. That loop
is the ecology, expressed without a single role-named rule.

## Doubling is the powerful thing

A living cell with enough fuel **divides** — it doubles. Doubling is the engine
of everything: growth of a body, blooms of food, healing, reproduction. It is
exponential and therefore powerful, so it must be **gated**, and the gate is the
**fieldsim**: the local division rate rises and falls with the fields a cell
sits in — **heat, light, magnetism, local gravity, centrifugality, agitation,
sugar, water**, whatever we choose to couple. "Warm, wet, sugary, still" doubles
fast; "cold, dry, starved, churned" does not. This is where god plays honestly:
you tune the *fields and the couplings*, and the population responds — you never
set a birth rate on a role.

## Size and squishiness drift over a lifetime

A cell is not fixed at birth. Its **size and its interaction forces change
during life** — a cell that has taken up water or sugar swells and grows
stickier or more buoyant; a starved one shrinks and firms. So a body's shape and
mechanics are a running function of what it has eaten and where it has been, not
a static blueprint. This is cheap (a couple of scalars per cell updated per
step) and it is a large part of where interesting mechanics will come from
(water-retention traps, sugar-drunk sluggishness, buoyant rafts).

## Development never really stops

Bite the bullet: **development continues throughout a cell's life**, not just in
an initial phase. Proteins keep feeding back into the gene-regulatory network,
roles can shift, the body keeps forming. The only concession is
**computational**: we may run the development/GRN update only every *N* physics
steps (physics and neurons/muscles tick fast; the slow chemistry of development
ticks coarsely). Lifetime and development stop being two stages and become two
timescales of one process.

## ENERGY is the master variable — think Nick Lane

Everything above is really about **energy**, and this deserves the deepest
thought. Nick Lane's argument is that life is a flow problem before it is an
information problem: a cell is a device that sits across an energy gradient (for
real cells, a proton gradient across a membrane — chemiosmosis) and taps it, and
the amount of usable energy *per unit of genome* is what gates how complex a
lineage can afford to become. Two design consequences we want to honour here:

1. **The world is an open system with an energy source.** Energy must ENTER —
   "sunlight" deposited as a sugar/nutrient field, or a chemical gradient at a
   vent. Everything downstream (division, movement, sensing, predation) spends
   that energy. This is why an energy input is legitimate and a *seed rain of
   whole organisms is not*: thermodynamics requires the former; the latter is a
   crutch (see the ledger).
2. **Energy per cell gates complexity.** A bigger brain (more neuron cells,
   more muscle) must be *paid for* out of the same fuel budget — so brains,
   speed, and size all trade against each other through one currency, exactly
   the "earn its keep" pressure the mission wants. If we ever want the analogue
   of the mitochondrial leap, it looks like a cell type that supplies fuel to
   its neighbours far more cheaply — an endosymbiosis, discovered, not declared.

**Fire** belongs to this chapter: firewood is dead dry cells; fire is a fast
exothermic reaction that consumes them and pumps the heat field, which in turn
gates division, movement, and death nearby. It is one more coupling
(flammable-cell + heat-field), not a special system.

## The trophic stack you asked for — and the primitives it needs

The target picture: **ant eats sugar and leaves a trail; scorpion eats ants and
leaves a different trail; rockbeast finds the scorpion nest, feasts and farts;
staypuft fiend eats the rockbeast and wins.** The First Law says none of these
may be a `type=PREDATOR` with a speed knob. What the platform actually needs to
let this *emerge* is small:

- **Multiple cell types with their own chemistry** — each type is a row in the
  interaction-force matrix (who it clings to / flees) and a row in a **digest
  matrix** (when overlapping type X, transfer fuel from X to me at some rate).
  "Scorpion eats ant" is just: scorpion-cells are weakly attracted to ant-cells
  and digest them on contact. The *ladder* (sugar→ant→scorpion→rockbeast→
  staypuft) is what a well-chosen pair of matrices produces; nobody types
  "trophic level."
- **A distinct trail field per emitter chemistry.** Trails are already fields;
  "a different trail" is just a different channel an ant vs a scorpion deposits
  to, and that a hunter one rung up is tuned to follow. This is the
  predator/prey *gradient* — the smell ladder — and it is the honest way a
  hunter finds a nest: by climbing a field, not by a proximity query.
- **Fuel-limited muscles.** Being caught or catching is downstream of who can
  afford to accelerate — muscle cells burning fuel for force — so "faster" is
  always an energy story, never a constant.

Everything in that sentence already exists as a field or a cell-force or a fuel
rule. The trophic stack is a *test* of the primitives, not new machinery.

## The shortcuts ledger — debts taken, to be repaid

`godsim.html` is a fun, honest-about-itself sandbox, but it takes shortcuts that
violate the spirit above. Logged here so no one mistakes them for the design and
so future revisions can pay them down:

| shortcut in godsim | why it's a crutch | pay it down with |
|---|---|---|
| `predatorSpeed = 1.35`, per-type speeds | high-level outcome typed into motion — the exact First-Law violation | speed from fuel-burning muscle cells; a fast lineage must earn it |
| **cellworld's interaction matrix `A[i][j]`** (attraction/repulsion between types) | **the same violation as predatorSpeed, hidden better.** "Move toward / away from type j" is a BEHAVIOURAL DECISION handed to the cell from on high. Deciding to approach or flee is the *brain's* job — the CTRNN's output — not a god-matrix entry. | cells only SECRETE into fields and SENSE fields; a cell approaches another because it smells what that other secretes and its evolved brain drives its muscles up the gradient. Attraction, chasing, fleeing, herding all emerge; none are declared |
| **cellworld's digest matrix `D[i][j]`** (who eats whom) | same cheat: "type i eats type j" is a table I filled in | a cell EXPRESSES enzymes (evolved surface chemistry); enzyme meets matching substrate on contact → energy. *What* you can eat is evolved, the reaction is chemistry — no table |
| role-named rates (`predatorRepro`, `metabolism` per type, drain rate) | tunes the role, not the chemistry | one fuel currency; division/death fall out of energy balance |
| **seed rain / egg-bank dormancy floors** | spawns whole organisms from nothing to dodge extinction | energy *input* (sunlight→sugar) + working division; let lineages actually die |
| point-blobs as "creatures" | there is no multicellularity at all — each blob is one dot | cells-as-atoms: bodies are clumps held by inter-cell forces |
| CPU simulation, GPU only for drawing | not the "all on GPU" dream; **yes, the GPU is faked** — compute is on the CPU, the GPU only composites | port fields + particle forces to compute shaders once the hardware is here |
| fixed global field params | world is uniform | per-region fields, terrain, the couplings of Part I |

The direction of travel is: **delete every role-named knob and every spawn-from-
nothing floor, and let the same behaviours re-appear from cells, forces, fuel,
and fields.** When they do, the world is real.

## Two standing bugs / notes

- **`fieldsim.html` flickers badly on Android.** Reported from the field. Almost
  certainly a double-buffer / canvas-clear / compositing issue on mobile GPUs,
  not the maths. To fix next: check for an un-cleared or alpha-composited canvas,
  `preserveDrawingBuffer`, and any per-frame texture re-alloc.
- **The GPU is currently faked** in every web demo (CPU compute, GPU draw). Said
  plainly because it was asked plainly. A real compute-shader port is the item
  once dedicated hardware is available.
