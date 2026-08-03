# LAB NOTES — start here when you set up the laptop

A single, scannable entry point. Depth lives in `WORLD.md` (the design laws and
full brief) and `RESEARCH.md` (what's been measured). This file is the "read me
first, then pick a thread" doc, written to be picked up cold — by you or another
AI — on the machine with a real GPU.

## Where things stand (what's built, and what it is)

- **brainsoup.html** — the current lead demo. ONE lawful soup: every cell is the
  same kind of thing — a small CTRNN brain reading chemical senses, driving a
  flagellar muscle (turn+thrust, costs fuel), dividing with mutation, dying. No
  predator/prey, no attraction matrix — movement is the brain's decision.
  Evolution is real and visible (lineages sweep, ~700 → a handful). World has a
  static fbm **fertility** map (symmetry breaker: fertile gardens vs barren) and
  **radiation** (light = energy + mutagen + heat; mutation rate is spatial =
  f(radiation) × chemical proximity, so evolution runs hot near sources). Panels
  tuck away; pinch/pan on mobile; toroidal, min-zoom clamped so it isn't
  wallpapered. STILL single-celled.
- **critters.html** — evo-devo multicellular bodies: cells develop from a genome
  into sensor / neuron / muscle roles, wired by a CTRNN, improved by evolution.
  This is the multicellular half; brainsoup is the free-living-soup half. They
  are not yet merged.
- **fieldsim.html** — the vector-field playground (diffusion, curl-flow,
  advection). "Fieldsim is beautiful." Android flicker fixed (offscreen buffer).
- **lib/fields.js** — the field primitive (ScalarField, CurlFlow, advect, fbm),
  toroidal option, mass-conservation tested. The backbone.
- **tools/soup-ascent.js** — WIP lawful one-soup engine + a CATEGORY-FREE
  ancestral tournament (see "what to count", below). Runs; ascent NOT yet
  demonstrated (needs tuning / a richer strategy space).
- **tools/land-evolve.js, land-suspects.js, land-control.js** — minimal
  testbeds that proved: evolution CAN find sensing under batch-GA selection;
  the motor-coordination burden is a wall; seeding a gait doesn't transfer.
- **godsim.html, cellworld.html, arena.html** — earlier demos. LABELLED
  SHORTCUTS (see the ledger in WORLD.md): they typed predator/prey and attraction
  matrices — the exact thing the First Law forbids. Kept as honest history, not
  the design.

## The two design laws (full text in WORLD.md — do not violate these)

1. **Nothing high-level is a primitive.** "Predator", "prey", "organism",
   "entity", "species" are NOT things the universe supplies. Only cells, forces,
   fields. Behaviour (approach/flee/chase/eat) is the CTRNN's output from sensing
   chemistry — never a role knob (`predatorSpeed`), never an attraction matrix.
2. **What to count is category-free.** Because there are no entities/species, the
   only honest measures are ENERGY captured and a **category-free ancestral
   tournament**: freeze all genomes at T1 and T2, drop each in the same neutral
   world, see which captures more energy / leaves more descendants. "Descent" is
   the one real relation (who divided from whom is a physical fact).

## THE ASK FROM THIS SESSION — science-lab / debug tooling (build these)

Feedback that motivates it: the demos still read as **fizzing dots / TV snow**,
feel **small**, and you can't interrogate them. North star, verbatim: *make the
world visible, "science lab" ready with debug tools, zoom-out-able, attractive,
and with flowing dynamics.* Concrete tools requested, with build notes:

- **Per-particle identity on inspect.** Zoom out, tap any particle, and know:
  does it have DNA (a living cell with a genome) or is it inert matter (a corpse,
  rubble, food)? Show genome presence, cell type, fuel, age, lineage id,
  generation. *Build:* an inspector panel driven by the existing tap-to-track;
  add an `alive`/`hasGenome` flag and render inert matter distinctly (desaturated
  / no glow) so living vs dead reads at a glance even without tapping.
- **Bonds vs forces, as one representation (a giant sparse matrix).** For any
  cell, which others does it share a quantifiable PHYSICAL BOND with (persistent
  pair constraint — the thing that makes a clone a body) vs a transient FORCE
  (magnetic attraction / volume-exclusion repulsion, oil-vs-water)? Represent
  both similarly — a sparse adjacency over cell pairs, bonds and forces as two
  edge kinds. *Build:* store bonds as a sparse pair list (bodies = connected
  components of the bond graph); a debug overlay draws bond edges one colour,
  strong transient forces another. This is also exactly how "a body" becomes
  legible: highlight the connected component you tapped.
- **Lineage tree, live and reconstructable.** A debug view of the family tree.
  Reconstruct ancestry, and pull ARCHIVED SNAPSHOTS of great-great-ancestors'
  genomes AND bodies. *Build:* give each cell a parent id + birth-time; keep a
  ring-buffer/periodic archive of genome pools (soup-ascent.js already snapshots
  pools — extend to store bodies). A tree/branch view to browse; click an
  ancestor to re-develop its body or run it in a scratch world. This is the
  substrate for the category-free ancestral tournament, too.
- **2D Gaussian splats — a representation to steal from.** *(First cut now live
  in brainsoup.)* As a 2D particle system, ask what oriented **2D gaussian
  splatting** teaches us: rendering cells as anisotropic gaussians (not hard
  dots) kills the "TV snow" look and gives soft, flowing, size/shape-bearing
  marks — a splat's covariance encodes a cell's size/orientation and velocity
  smear. **brainsoup's cell shader now does exactly this:** each cell is a soft
  gaussian stretched along its velocity (round = still, streak = fast), replacing
  the hard point-discs. Still to do: feed the splat's *across*-axis from an actual
  cell shape/size gene (not just speed), and try it as the sonar percept's
  world-model too (see below). It may also suggest a differentiable or richer
  world representation, not just a prettier renderer.

## Also on the roadmap (from earlier in the dialog)

- **Multicellularity where capability costs cells** — e.g. digesting needs ~50
  stomach cells, swimming ~100 twitching muscles. Gives size and multicellularity
  a *reason*, and forces a genuinely bigger world. A body = a clone held together
  by persistent **division bonds** (snowflake-yeast: incomplete separation),
  tagged by a heritable adhesion flavour so kin cohere; reproduce the body through
  a single-cell propagule (keeps it clonal → cooperation). This is the merge of
  critters (bodies) + brainsoup (free-living soup).
- **A vastly larger, Conway-scale world** — real room for large structures to
  live and move; not a small tile.
- **All on the GPU (the compute is currently faked).** Fields → compute shaders
  (trivially parallel); particle forces need a spatial hash in a shader. This is
  what the laptop's GPU unlocks.
- **Nick-Lane energy framing** — build around energy gradients (vents); gate
  complexity by energy-per-cell (the brain tax); expect punctuated ascent, big
  jumps needing energy windfalls (an endosymbiosis discovered, not declared).
- **Templatization (the long arc).** God-players edit matrices, tune a
  noise-fn's params, define new living or inert cell types and gene products,
  wire their GRN impacts, and declare chemical/physical couplings (signalling,
  equations of motion) — all as DATA, not code. Every mechanism in these demos is
  a candidate row in that schema. Write new mechanisms so they could become a
  template entry, not a hard-coded special case.

## Suggested first moves on the laptop

1. Merge brainsoup + critters into one lawful world with division bonds (bodies).
2. Add the debug layer: inspector (DNA-or-not), bond/force overlay, lineage tree,
   ancestor archive. These make it a *lab*, not a toy.
3. Try the 2D-gaussian-splat renderer to replace the dot look.
4. Then GPU-port the fields + particle forces.
5. Then the category-free ascent measurement as the standing "is it still
   climbing?" instrument, and the templatization schema so you can play god at
   the level of mechanisms.

## Nick Lane, in one screen (recap)

The through-line, in case it was skimmed:
- **Life is energy-flow before it is information.** A cell sits across an energy
  gradient and taps it; the genome is downstream of, and *paid for by*, that flux.
- **Build around gradients (vents), not a uniform broth.** Our fields are those
  gradients; `radiation` now unifies energy + mutagen + heat at the sources.
- **Complexity is gated by energy per cell — the brain tax.** A bigger CTRNN must
  be paid in fuel; brains, speed and size trade through one currency.
- **The big jumps are energy WINDFALLS, not clever genomes.** Eukaryotes happened
  once, via endosymbiosis (mitochondria) lifting the energy-per-gene ceiling. So
  expect *punctuated* ascent — a leap needs an endosymbiont **discovered, not
  declared** (a cell type that fuels its neighbours cheaply).
- **Multicellular cohesion = the single-cell bottleneck.** Reproducing a body
  through one propagule keeps it clonal (→ cooperation, lets cells specialise as
  neurons/muscles) and is itself an energy event. "What binds a body" and "why
  cooperation is stable" are the same answer: pass through one cell.

## Sonar from primitives (see `sonar.html`)

"Sonar" is not a sense we grant. It is four primitives combined:
1. **click** — a cell emits a sound PULSE (a motor act, like secreting).
2. **wave** — sound is a field that PROPAGATES at a speed (the ONE genuinely new
   primitive: a *wave* field — two buffers, current+previous — not a diffusion
   field). Cheaper legible variant: rays.
3. **reflect** — the wave bounces off impedance changes; reuse the terrain /
   fertility field as the acoustic-hardness map. Dense cell clumps and bodies
   also scatter.
4. **ear** — a sound SENSOR (two, for bearing) reads the returns. Echo *delay* ⇒
   range; which ear heard it first/loudest ⇒ bearing. The CTRNN reads the pattern.
A creature that clicks and listens then BUILDS a picture of geometry it never saw
— active sonar, emergent, evolvable (clicking costs energy, so it must earn its
keep). It also gives the "land vs water" horizon a second channel: sound reaches
where sight (opaque medium) cannot.

**Gaussian-splat tie-in (important):** the acoustic image a creature reconstructs
is naturally a set of soft blobs — one per echo at the inferred (range, bearing),
spread = uncertainty. That IS a 2D-gaussian-splat field. So the same
representation serves the *renderer* (draw cells/echoes as anisotropic gaussians,
killing the TV-snow look) AND the creature's *internal world-model* of what it
heard. Worth building the splat renderer and the sonar percept as one system.
`sonar.html` is a Canvas2D spike of exactly this — pulse out, reflect, echoes
paint a gaussian-splat acoustic image, with a range·bearing readout.
