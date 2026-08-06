# Methods — refining evo-devo primitives with autoresearch, at AI-infra scale

> **Still current.** Autoresearch over primitives, and the brain-is-body argument — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md) for how it
> sits in the world as a whole, and for the measurements behind it.

A concise working discussion: how to use an autoresearch loop (Karpathy-style) to
evolve the *toolkit of primitives* our worlds expose to evolution, and what modern
compute actually buys. Grounded in this repo's results and the alife / evo-devo /
ML literature.

## 1. The loop, and the one lesson that should steer it

Autoresearch = an outer agent proposes a change, runs a fixed-budget experiment,
scores it against an objective, keeps it past a significance bar, rolls it back
otherwise, repeats (`RESEARCH.md` already runs this; Karpathy's version rewrites
`train.py`). The design question is **what the loop is allowed to mutate** and
**what it optimises**.

Our own hardest-won result answers the first half. Every *organism-substrate*
enrichment was null — network capacity, integration accuracy, sensor geometry,
cell-cell diffusion, the twelve genome-richness knobs. Every *task / environment*
change landed (clustered food +138%; the multicellular windfall broke a ceiling
single cells never could). **The binding constraint is what the strategy has to
be, not what the hardware could support.** So point the loop at the *world and the
primitive set*, not the brain's hyperparameters. This is exactly the open-endedness
literature's stance: coevolve the *problem*, not just the solver (POET / Enhanced
POET; Minimal Criterion Coevolution).

## 2. What the loop should mutate — primitives as data

The templatization vision is the substrate for autoresearch: every mechanism is a
row in a schema the loop can edit, not hard code.

- **Fields & couplings** — reaction-diffusion, curl-flow, advection, wave. Cf.
  Lenia / Flow-Lenia (continuous CA with localised, mass-conserving update rules —
  our fields are the same family) and reaction-diffusion morphogenesis.
- **Energy sources & windfalls, and their gating** — the ceiling-breakers. The
  staircase result says *these* are where transitions come from (a windfall only a
  body/coordinated body can tap). Nick-Lane framing: gate complexity by
  energy-per-cell.
- **The developmental encoding** (genotype → phenotype map) — GRN (Wagner),
  neural cellular automata (Mordvintsev; growing/self-classifying NCA — literally
  evo-devo), CPPN/HyperNEAT (Stanley) for spatial pattern. This is the "evo-devo"
  the goal names; the loop should be able to swap and tune it. **It patterns the
  brain too, not just the body — see §3.**
- **Physical primitives** — bonds/adhesion/exclusion, and the *conditions* under
  which they cohere (v3 here: bonds break only on death → bodies bootstrap).

The loop edits the schema; a run reads it; the objective scores it. Meta-evolution
of the encoding, not just parameters within a fixed one.

## 3. Brain is body — one developmental encoding (scale *grows* the brain, doesn't *set* it)

Correcting a glib claim: scale **does** buy a bigger brain. Our earlier "network
capacity is null" result was an artifact of *declaring* capacity as a hyperparameter
— a free knob evolution has no purchase on. Put the brain under evo-devo **as
tissue** and scale buys brain the way it buys body: grown when the body plan needs
it, laid out by development, paid for in energy (the Nick-Lane brain tax becomes
literal — neurons occupy space and burn fuel). Capacity was never the lever;
**patterning is.**

The strong consequence: if the brain is *part of* the body, **one developmental
system patterns all tissue** — neural, muscular, skeletal, optical differ only in
the cell-type response at the *end* of a shared pipeline. The shared vocabulary is
gradients, symmetry axes, segmentation/repetition (modularity), and
**connectivity-as-a-function-of-geometry**. Anchors:

- **HyperNEAT / ES-HyperNEAT** (Stanley) — neural connectivity as a function of
  substrate *geometry*, exploiting symmetry and repetition; ES-HyperNEAT even
  *places the neurons developmentally*. This is the direct ML precedent for "brain
  layout inherits body patterning."
- **Reaction-diffusion / Turing + Hox-style segmentation** — one machine for
  stripes, spots, segments, bilateral symmetry; the same patterning that segments
  muscle blocks segments neural ganglia. Modularity and repeats come *for free* (we
  already have a symmetry-breaker field — this generalises it).
- **Neural CA** (Mordvintsev) — tissue grown by local rules; a brain grown like a
  limb.
- **Wiring cost** (Cherniak; small-world / modular brain networks) — once neurons
  have *positions*, connections have *length*, so wiring has an energy/space price.
  Modularity and short-range-dominant connectivity then emerge **physically**, not
  as a hand-coded prior. This is the deepest payoff of brain-in-body: network
  structure stops being designed and becomes a consequence of morphology + metabolism.
- **Sims '94 / Cheney–Bongard** ("Unshackling evolution") — continuous, "cartoony"
  body plans co-evolving morphology *and* control; the existence proof this is
  evolvable.

Toolkit consequence: expose **patterning operators, not size knobs** —
reaction-diffusion params, symmetry/segmentation operators, a CPPN-ish
geometry→property map, gradient-guided connectivity / axon growth. Then body size,
brain size, module count, number of eyes, symmetry order are all *outcomes the loop
reads*, never inputs it sets. Physically it is all **one substrate**: neuron =
positioned cell that costs fuel and wires to targets via gradients; muscle =
contractile cell array; bone = stiff-bond lattice (our division bonds; stiff vs soft
= a bond-stiffness param); eye = surface sensor patterning.

## 4. What to optimise — the measurement is the hard part

You cannot optimise "open-endedness" directly; you need a proxy. Candidates, and
what this repo contributes:

- **Category-free ancestral tournament** (`soup-ascent.js`) — later pool vs earlier
  pool in one neutral world, mutation off. First-Law-clean (no species/role label).
- **The staircase test** — *does a new transition open?* Monoculture assay
  separates absolute skill from frequency-dependent (Red-Queen) gain; the tournament
  ladder's late-half tells climbing from saturation. This is the objective the outer
  loop should chase: not "higher fitness" (bounded per hill) but "another ceiling
  broken."
- **Evolutionary activity statistics** (Bedau–Packard) and **phylogenetic /
  diversity** metrics — persistent adaptive novelty, from the Avida/Tierra lineage.
- **Quality-Diversity** (MAP-Elites, novelty search; Lehman & Stanley, Mouret &
  Clune) — score *coverage of a behaviour space*, not a scalar peak. Fits
  open-endedness far better than a single objective and is what keeps a search from
  collapsing onto one hill.
- **Foundation-model-as-judge** (ASAL, "Automating the Search for Artificial Life
  through Foundation Models", Kumar et al. 2024) — use a vision/LLM model to score a
  world's *interestingness / novelty*, sidestepping hand-designed metrics. This is
  the natural marriage with modern AI, and it composes with the point below.

## 5. The modern-AI marriage: LLM as mutation operator AND judge

Two roles, both now practical at scale:

- **LLM as mutation operator over primitives** — ELM (Evolution through Large
  Models; Lehman, Meyerson) and FunSearch show an LLM proposing *code/structure*
  mutations beats random search when the genotype is a program. Here the "program"
  is the primitive schema: let the LLM propose new fields, couplings, windfall
  shapes, GRN motifs — informed, diff-sized, testable.
- **LLM/foundation-model as the interestingness judge** (ASAL) — closes the loop
  without a brittle hand-coded metric.

So the autoresearch loop becomes: LLM proposes a primitive edit → GPU runs a
population of worlds → instrument + FM-judge score them → keep/roll-back. The inner
loop is cheap parallel sim; the outer loop is a few LLM calls per generation.

## 6. Discipline (the ways this bites, learned here)

- **First Law: mutate physical/chemical primitives, never behavioural roles.**
  "Attraction", "predator", "reward diversity" bake in the answer — the loop will
  reward-hack them exactly as an RL agent games a shaped reward. Differentiation
  must *emerge* as the means to a chemical end (rung 3), never be scored directly.
- **Controls are first-class.** The loop must run the ablation, not just the
  treatment, or it credits confounds — a windfall adds energy, so "bigger
  population" ≠ "ascent" until the monoculture / same-world tournament removes the
  free-energy term. REG-vs-FIXED and mono-vs-mixed are templates for this.
- **Convexity is the precondition for transitions** (Michod; Rueffler et al. on
  division of labour). A useful *prior* for which windfall shapes to propose: ones
  with economies of scale / per-pathway overhead, so specialists beat generalists.
- **Deep time is non-optional.** Each hill saturates fast (~8k steps here); seeing
  *several* transitions needs 10^7–10^8 steps. Scale mostly buys transitions.

## 7. What the scale actually unlocks

- **A bigger *grown* brain-body.** With brain-as-tissue (§3), raw compute is spent
  on organisms that are physically larger and more structured — more cells, deeper
  development, richer connectivity — because size/topology are now selected outcomes,
  not free knobs. This is the "insane scale" put to evo-devo, not to a benchmark.
- **GPU inner sim** — fields → compute shaders (embarrassingly parallel); particles
  → spatial hash in-shader. JAX / Taichi / Warp / Brax; differentiable sim optional
  for gradient-tuning the continuous knobs between evolutionary phases.
- **A population of worlds** (POET-style) run in parallel — coevolving
  environments, each with its own lineages, the outer loop transplanting and
  branching them. Coevolving the *problem*, not a fixed benchmark, is where
  open-endedness has empirically come from.
- **Deep time × many seeds** — turns the staircase from "one transition observed"
  into "transitions observed to recur," which is the strongest finite evidence for
  open-endedness there is.

## 8. Concrete next moves (small → large)

1. Make the primitive set genuinely *data* (a schema file the loop reads) — fields,
   couplings, windfalls, encoding, physical constants as rows.
2. Wire the existing instrument (`soup-ascent.js`) + staircase test as the loop's
   objective; add QD coverage and an FM-interestingness judge alongside it.
3. GPU-port the inner sim (fields first, then particle forces) so a run is seconds.
4. Let an LLM propose primitive edits (ELM-style), gated by the instrument + a
   ablation control it is *required* to run.
5. Scale to a population of worlds and long deep time; the objective is "another
   ceiling broken", measured across seeds.

The honest target stays as `ASCENT.md` frames it: not a demonstrated infinite
climb (a horizon), but a loop that *reliably manufactures the next transition* —
and the machinery above is how modern compute makes that search tractable.
