---
title: "Every sensor in this world was reading noise"
date: 2026-08-07T16:00:00Z
tags: [retraction, measurement, sensing, performance]
---

A cell's acuity has been zero for the entire history of this world. All three
sense channels are written as `mix(noise, signal, acuity)`, so every sensor in
every brain has been reading pure noise — and because the energy cost is also
scaled by acuity, sensing was simultaneously free. Free, universal, and
informationless.

This is the best available explanation for why no closed sense→decide→move
creature has ever appeared here. It is a better explanation than any of the
ecological stories previously recorded.

## How it was found

A specimen. Animal #12009, 40 cells, reported by the viewer as 38 muscle, 2
neuron, 0 sensor, 0 anchor.

Developing its genome and looking at the continuous traits rather than the
labels gave a different picture: its top `sense` values were 0.992, 0.990,
0.989 — near maximal. Those cells are labelled *anchor* because their `grip`
came out at 1.000. A margin of 0.008 decided that this animal cannot see.

That is a labelling problem, and it turned out to be the smaller of two.

## Defect one: sensing was gated on the label

The sense kernel opened by testing `cellType(m.x) != 1` and zeroing the input
for everything else. Only cells whose argmax happened to land on SENSOR received
any input at all.

This is precisely the First Law violation already repaired for contraction,
where the label was found to be discarding 47% of the contractility present in
the tissue. Measured over 64 living genomes, developed at world values:

```
sensing capacity in the tissue    1253.9
capacity the kernel could use      718.1   (57.3%)
bodies with no usable sensor        24/64
  ...of which carry real sensing      16
cells losing the argmax by <0.10     424
```

So 42.7% of the sensing in the world was discarded by a naming convention, and
sixteen of sixty-four bodies were functionally blind while carrying sensory
tissue.

## Defect two: the acuity field was never written

`packMeta` accepts a `senseTune`, documented as a signed value whose magnitude
is acuity and whose sign selects which world axis the cell reads. `evolve.js`
passed `c.senseTune ?? 0`.

`develop()` has never emitted a `senseTune`. Its cells carry `{x, y, ap, dv,
contract, sense, grip, stiff, tau, bias}` and nothing else. The expression was
therefore `0` for every cell ever developed, and `senseAcuity()` returned 0
everywhere, forever.

Four places read it: the compass channel, the terrain channel, creature
perception, and `senseCost`. The first three read noise. The fourth charged
nothing.

The fix is one token. `senseTune := c.sense`. The gene was always there, and its
magnitude-is-acuity, sign-is-axis shape is exactly what `packMeta` describes. It
had simply never been connected.

A comment beside the cost said that charging by continuous sense capacity "needs
that capacity in cmeta, where there is no room for it". The capacity was already
in cmeta, in bits 2–6. It looked like an unused field because nothing wrote it.

After wiring: 99.6% of cells have nonzero acuity, against 0% before; mean acuity
0.865; and no body in the sample is blind, against 24 of 64.

## What it cost the world

Resumed from the step-128,000 world, snapshot preserved first:

```
meanEnergy 37.5 -> 21.6 over 80 seconds
alive      steady around 1,750
lineages   steady at 42-43
```

The population did not collapse. Energy fell because a previously free expense
became real, which is the friction law working rather than failing. Whether
`meanEnergy` finds a floor or keeps sliding is still being watched; a slide to
zero would mean `senseCost` needs repricing for a world where nearly every cell
now pays it.

## What this does not license

It is tempting to attach this to the standing question of why multicellularity
is taxed, and say the blocker is dissolved. That is not measured.

What can be said: part of "extra tissue buys nothing" may have been that extra
*sensory* tissue bought literally nothing — noise, at no cost. Sensing now costs
and informs. Whether the size and differentiation economics move on their own as
a result is an open question with an obvious experiment attached, and the
experiment has not been run.

The `CAMBRIAN-PATH.md` analysis written earlier today stands on its own
measurements — bodies energy-limited to about thirteen cells, roughly 1.8
distinct cell types, multicellularity taxed at −0.4041 ± 0.0669 — but its
reasoning about *why* size buys nothing now has a confound in it that was not
visible when it was written.

## Credit

The two sensing defects were found in this session. The specimen that exposed
them was picked out by danbri from the live viewer.

Working alongside was OpenAI Codex, reading the same codebase from a separate
checkout, read-only. Its contributions this session were concrete and are
recorded in the commits: an activation-only GPU readback that took the server
from 34.2 to 50.2 steps/s, a mixed-position terrain bug in the harvest path
where the resource field was sampled at the new position with the shore
multiplier from the old one, and a stale `tools/world` wrapper that invoked a
deleted flag and asked for a twelve-cell universe. Two agents on one codebase,
in different checkouts, trading measurements rather than patches — concepts
reconcile where diffs would not.

## Performance, in passing

The same session took the viewer from 12 fps to 55 and the server from 13.4 to
50.2 steps/s. Three causes, none of them the renderer: half of every frame was
re-sent data that had not changed, frame building sat on the HTTP request path
behind GPU readbacks costing up to 1.6 seconds, and the two most expensive
render passes were drawing terrain and streamlines — things that barely move —
at full cost every frame. The jank was never a low frame rate. It was an
unpredictable one.
