# World design — conditions for an infinite-ascent arms race

Companion to `MISSION.md` (the goal) and `RESEARCH.md` (what has been measured).
This is the world we are trying to build and *why* — the god's-eye design brief.
Captured from the design conversation; treat it as binding intent, to be built
incrementally and measured the way everything else here is.

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
