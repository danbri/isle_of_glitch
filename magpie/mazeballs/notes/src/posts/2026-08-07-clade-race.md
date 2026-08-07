---
title: "The clade race: method"
date: 2026-08-07T13:00:00Z
tags: [method, measurement, coevolution]
---

A clade race asks whether one lineage's fate depends on which other lineage is
present, as distinct from depending on the world. This note describes the method
and the first result.

## Why not measure a trait

Earlier attempts at the same question went through traits: does the biotic
channel move toughness, or tag spread, or enzyme diversity, more than the abiotic
world does? Three problems with that.

- A trait can move for reasons unrelated to the question. Toughness turned out to
  track population size, because armour costs energy every second and a richer
  world buys more of it. That contrast was measuring wealth.
- It requires choosing a trait in advance, and testing several invites the
  multiple-comparison problem. Six traits at two horizons produced one pass,
  which is the null expectation for twelve tests.
- It is indirect. The question is about survival, and survival is measurable
  directly.

## The design

Two lineages, taken as genomes from a live world. Equal founders of each, placed
alternately into a fresh world so neither side gets better ground. Run to a fixed
horizon, then count how many living bodies descend from each side.

Side is carried by descent: a newborn inherits its parent's side. It is never a
label attached to an arena slot, because slots are recycled — a label on a slot
becomes wrong the moment its occupant dies and is replaced.

## The control

Winning a shared world is not evidence on its own. A lineage that holds 55% may
simply be the fitter one in this world, and would have grown faster alone.

So each race is run three times per replicate:

```
MIXED    A and B, equal founders
ALONE-A  A against itself, same world, same seed, same founder count
ALONE-B  B against itself, likewise
```

The monoculture arms give each lineage's growth in this world with no rival. From
those, the share A would be expected to hold if the mixed outcome were only the
two growth rates competing:

```
soloRatio = aliveAlone(A) / aliveAlone(B)
expected  = soloRatio / (1 + soloRatio)
```

The claim is the difference between the observed mixed share and that expectation.
If they agree, the rival was irrelevant and the world decided the outcome. If they
differ, the rival changed it.

## Both horizons

The race is run at a first horizon and at ten times it. In this world every effect
that has cleared a significance bar at a first horizon has failed at ten times it,
so a single-horizon result is not evidence. Running both is cheap relative to the
cost of a retraction.

## First result

Lineage 284 (8 captured genomes, sensor-carrying) against lineage 192 (5 genomes,
predominantly muscle). Four replicates, 50 founders per side, bound 46.

```
first  284 holds 0.4957 ±0.0232   expected 0.4647   excess +0.0310   inside 2 SE
deep   284 holds 0.5491 ±0.0220   expected 0.4646   excess +0.0845   clears 2 SE
```

284 is the weaker lineage in monoculture — 1,041 bodies against 192's 1,200 — so
solo growth predicts it holds 46.5% of a shared world. At the deep horizon it
holds 54.9%.

The effect is absent at the first horizon and present at ten times it. That is the
opposite of the pattern every other measurement in this world has shown, and is
consistent with an interaction needing time to accumulate.

## What is not claimed

This is one discovery run. The equivalent single result for enzyme diversity
cleared its bar and then failed a pre-registered replication on independent seeds.
A replication of this result is running under `runs/PREREGISTERED-clade.md`, with
the bar and the falsifiers written before the run and the discovery batch excluded
from it.

Separately, "the rival changed the outcome" is not the same claim as "the rival
mattered more than the world did". The monoculture control isolates the biotic
effect but does not weigh it against an abiotic one. A second arm with the
geography flattened supplies that comparison and is pre-registered alongside.

## Files

- `tools/clade-race.js` — the method above.
- `tools/zoo-capture.js` — pulls live genomes into `lib/creatures.json` with the
  step, generation and lineage they came from.
- `runs/archive/` — one representative per lineage every 5 generations, with a
  world snapshot and the full parameter set, which is what makes a race between
  eras possible rather than only between contemporaries.
