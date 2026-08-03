# Methods — refining evo-devo primitives with autoresearch, at AI-infra scale

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
  the goal names; the loop should be able to swap and tune it.
- **Physical primitives** — bonds/adhesion/exclusion, and the *conditions* under
  which they cohere (v3 here: bonds break only on death → bodies bootstrap).

The loop edits the schema; a run reads it; the objective scores it. Meta-evolution
of the encoding, not just parameters within a fixed one.

## 3. What to optimise — the measurement is the hard part

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

## 4. The modern-AI marriage: LLM as mutation operator AND judge

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

## 5. Discipline (the ways this bites, learned here)

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

## 6. What the scale actually unlocks

- **GPU inner sim** — fields → compute shaders (embarrassingly parallel); particles
  → spatial hash in-shader. JAX / Taichi / Warp / Brax; differentiable sim optional
  for gradient-tuning the continuous knobs between evolutionary phases.
- **A population of worlds** (POET-style) run in parallel — coevolving
  environments, each with its own lineages, the outer loop transplanting and
  branching them. This, not a bigger brain, is where open-endedness has empirically
  come from.
- **Deep time × many seeds** — turns the staircase from "one transition observed"
  into "transitions observed to recur," which is the strongest finite evidence for
  open-endedness there is.

## 7. Concrete next moves (small → large)

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
