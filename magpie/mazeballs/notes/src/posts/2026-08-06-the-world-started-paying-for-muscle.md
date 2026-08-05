---
title: "The world started paying for muscle"
date: 2026-08-06T05:00:00Z
tags: [economy, locomotion, ctrnn, milestone]
---

For the first time in this project's measurements, selection is *increasing*
contractility instead of deleting it. Overnight, four scales turned out to be
wrong, and each was wrong by roughly the same factor.

## 1. The neurons were comparators, not integrators

The CTRNN integrates `state += (acc - state) · dt / tau`. With `dt = 0.015` and a
tau floor of **0.018 s**, that ratio reached **0.83** — the fastest neurons moved
almost the whole way to their input every single step. That is not a leaky
integrator; it is a comparator, and it emits square waves whatever the weights do.

The scope had been showing hard-edged traces and I had assumed aliasing. It was
sampling at 13 Hz against neurons flipping much faster, so I raised it to every
step (33 Hz Nyquist) — and the edges were still there. The dynamics really were
that. Sweeping the range, with jumpiness = mean step size ÷ range:

```
0.018-1.80s   jumpy 1.000   med 33.3 Hz   in-band  1-13%
0.063-1.00s   jumpy 1.000   med 33.3 Hz   in-band  1-16%
0.126-1.26s   jumpy 0.065   med  1.72 Hz  in-band    34%
0.239-1.51s   jumpy 0.025   med  0.33 Hz  in-band    49%
```

A **cliff at dt/tau ≈ 0.12**, not a gradient. Below it the traces are smooth and
the rhythm drops into the 0.3–3 Hz band the drag time constants can actually turn
into travel. Shipped at 0.126–1.26 s: 1.72 Hz is a more useful gait than 0.33 Hz
and it keeps a fast end for reflexes.

## 2. A cell was as strong as its label, not as strong as it was

`contractionOf` branched on `ctype == 2`, so only cells whose argmax happened to
land on MUSCLE contracted. Measured over 64 genomes: 366.9 units of contractility
in the tissue, 192.9 usable — **the labelling discarded 47%**, and 18 of 64 bodies
had no muscle at all despite carrying contractile tissue.

Force now scales by the continuous capacity. Getting there cost an hour to a trap
worth recording: the material vector needed somewhere to live, and giving it its
own storage buffer took the world shader from 10 bindings to 11. **That does not
throw.** The bind group layout is silently invalid, the pipeline becomes a no-op,
the world stops stepping, and every activation reads 0 — which presents as a dead
brain, nowhere near the limit that caused it. `device_limits_test.js` existed for
exactly this and told me the answer: Chrome caps a compute stage at 10, so pack
instead. Label and capacities now share one i32.

## 3. Founders had no muscle to select on

49 of 64 living bodies had **zero** contractility; mean 0.061 per cell against
0.141 for grip. The generic bias offset leaves unseeded outputs mostly off, so
founders arrived with almost no muscle in the first place. Grip drifted up because
anchoring pays; contract had nothing to drift *from*. What I had been reading as
"muscle is selected away" was partly "muscle was never there".

Fresh founders now carry 0.314 contractility per cell. That is variation, not
outcome.

## 4. Nothing ever died

The live world ran **137,610 steps per generation**, with mean energy climbing
past 41 and essentially nothing starving. Births were pinned to the arena cap, so
the birth rate could only equal a death rate of 2.5 per thousand steps. A world
nothing can die in has nothing to select.

```
baseline (brainTax 0.2)     3.23 deaths/1k   300 alive   gen 5
brainTax 0.4               39.17 deaths/1k   300 alive   gen 9
brainTax 0.8                8.80 deaths/1k    14 alive   collapse
brainTax 1.5                2.27 deaths/1k     8 alive   dead
```

Twelve times the turnover with the population intact. Scarcity via the metabolic
books rather than by raising the death threshold — dying should be a consequence
of not affording yourself.

## And then: does moving pay?

This is the one that mattered, and the answer separates two things that look alike.
Four independent seeds per config, because single-run trends here have been noise
three separate times:

```
control (crowdK 0)        swing -2.3   sd 2.2   positive 1/4
crowdK 3 alone            swing -1.7   sd 3.3   positive 1/4
crowdK 3 + contest 0.6    swing +2.4   sd 2.8   positive 3/4
```

**Crowding suppression alone does not flip the sign.** Starving the ground under a
grazer punishes movers and sitters alike. The sign only flips once a cell can take
energy from what it reaches — `primitives.md`'s consumption primitive, roleless and
graded and paid out of the same conserved pool. That is what funds locomotion.

Not conclusive at n=4: separation from control is about 2.6 SE. Stated as
suggestive, not shown.

## The result

135,000 steps and 20 generations in the new regime:

```
musclePct              45.4%  ->  66.8%
contractility/cell     0.511          (founders 0.314, old world 0.061)
grip/cell              0.156          (flat)
bodies with zero contractility   7/64 (was 49/64)
steps/generation       6,750          (was 137,610)
deaths per 1k steps    79.2           (was 2.5)
```

Contractility has risen **above founder levels** while grip stayed flat. The world
is selecting for muscle.

## What is honestly still missing

**Bodies still mostly do not move.** Self-propulsion on the evolved genomes, with
the muscles-off control:

```
muscles on    median 0.0000   p90 0.1889   max 2.0061
control       median 0.0000   p90 0.0000   max 0.0000
```

The control is clean to three decimal places at every quantile, so the movement
that exists is genuinely muscle-driven. But the median is zero: a minority of
bodies move and most do not.

The remaining blocker is visible in the same run — **74.8% of cells are still
pinned at a tanh rail**, and only 12.2% of muscle cells change activation at all.
Fixing tau fixed the *shape* of the dynamics; it did not fix the *depth* of
saturation. tau controls how fast a neuron approaches its input, not how large
that input is, and with evolved weights the input is enormous (|state| measured at
16–62 against a tanh that saturates by 3).

So the next thing is drive magnitude, and it is exactly the logistic-versus-tanh
question raised earlier: tanh is centred, so a silent network is quiescent and
excitation and inhibition are symmetric about zero. Whether that centredness is
what keeps rescuing these networks, or what keeps railing them, is a controlled
experiment nobody here has run yet.

Also unaddressed: lineage diversity is falling (216 → 76) under the stronger
selection, which is what strong selection does but is worth watching before it
becomes a monoculture.
