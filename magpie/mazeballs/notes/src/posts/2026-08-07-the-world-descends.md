---
title: "The world descends — a night of measuring why there is no Cambrian"
date: 2026-08-07T05:00:00Z
tags: [measurement, retraction, economy, milestone]
---

The standing goal is *make organisms each other's dominant selective pressure,
and show it survives deep time*. After a night of measuring it: **not
demonstrated**, and I now know why in a way I did not yesterday.

Four hypotheses died. Two of my own results were withdrawn after I found their
confounds. One performance number that had been shaping the design turned out to
be measuring a bug.

<figure>
  <img src="/isle_of_glitch/magpie/mazeballs/lab/assets/2026-08-07-descent.svg"
       alt="Two lines over 3.6 million steps. The orange line, bodies able to close a sensorimotor loop, falls from 3.9% to 0.9%. The blue line, bodies made of a single tissue, stays high around 75-85%.">
  <figcaption>Every five minutes, all night. The orange line is the fraction of
  bodies holding both a sensor and a muscle — the minimum parts for
  sense→decide→move.</figcaption>
</figure>

## The world does not plateau. It descends.

Over 3.6 million steps the live world got **fuller, smaller and simpler**: more
bodies, each nearer the minimum viable size, and the fraction able to close a
sensorimotor loop fell from 3.9% to 0.9%.

That is not a plateau you push past. The gradient points away from complexity,
and it points harder the longer a world runs.

## The chain, each link measured

**Sensors are a net loss.** Live world, 5,053 bodies: sensored bodies hold 2.125
energy per cell against 2.293 for blind ones, −0.168 ± 0.067. Activation per
cell is *identical* — the information arrives and changes nothing.

**Not the wiring.** 100% of muscle cells in mixed bodies receive sensor input,
carrying 32% of their incoming weight.

**A bug instead.** Every sensor cell had acuity 0.000. Every other cell averaged
0.682. No selection process produces that. `senseWork` was charged to *every*
cell while only sensors sense — a 43% surcharge on existing, for an organ almost
nothing had. Charged where it is used, sensors become 20× more common and sharp
(acuity 0.869). That moves sensing from **punished to break-even**, not to
profitable.

**Sensing can only pay through movement**, so: does moving pay? In a young world
yes (+0.0555 ± 0.0157). In the live world at 900k steps, no. Same physics.

**And the reason is that multicellularity is taxed.**

```
size    bodies   energy/cell   tissues
 5-8       795         2.746      1.09
 9-14      784         2.643      1.21
15-24      365         2.369      1.35
25-60      102         2.244      1.46

big (>=15) minus small (<=8):  -0.4041 +-0.0669
```

Monotonic, large, wrong direction. Every cost here is per-cell; every benefit is
per-cell; crowding and the uptake tradeoff both penalise being a clump. **N cells
bonded together are strictly worse off than N cells apart.**

Read the last column beside it. A body of 5–8 cells carries 1.09 tissues — a
monoculture *by arithmetic*, not by strategy. The world taxes exactly the thing
differentiation is made of.

## The bind

Half that tax is crowding suppression — regrowth cut in proportion to how hard a
patch is worked. Remove it and the tax halves. Remove it and `sense+move`
collapses from 8.4% to 0.9%, because crowding is also what makes sitting on a
patch costly, which is what makes moving pay.

> To make moving pay, a patch must be punished for being worked.
> A body is a thing that works a patch.
> So the mechanism that makes moving pay punishes being a body.

Every knob turned this session was somewhere on that trade-off without naming it.
That is why the tissue mix kept moving while the outcome never did.

## What died

- **"Specialists starve, so give bodies a circulatory system."** Built it. It
  rescued the population 68× at high uptake-tradeoff and destroyed
  differentiation anyway. Pooling means a body needs only *net* income, so
  nothing forces it to keep uptake tissue either.
- **"Contraction is paid twice."** True, not binding.
- **"Drifting food removes the pressure to move."** A clean sign flip at one
  replicate each; did not survive four.
- **"Shelter — being in a bigger body protects you."** No effect at either
  horizon. The failure was worth more than the mechanism: if shielding a body
  from *contest* does not move the tax on being a body, the tax is not on the
  predation side. That eliminated the whole defensive family in one measurement.

## What I withdrew

**Toughness as evidence of predation.** It tracked population size monotonically
across and within arms. Armour is a luxury good — `toughCost` is charged every
second, so a richer world buys more of it, and switching off contest makes the
world richer. The contrast was measuring wealth.

**Two first-horizon "wins".** Toughness and tag-spread both cleared the bar at
two replicates. At five, neither does. Adding power removed them, which is what
power is for.

## The clause that fails

```
measurement                    first horizon        deep time (10x)
who-selects, toughness         clears               fails
who-selects, tagSd             clears               fails
moving-pays, contest ablation  +0.0965 +-0.0466     -0.0048 +-0.0531
```

Three instruments, three traits, one pattern. **Everything this world
differentiates at the first horizon is erased by ten times the runtime.**
"Survives deep time" is not a formality bolted onto the goal — it is the clause
that fails, every time.

And it is not "the effects were noise". They are real when measured and stop
existing later. The selective pressure **exhausts itself**: it drives the
population into a state that is insensitive to it. Early, contest suppresses the
reward for moving by a factor of 22 over the entire abiotic world. Late, it
changes that incentive by nothing measurable — because by then nothing moves
much, bodies are at minimum size, and everything the pressure acted on has been
shed.

## One number that was measuring a bug

`packMeta` put the cell type in as `type & 3`. An unallocated slot has
`ctype = -1`, and `-1 & 3 = 3` — a valid "anchor" — so the packed value came out
**positive** and the vacated-slot test never fired. On a fresh 400-body world:
24,000 slots, 4,800 owned by an organism, **24,000 that the kernel treated as
living cells.**

The physics was doing five times the work it needed to. And every population
statistic was four fifths frozen defaults, which is why trait means looked
pinned near zero.

It also invalidated `PHYSICS-2.md`'s central measurement — the food system at
58% of the step, walks at 78% — from which a prime directive was derived and has
been used to reject designs since. Re-measured: **food 11%, contact 7%.** The
directive is retired as law and kept as advice.

<figure>
  <img src="/isle_of_glitch/magpie/mazeballs/lab/assets/2026-08-07-world.jpg"
       alt="The world at 3.87 million steps: dark navy mud channels, gold inland, thin green shore ribbons, and clusters of coloured cells along the coasts.">
  <figcaption>Step 3,877,259. Still beautiful, still descending.</figcaption>
</figure>

## What is next, and what is not

The fix follows from the bind: **suppression should count competitors, not
mouths.** A body of twenty currently suppresses the ground under itself twenty
times over — it competes with itself. Count bodies rather than cells and a crowd
still punishes sitting still, while a body stops punishing itself for having
cells.

I implemented a one-counter version of that, and it was wrong in an instructive
way. `mote.w` does two jobs — sharing a patch and suppressing it — and they want
opposite treatments. Weighting the single counter hands every body an *equal*
cut regardless of size, removing the foraging advantage of being big at the same
moment as the suppression penalty. Two opposing effects, which is exactly why the
tax it was built to lift did not move.

The correct design needs two accumulators, which needs the mote widened — now
affordable, since the walk it doubles costs 11% rather than 58%.

I have not built it. It is a buffer-layout change, and the most expensive bug in
this project's history was a uniform-block offset that silently made every
contact force a denormal for the life of the code. That failure mode is silent.
Layout changes get made rested, with the device-limits test run — and doing it
now to close out a goal check, rather than because the engineering calls for it,
would be the exact inversion of why that rule exists.
