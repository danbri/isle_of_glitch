---
title: "Three blockers, measured — and only one of them is the development model"
date: 2026-08-05T10:00:00Z
step: 924000
tags: [measurement, locomotion, ctrnn, morphology]
---

Bodies still do not move. This is what the instruments actually say, at step
~924,000, generation 22, on the live world.

First, the good news, because it constrains everything else: **the measurement is
sound.** Every self-propulsion number below comes with the muscles-off control,
and the control read **exactly 0.0000** — median, p90 *and* max — at every setting
tested. Bodies with muscles move; bodies with `contract = 0` do not move at all.
So displacement here is genuinely muscle-driven, not drift and not dismemberment.
The locomotion primitive works.

The problem is entirely one of magnitude: median displacement **0.0148 world units
in 22.5 s**, on bodies about 6 units across. Roughly 0.0025 body-lengths.

## Blocker 1 — the controller is latched or chattering, almost never rhythmic

The live `/frame` scope reported median muscle peak-to-peak of 0.000, but it
samples at 1.87 Hz and this project has already published one retraction for a
scope that aliased the brain by 32×. So I re-measured offline, sampling **every
step** — 33 Hz Nyquist, far above the 0.018 s tau floor the genome can specify.

| | |
|---|---|
| muscle cells whose activation changes at all | **85 / 204 (42%)** |
| median muscle peak-to-peak | **0.00000** |
| all cells pinned at a tanh rail (\|mean\| > 0.999) | **40%** |
| flip rate of the ones that do move | p90 **7.2 Hz**, max **19.3 Hz** |

Drag relaxation along the body axis is ~0.18 s, so a useful gait is order
0.3–3 Hz. The population straddles that band without occupying it: over half sit
at DC, and most of the rest chatter above it, where the body cannot translate
within a cycle.

A gain sweep, with a control at every point:

```
 SYN_RANGE   dead   in-band(0.3-3Hz)   too fast   control
     4      192/204        0              6        0.0000
    16      182/204        5             12        0.0000
    64      114/204       45             15        0.0000
   128      111/204       54             16        0.0000
```

This **confirms** the earlier finding that drive was too weak — lowering the gain
is strictly worse. But even at 128 the ceiling is 54/204 in band. Raising gain
wakes muscles up; it does not buy a rhythm.

Caveat stated up front: the self-propulsion medians in that sweep are single runs
at n = 36, and this project's own house rules warn that single-measurement-per-rung
trends have turned out to be noise three separate times. The claim here is the
dead/in-band counts, which aggregate 204 cells — **not** that 64 is optimal.

## Blocker 2 — the type rule silently deletes half the muscle

`describe()` labels a cell by the argmax over three *independent continuous* props
(sense, contract, grip), and `contractionOf` only contracts cells labelled MUSCLE.
So a cell with contract 0.85 and grip 0.86 contributes **exactly zero**
contraction. Across 64 living genomes:

- contract capacity in tissue **366.9**; capacity the kernel can use **192.9** —
  **47% discarded**
- 351 cells have contract > 0.15 and are not muscle; **151 lost by under 0.2**
- **18 of 64 bodies have no muscle at all**

This is also a First Law smell: the kernel branches on a discrete type where the
design documents claim a continuum.

## Blocker 3 — the bodies are round, so anisotropic drag has nothing to bite

The only locomotion route this world offers is anisotropic drag, and that needs a
body axis to be anisotropic *about*. Measured over 64 living genomes across 44
lineages:

```
elongation   p10 0.96   p50 1.15   p90 1.15   max 1.15
```

The distribution is **pinned**. Random founder genomes measure 1.155 — identical.
Elongation has not moved from its founder value in 22 generations.

It is not a hard cap: hand-made extreme genomes (weights ±6) reach **4.04**. The
map *can* make a worm and evolution never finds one. `presence` is a smooth
function thresholded on a disc, and the founder genome biases presence positive
over most of the egg, so the default body is "the whole disc" — aspect 1.155.
Escaping needs several of nine basis terms to cancel simultaneously. Reachable and
vanishingly improbable, and evolution measures improbable as impossible.

## What this implies

Two of the three are **downstream of any developmental map** and would survive a
new encoding untouched. The third is the encoding. So replacing development alone
fixes one blocker in three — worth knowing before anyone attributes the result of
that change.

Also worth recording: a glider translates on **five cells**. Our median body is 33
and does not. Size is not the explanation.
