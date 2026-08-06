# Ascent — what's proven, what "infinite" means here, and the next experiment

> **Still current.** The category-free ascent instrument — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md) for how it
> sits in the world as a whole, and for the measurements behind it.

Read-first synthesis of the ascent investigation. Detail and history are in
`LAB-NOTES.md`; the tools are `tools/soup-ascent.js` (instrument),
`tools/bodies-proto.js` (rung 1), `tools/differentiate-proto.js` (rung 3).

## The result in one paragraph

Evolution in the lawful soup climbs, but each capability climbs a **bounded
hill** and saturates. Adding a new lawful capability breaks the old ceiling and
opens the next hill. So "infinite ascent" is not one endless climb — it is an
unbounded **staircase** of bounded steps, each opened by a new capability as the
last saturates. We built the instrument that tells ascent from saturation,
measured the first step (unicellular → multicellular) cleanly, and found the
second step (differentiation) needs a narrow regime we haven't hit.

## What "infinite ascent" can and cannot mean in finite compute

- It **cannot** mean a demonstrated endless climb — infinity is a horizon, not a
  state reachable in finite steps. Any run is finite; any single hill saturates.
- It **can** mean: a lawful mechanism by which a saturated ceiling is *broken* by
  a new capability, repeatably. That is the open-ended-evolution mechanism (major
  transitions). We demonstrated one such transition end-to-end, instrumented.
- The honest target is therefore **"does each new transition open, and is it
  forced rather than bypassed?"** — measured by the instrument below.

## The instrument (category-free, First-Law-clean)

`tools/soup-ascent.js`. Freeze the genome pool at an early and a late TIME, drop
a 50/50 mix into the same neutral world with mutation OFF, read the later pool's
share. >0.5 ⇒ later out-competes earlier ⇒ ascent. No predator/prey/species/
entity category anywhere — origin is a scoreboard label the cells never see.
Cross-checked by a **monoculture assay** (each pool alone) that separates
absolute foraging skill from frequency-dependent (Red-Queen) effects.

## The staircase, measured

| level | mechanism | monoculture ceiling | ascent then |
|---|---|---|---|
| single cell | forage a drifting-sugar world | **~320** (flat after step 8000) | saturates |
| **rung 1: multicellular** | division bonds + a windfall only a bonded body can tap | **~450** (bodies bootstrap comp 1→~20) | fresh burst (tournament late-vs-early 0.61), then re-saturates (body size plateaus ~20, ladder 2nd-half 0.508) |
| rung 3: differentiation | metabolic division of labour (A→B→energy, budgeted) | **not opened** | evolution bypassed it (see below) |

Rung 1 is the clean, positive result: a lawful major transition breaks a bounded
ceiling and re-opens ascent — the staircase's first measured step.

## Why rung 3 (differentiation) did not open — and the exact fix

Two principled attempts (`tools/differentiate-proto.js`):
1. **Linear trade-off** → the windfall is captured by *uniform* bodies without
   differentiating (a generalist doing half of each step, eating its own
   intermediate B, ties a specialist pair). Recovers the textbook rule: division
   of labour needs **convex** returns to specialisation.
2. **Convex trade-off** (fixed overhead per active pathway) → the population-level
   result improves and ascent looks strong (tournament 0.84), but the **mechanism
   is wrong**: bodies shrink (overhead makes them unaffordable) and cells win by
   **single-cell plasticity** — one cell contextually switching pathways to dodge
   the double overhead — *not* multicellular division of labour.

The bypass exists because a cell can consume the intermediate **B it produced
itself**. Close that and the labour must be multicellular.

### THE NEXT EXPERIMENT (designed, not yet run — laptop work)

Make the step-2 benefit **strictly non-cell-autonomous** and keep convexity:

- **Remove the B field; make the hand-off pairwise.** In the neighbour loop, an
  adjacent pair (c,p) completes the chain: c contributes step-1 capacity `e1[c]`
  on local substrate A, p contributes step-2 capacity `e2[p]`, energy ∝
  `P·e1[c]·e2[p]·A`, split across the pair. A **lone cell has no partner → zero
  labour energy.** Strictly non-autonomous.
- **Differentiation signal = lateral inhibition.** A REG cell reads its
  neighbours' stored specialisation (`spec = e2−e1`, previous step) and pushes
  itself the opposite way; a FIXED cell expresses from genes only. Two-pass:
  compute each cell's neighbour-mean spec, then set `e1,e2`, then run the pairwise
  chain.
- **Keep the per-pathway overhead** (`PATHCOST`) so generalists pay double →
  specialists win *and* the plastic single-cell route is now closed (can't eat
  own B).

**Pre-registered success:** LABOR-REG monoculture ceiling > LABOR-FIXED, AND
within-body specialisation spread rises over evolutionary time (edge/interior or
checkerboard cell types emerge). If REG still ≈ FIXED, differentiation genuinely
does not pay under a strictly non-autonomous chain — a deeper negative worth
knowing.

This is real multi-iteration R&D (a labour-layer rewrite + balance tuning that
will likely take a few passes, as attempts 1–2 already showed), which is why it's
flagged for the laptop rather than run blind.

## Bottom line

One lawful major transition is measured and reproducible; the mechanism of
open-ended ascent (a new capability breaking a saturated ceiling) is demonstrated,
not asserted; and the next transition has a precise, pre-registered experiment
waiting. Infinite ascent itself stays a horizon — the honest deliverable is the
instrument and the staircase, and a sharp map of where the next step is.
