---
title: "Things found by looking at it"
date: 2026-08-08T18:00:00Z
tags: [measurement, development, retraction, method]
---

Six defects in this world were found by someone looking at the screen and saying
what seemed wrong. Not by tests, not by assertions, not by reading the code. Each
one turned out to be a real bug, and in four cases the bug had been there for
months without producing an error message.

This is a record of those observations and what they turned out to be, because
the pattern is more useful than any individual fix.

## "There's a seam"

A screenshot with a hard vertical line of cells down both edges of the map.

The world is a torus. Cell positions wrap correctly, and the distance function
does minimum-image, so a cell at one edge measures its true short distance to a
cell at the other. But the spatial hash — the lookup that decides which cells are
even considered as neighbours — hashed unwrapped coordinates. A cell near the
edge probed past it, those coordinates hashed as though the world were infinite,
and the true neighbours across the seam were never found.

What makes it hard to catch is that every force which *was* computed was correct.
The missing ones left no trace: no error, no NaN, no discontinuity in anything
measured. A cell on the seam simply felt contact from one side and packed against
the boundary. The outermost bin held 3.68 times its share of cells; after
wrapping the lookup, 1.47 and falling.

Every spatial statistic this project has ever taken carries that bias, worst at
the boundary.

## "The CTRNN plots look wrong"

Someone who had used continuous-time recurrent neural networks before said the
traces were jagged in a way they had rarely seen.

Each neuron has a time constant, tau, drawn as `0.18 × 10^tanh(s)` — a full
decade either side. The floor is therefore 0.018 s against a simulation step of
0.015 s. A neuron with dt/tau = 0.83 moves 83% of the way to its input every
step: that is a comparator, not an integrator.

Worse, `tanh` saturates, and evolution drives it to the rails. Measured over
1,440 living cells, **every single tau was either 0.018 or 1.800**, with nothing
in between. A brain with two time constants and no middle cannot have a range of
dynamics.

The comment above the synapse-strength constant already said the sweep that
chose it had been re-measured against "the corrected tau range (0.126–1.26 s)".
That correction had been made to the measurement and never to the code.

## "I crank every slider to maximum"

Not a bug report, an offhand remark about habit. It was taken as a signal that
the defaults were wrong, and they were shipped at the maxed values.

That was a mistake, and the same person caught it within the hour: "wiggling
bonds everywhere", "bonds suddenly bright orange". The orange was the strain
colouring doing its job. Mean bond length was 7.07 against rest lengths averaging
0.87, with a quarter of all bonds past five times their own rest. Those were not
creatures.

Isolated over 1,200 steps: drag alone was free at 0.1% of bonds past 5×, muscle
contraction alone 13.8%, flow alone 7.2%, all three together 30.8% — they
compound. Raising stiffness to 1,200 only reached 13.5%, so structure could not
pay for that much force.

This matters beyond aesthetics. A locomotion claim was retracted from this
project once already because the apparent displacement was bodies tearing apart
rather than swimming. Shipping defaults that tear bodies would have made every
measurement in the following run uninterpretable while looking more alive.

## "Growing it bigger hides the interesting part"

The large-growth control ran development synchronously, froze the browser for up
to two minutes, and then displayed a finished body.

The interesting thing about a developmental encoding is that it is a process. The
control was showing the corpse. It now runs in a worker and streams frames, with
a visual language that only claims what the model does: a cell arrives bright and
swells from nothing, colour settles to its type over about a second so the
growing margin reads as a bright rind, and the carve happens **once, at the end**,
because that is when apoptosis is applied. Trickling deaths through the growth
phase would look better and would be a lie.

## "Everything is a radial blob"

The observation that broke the most open. Every form in the developmental wizard
had radial symmetry and tended toward a circle — and if the maternal gradients
were doing anything, structures should vary with depth into a gradient.

Correlating each cell property against position, over sixteen genomes:

```
prop        |r| with head-tail   |r| with across   |r| with radius
contract                 0.134             0.074            0.468
sense                    0.078             0.098            0.527
grip                     0.080             0.069            0.490
```

Expression is not flat. It is organised **radially**, and the maternal axes barely
register. Radial organisation is rotationally invariant, which is exactly the
symmetry observed.

But radius is confounded with age at 0.596, because the body grows outward from
one cell. Separating them, age wins for every property — contract 0.614 against
0.468, sense 0.631 against 0.527. **The radial gradient is developmental age
wearing a spatial costume.**

The mechanism is correct biology doing damage. Cytoplasm is divided rather than
created, so each division halves every gene product in both cells and
concentration falls as 2^−divisions. The network restores state at a median decay
of about 0.96 s while divisions arrive every 0.6 s. **Dilution outruns
synthesis.** The dominant signal in the embryo is how many times a cell has
divided, and a signal that counts divisions is a clock, not a map.

Three earlier puzzles collapse into that one. There are no bands along an axis
because banding needs head-tail dependence. The apoptosis carve is
all-or-nothing because the survival gene tracks age and most cells are of similar
age. Bigger bodies are rounder because more growth means more concentric age
layers.

## "Cells should plump up again after dividing"

The proposed fix, and it is a mechanism rather than a knob — which matters,
because slowing the division rate directly would have been a number chosen to
produce a result. A real cell grows back before dividing again.

Gating division on the cell having rebuilt its gene products moves everything in
the predicted direction: across-axis correlation doubled from 0.080 to 0.158,
age correlation fell from 0.615 to 0.561, elongation rose from 1.11 to 1.32.

That is not yet a result. Plumped bodies are smaller — 111 cells against 156 —
and a smaller body has less age spread by construction, so some of the fall in
age correlation is arithmetic rather than biology. It needs a size-matched
comparison and both horizons before it means anything. It is recorded here as a
promising direction with a named confound, which is the most that one
unreplicated measurement can be.

## Why write this down

The useful pattern is not that an outside eye is valuable in general. It is more
specific: **every one of these bugs was invisible to the code and visible on the
screen.** None threw. None failed a test. The seam produced correct forces, the
comparator neurons produced finite numbers, the torn bodies produced plausible
displacement, and the clock produced a body.

A simulation that can only be checked by its own assertions can be wrong in
exactly the ways its author did not think to assert. Rendering it honestly — and
then looking, and saying what seems off — turns out to be an instrument.
