---
title: "Why 5.4 million steps produced 65 generations"
date: 2026-08-07T12:30:00Z
tags: [economy, measurement, throughput]
---

A run reached step 5,428,589 at generation 65. That is 83,517 steps per
generation. This note records where that number comes from and what would change
it.

## The measurement

```
cells             23,998 of 25,020        95.9% of the arena occupied
births            56,486
deaths            54,723                  net +1,763
alive             2,204
mean energy       27.7 per body           eCap 3.0/cell, so ~92% of the ceiling
birth threshold   18                      max(birthEnergy, yolk requirement)
```

Deaths per step: one per 100. Across 2,204 bodies that is a mean lifetime of
**218,640 steps**.

## The mechanism

Three facts compose:

1. **The arena is full.** At 95.9% occupancy a birth usually fails to find a
   contiguous range, and the birth loop breaks when it does.
2. **A slot only frees on death.** So the birth rate is the death rate. Births
   (56,486) and deaths (54,723) track each other, as they must at carrying
   capacity.
3. **The only cause of death is starvation.** In `lib/evolve.js` the death
   condition is `total[o] <= deathEnergy`, with `deathEnergy = 0`. There is no
   ageing, no maximum lifespan, and no lethal interaction — `contest` transfers
   energy between cells but does not kill.

Bodies sit at 92% of their energy ceiling, so starvation is rare. Nothing else
removes them. Generation time is therefore set by how infrequently a body
happens to run its energy down to zero, which in this economy is once per
~219,000 steps.

The birth threshold is not the constraint. Mean energy is 27.7 against a
threshold of 18, so most bodies qualify to reproduce on most ticks and are
prevented by the absence of free slots rather than by the absence of energy.

## What it predicts

At 14 hours of wall clock:

| steps/s | steps | generations |
|---|---|---|
| 70 | 3,528,000 | 42 |
| 170 | 8,568,000 | 103 |
| 400 | 20,160,000 | 241 |
| 1000 | 50,400,000 | 603 |

70 steps/s is the measured rate with a browser tab attached; 170 is headless on
the same machine. The observed 65 generations over roughly 14 hours, with a
viewer open for part of it, falls in that range.

## The two levers are not equal

- Throughput 170 → 400 steps/s is 2.4×, giving ~241 generations in 14 hours.
- Generation time 83,517 → 10,000 steps is 8.4×, giving ~857.
- Both together: ~2,000.

Throughput work is bounded by what the GPU does. Generation time is bounded by
nothing currently — it is an unset parameter rather than an optimised one.

Two throughput facts, for completeness. Batching more steps per server loop
(`spf`) measured 19 → 24 steps/s from `spf 1` to `spf 8`, a 1.26× gain, so the
per-loop readback in `evo.tick` is not the dominant cost. Closing the browser is
worth about 2.3×, since the viewer and the simulation share one GPU.

## Candidate: senescence

The world has no mechanism by which anything dies of anything other than running
out of energy. Adding one — accumulated damage, or a maximum age per cell —
would set generation time directly.

It is a material property of a cell over time, not a role or a behaviour, so it
does not conflict with the First Law. It also changes the selective regime: where
bodies are effectively immortal, hoarding energy is viable indefinitely; where
everything dies on a clock, a lineage that reproduces sooner is favoured over one
that accumulates.

That second effect is the reason to be careful with it. Four economic changes
made in the preceding session each produced a measurable result that later
measurement contradicted, and the failure mode in each case was a mechanism that
worked as designed and selected for something unintended. Senescence should ship
behind a default-off parameter, be measured at both a first horizon and ten times
it, and be checked against `tools/conservation_test.js` before any claim is made
about it.

## Related

- `tools/conservation_test.js` — the friction law as a test, with a positive
  control.
- `runs/archive/` — lineage representatives and a world snapshot every 5
  generations, which is what makes a comparison across generations possible at
  all.
