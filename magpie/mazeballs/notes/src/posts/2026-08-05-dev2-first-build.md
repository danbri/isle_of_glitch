---
title: "Development 2.0, first build: two negatives and one breakthrough"
date: 2026-08-05T18:00:00Z
tags: [devo, grn, negative-result, morphology]
---

Built `lib/devo2.js` today — a gene regulatory network that *grows* a body inside
an egg, replacing the positional readout that had elongation pinned at 1.15. This
is the working log, including the two versions that did not work, because those
are where the information is.

The design is in `DEVELOPMENT-2.md`. In short: 64 gene products, sparse (K = 6
regulators per gene), non-negative concentrations with production, decay and
per-product diffusion, maternal gradients as clamped boundary conditions, and —
the load-bearing part — **the body grows from one cell rather than being painted
onto a disc**.

The acceptance test was fixed in advance: does elongation stop being pinned?

## Attempt 1 — worse than what it replaced

```
DEV 1.0 (positional readout) — random genomes
  ELONGATION  p10 0.96  p50 1.15  p90 1.15  max 1.15
     >1.3: 0/200

DEV 2.0 (GRN + growth) — random genomes
  cells       p10 60  p50 60  p90 60  max 60
  ELONGATION  p10 0.90  p50 0.90  p90 0.96  max 1.39
     >1.3: 1/194     segments p50 0
```

Every single embryo hit the 60-cell cap. Elongation p50 went *down*.

The cause was written in the design document before the code was: *"if cells
divide inside a hard circular shell and fill it, the body is a disc again whatever
the GRN says."* The egg radius was 4.5, which is exactly the radius of a compact
60-cell blob. The body had no room to be a shape. I predicted this failure and
then built it anyway, which is worth recording.

Fix: egg extent 4.5 → 12, and make growth a self-limiting *transient* (decay 0.25,
division halves the concentration below threshold) rather than a latch.

## Attempt 2 — still a disc, and now I had to admit the encoding wasn't the point

```
DEV 2.0 — random genomes
  cells       p50 60  max 60
  ELONGATION  p50 0.96  p90 1.09  max 1.73
```

Better tail, same story: bodies still filled to the cap. So I stopped surveying
random genomes and asked the question that actually matters — **can selection move
it?** Direct selection on elongation for 30 generations, identical regime for both
encodings. (Selecting straight on elongation would be reward-shaping as an ecology
claim; as an *instrument test* it is exactly right, because it asks whether the
encoding can move at all, independent of whether the world pays for it.)

```
DEV 1.0     gen 0  best 1.15   ->   gen 30  best 1.39   median 1.39
DEV 2.0     gen 0  best 1.30   ->   gen 30  best 1.30   median 1.09
```

**Dev 2.0 lost.** The old encoding responded to selection; the new one did not
move at all. Thirty generations, no progress. If I had shipped on "it's a GRN now,
it must be better", this is what would have been under it.

The diagnosis: nothing localised growth. Every cell with a free neighbour and
enough `grow` extends, so the body expands isotropically from its seed — and
isotropic growth is a disc, however sophisticated the network driving it. The
network was never the constraint. The *geometry of growth* was.

## The fix — give the network a signal, not a mechanism

A tip is a cell with few occupied neighbours. So expose **crowding** (0 alone, 1
fully surrounded) as an input gene the network can read, and let a genome grow
only where it is uncrowded — apical growth, filaments, branches — or weight it to
zero and stay a blob. Reachable, not imposed.

```
DEV 2.0 (GRN + growth + crowding input) — random genomes
  ELONGATION  p10 0.58  p50 0.92  p90 1.73  max 7.51
     >1.3: 14/60   >2.0: 2/60

  under direct selection
    gen  0  best 2.12    gen  5  best 5.20    gen 30  best 2.31
```

**The prior is broken.** Random genomes now reach elongation **7.51**, against a
Dev 1.0 ceiling of 1.15 that hand-crafted extreme genomes could only push to 4.04.
Fourteen of sixty random embryos clear 1.3, where Dev 1.0 managed zero of two
hundred. Bodies can now be worms.

## What is still wrong, honestly

- **Viability collapsed**: 60 of 200 random embryos are viable, down from 167. Most
  now grow too few cells (p50 10). The founder seeding is tuned for shape at the
  expense of getting off the ground.
- **Selection response is noisy, not monotone**: best elongation goes 2.12 → 5.20 →
  2.02 → 2.60 → 1.73 → 2.45 → 2.31. Some of that is real hill-climbing noise, but
  some is that **development itself is stochastic** — the same genome develops
  differently each evaluation, so fitness is noisy and selection is fighting it.
  Real embryos canalise; ours does not yet. Seeding developmental noise per-genome
  would make it reproducible, and that should probably happen before any claim
  about selection response.
- **Segments are still ~0.** No banding, no stripes, no clock. The "crap clocks"
  half of the sketch is entirely unrealised — this is growth and shape, not
  patterning.
- **Not integrated.** `devo2.js` is standalone; the live world still runs Dev 1.0.

## Where this leaves it

One acceptance criterion out of several is met, and it is the one that was
blocking locomotion: bodies can have a long axis now. That does not mean anything
moves — two of the three measured blockers are untouched by this work and live in
the type rule and the CTRNN.

The thing I would tell myself this morning: the encoding was never the bottleneck
I thought it was. Both failures were **geometric** — the egg was too small, and
growth had no way to be local. A better network inside a bad geometry is still a
disc.
