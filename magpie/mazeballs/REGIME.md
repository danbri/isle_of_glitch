# Physical regime: what our world can and cannot represent

Prompted by an observation about the scallop theorem, LBM simulation and wake
vortex capture. The underlying question is a good one and the answer bounds what
locomotion can ever look like here, so it is worth writing down rather than
rediscovering.

## The observation

A builder found their physical oscillating-resonator prototype propelled itself,
while their Lattice Boltzmann simulation predicted zero net thrust — attributed to
the scallop theorem at that grid resolution. They added a "Kinetic Energy
Accumulator" that mimics wake vortex energy harvesting to close the gap.

## Two readings, and the sceptical one matters to us

**The physics point is real.** Purcell's scallop theorem is a statement about the
*Stokes limit* — vanishing Reynolds number, where inertia is absent and the
equations are time-reversible, so any reciprocal stroke retraces itself and nets
zero. Real swimmers escape it three ways:

1. **Inertia and vortex shedding** at higher Re — the wake carries momentum, and a
   body can recapture energy from structures it shed earlier.
2. **Anisotropic drag** (resistive force theory) — sideways resistance exceeding
   lengthwise resistance converts a transverse wave into forward travel. This
   works *even at zero Reynolds number*.
3. **Non-reciprocal kinematics** — Purcell's three-link swimmer, a stroke whose
   time-reverse is a different shape sequence.

**But the specific diagnosis is doubtful, and the fix is the kind of thing this
project exists to refuse.** A macroscopic oscillating saucer in air is nowhere near
the Stokes limit, so the scallop theorem should not apply to it at all; the far
likelier explanation for zero predicted thrust is an under-resolved simulation that
cannot capture the boundary layer or shed vortices. And "add an accumulator term
until the simulation matches the prototype" is, in our vocabulary, **minting**: an
energy source introduced to produce a desired outcome, tuned against the answer you
wanted. It is `predatorSpeed` wearing fluid-dynamics clothing. That does not make
their prototype wrong — the hardware moved — it makes the *simulation* unable to
support a claim about mechanism.

## What this means for mazeballs

**We do not simulate a fluid, at all.** The flow field is an analytic prescribed
velocity field. It pushes cells; cells never push back. There is no medium with
state, so there is no wake, no shed vortex, no added mass, and nothing to recapture.

Route 1 is therefore **unavailable to us by construction**, and no amount of
evolution will find it. Whole families of real locomotion are outside our physics:
fish burst-and-coast, wake recapture, clap-and-fling, drafting behind another body.
A creature here cannot exploit the medium's history because the medium has none.

What we *do* have is routes 2 and 3, and that is what the new traction implements:
anisotropic drag against a substrate, with the anisotropy conditional on a cell's
grabbiness and phased by its activation.

**So our creatures crawl; they do not swim.** `swim.html` and `swim-verify.js` are
usefully named for the primitive they demonstrate but misleading about the
mechanism — what they show is slithering against grit, the sandfish/nematode
regime, not swimming in a fluid. Worth renaming or at least annotating.

## Our actual regime, measured

Grit sampled over 40,000 points, and the drag time constants that follow
(`fricK 6`, `slipBase 0.15`, `gripBase 0.55`, `gripAniso 6`):

    grit          mean 0.776   min 0.151   max 1.000

    ground    grit   along-axis tau   sideways tau   anisotropy
    barren    0.15       0.554 s         0.209 s        2.7x
    mean      0.78       0.180 s         0.048 s        3.8x
    rich      1.00       0.145 s         0.037 s        3.9x

CTRNN time constants span 0.018 s to 1.8 s.

**We are in an intermediate regime, not the Stokes limit.** Drag time constants
(0.15–0.55 s) overlap the range of gait periods a brain can generate, so bodies
genuinely coast between strokes. Inertia is not negligible here. That means some of
the non-reciprocal advantage available to our creatures comes from coasting, not
only from drag anisotropy — and it means the scallop theorem is not as absolute a
barrier for us as it is for a bacterium.

**There is no open water anywhere.** Minimum grit is 0.151, so every point in the
world offers some purchase. `primitives.md` describes a water-versus-land horizon
("low-everything → must swim or be carried") and it does not currently exist: the
field never approaches zero. If we want that horizon to be real, grit needs a
distribution that actually reaches zero over some region.

## Frames of reference — a correction to an earlier draft

An earlier version of this file treated "everything is always moving" as a defect
to be designed out. That was too dogmatic and it is withdrawn.

A world where nothing can hold station is a perfectly good world. It is the open
ocean; it is the cloud bands of Jupiter; it is a shark that must swim to breathe
and never stops, not even to sleep. Plankton do not fail at life by drifting.
Being unable to stop is a *condition to adapt to*, not a bug — and some of the most
interesting adaptations (station-keeping, vertical migration, riding a front,
hitching onto something bigger) only exist because holding still is impossible.

What we actually want is **diverse frames of reference**, so that different
assemblies experience different relationships to the medium:

- **substrate-relative** — grit high, flow low. Purchase is available; crawling,
  anchoring and sitting still all work. Position is a thing you own.
- **medium-relative** — flow high, grit low. Nothing can hold station; "where you
  are" is meaningless and "where you are relative to the water, and to each other"
  is everything. Motion is the default and stillness is the achievement.
- **mixed and moving fronts** — the interesting middle, where a body can cross
  between regimes, and where the same gait pays very differently either side.

The design error is not "the world moves". It is a world with only ONE frame of
reference, whichever one that is — because then every creature faces the same
problem and there is nothing to diversify into. A single global drift that every
cell experiences identically is uninteresting for that reason, not because motion
is bad; it adds no distinction between bodies. A flow with structure, gradients
and boundaries is the opposite: it is terrain.

So flow strength is not a number to be minimised. It is a knob that should vary
*across the world* and possibly over time, and the goal is that both "hold your
ground" and "you can never stop" are live strategies somewhere.

## Dimensionality: what 2D costs us

**Helical propulsion has no 2D analogue.** A rotating helix — how bacteria actually
swim — degenerates in the plane to a travelling wave. Rotary flagellar propulsion is
not a thing we can under-represent; it is a thing that cannot exist here. Planar
undulation (eels, nematodes) maps to 2D fine.

**2D low-Reynolds hydrodynamics is genuinely pathological**, not merely simplified:
Stokes' paradox says there is no solution for steady flow past a cylinder at zero
Reynolds number in two dimensions. This is a further reason not to bolt an
approximate fluid onto a 2D world and reason about micro-swimming in it — the
target being approximated does not exist.

## The rule this implies

If we ever want fluid-mediated effects, the lawful route is to give the flow field
**state** — momentum that cells add to and take from, conserved — and pay the cost.
Not a correction term tuned until bodies move. A term added because the outcome was
missing is the exact failure mode the friction law names, and this project has
already retracted five results to it.

Until then, the honest framing is: **mazeballs creatures are crawlers on a gritty
plane.** That is a real and rich regime — it is snakes, worms, sandfish, and the
anchor-extend-release of a caterpillar — and it is enough for an arms race. It is
just not swimming, and we should not say that it is.

Note the scope of that: it describes the world *as currently configured*, not a
limit on what the engine may represent. Drop grit toward zero in a region and the
same physics gives you drifters that cannot hold station — a different frame of
reference, from the same primitives, with no new code. That is the point of
keeping the substrate a field rather than a constant.
