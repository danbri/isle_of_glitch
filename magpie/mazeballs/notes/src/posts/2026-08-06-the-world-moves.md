---
title: "The world moves — how four wrong scales added up to a static world"
date: 2026-08-06T09:30:00Z
tags: [locomotion, milestone, physics, ctrnn, retraction]
---

Bodies locomote under their own brains, with the muscles-off control clean at
zero. Live, 673 bodies tracked by uid over 283 seconds of world time:

```
displacement       p50 0.953   p90 18.268   max 71.008 world units
common drift       0.089            <- the field is not doing it
relative to drift  p50 0.979   p90 18.200   max 70.970
```

This morning the same measurement read p50 0.399, p90 0.919, max 2.1.

It is jiggly, not graceful. The median body covers a fifth of its own length in
283 s; the p90 covers three and a half lengths and the fastest fourteen. That
skew is the honest headline: **a minority move properly and most still shuffle.**

## Why it was hard to find

Nothing moved, and every plausible cause was true at once. Four independent
scales were wrong, each individually sufficient to prevent locomotion, so fixing
any one of them changed nothing measurable and looked like a dead end. The only
way through was an instrument that could separate them.

## The instrument that broke the deadlock

Drive the muscles from an **imposed travelling wave** — `sin(axial·k − ωt)` —
instead of from the brain. That splits one unanswerable question into two
answerable ones:

- bodies move under an imposed gait → the body plan is fine, the **controller** is
  the blocker
- bodies do not move even then → no controller would have helped, the **body and
  physics** are the blocker

Building it needed each cell to know its position along its own body axis, which
development already computes as `ap` and the kernel had no way to see. It is now
packed into spare bits of the cell's metadata word.

The first run of this diagnostic was itself broken, and the way it broke was
lucky: three different frequencies produced **byte-identical** displacement. A
travelling wave whose frequency does not matter is not travelling. The world
clock was frozen — `step()` only republished the uniform block when drift or
morphRate were non-zero, which is true of every isolated assay in `tools/`, so
`worldTime` had sat at 0 forever and the wave was a static deformation. A clock
that only ticks when someone else needs it is not a clock.

With that fixed, the answer came back: **bodies did not move even under a perfect
gait.** p50 0.012 units in 300 s at every frequency and wavelength tried. The
controller had never been the blocker.

## The three things that were wrong

**1. Muscle was ten to twenty times too weak.** Displacement against `contract`,
under an imposed gait:

```
0.45  p50 0.067   span x0.97  torn 0/30
2.5   p50 0.199   span x0.82  torn 0/30
5     p50 0.490   span x0.82  torn 1/30
10    p50 0.891   span x0.86  torn 1/30
20    p50 1.594   span x0.95  torn 2/30
```

Twenty-four times the displacement. The span column is the guard against this
project's classic false positive — displacement from a body flying apart is not
locomotion — and bodies end slightly *contracted*, not scattered.

`muscleCost` had to scale down with it. Work is `muscleCost × |contraction|`, so
eleven times the force is eleven times the metabolic bill: at contract 5 with the
old rate the population fell from 300 to 11. Scaled, it holds at 300. Said
plainly because it is a real choice and not a free lunch — this makes muscle
stronger per unit fuel. Nothing is minted, but the contractility-versus-fuel
tradeoff `primitives.md` asks for is weaker than it was.

**2. Grip did not anchor.** In the traction kernel, `grab` appeared only in the
*perpendicular* drag term:

```wgsl
let kA = P.fricK * (P.slipBase + grit);                              // along axis
let kP = P.fricK * (P.slipBase + (1.0 + P.gripAniso * grab) * grit); // sideways
```

A gripping cell therefore slid along its own axis exactly as freely as a released
one. There was nothing to pull against, and anchor-extend-release — the
caterpillar, the tube foot, walking through buttery snow — could not work however
well it was phased. `gripHold` now raises drag in *both* directions with grip, so
a gripped cell is planted and a released one slides. Still dissipative, and the
passive case still nets zero: constant grip is reciprocal and the scallop theorem
eats it. Only phased grip ratchets.

`fricK` came down 6 → 2 at the same time. The ratchet needs contrast, and at 6 the
released phase had a drag time constant of 0.14 s against a 0.7 s gait — both
halves of the cycle were overdamped, so the body never glided when it let go.

**3. Nothing was driving it.** `SYN_BASIS` has carried an antisymmetric `axial`
term, `(b.ap − a.ap)`, since it was written — with a comment saying it exists so a
genome can excite down the body and inhibit back up it, which is exactly the
asymmetry a travelling wave needs. It was never seeded. Founders drew it near
zero along with everything else, so a central pattern generator had to be
invented from nothing.

Seeded, with random sign per founder because neither direction is privileged:

```
fresh founders, brain-driven   p50 0.744   p90 9.122   max 56.360
CONTROL muscles off            p50 0.000   p90 0.000   max  0.000
same bodies, imposed gait      p50 0.409   p90 2.444   max 15.528
```

The brains now **out-run the hand-written travelling wave**. Against evolved
genomes before the seed, p50 0.018, it is 41×.

This is the same argument as seeding contractility earlier: evolution cannot
select for a capacity that is not in the population. It is variation, not
outcome — mutation can weight it to zero, and the economy still decides whether a
gait is worth its fuel.

## Two things I had wrong

**`swim-verify.js` was never a control on our physics.** I had been citing its 36
body-lengths as proof the locomotion primitive works. It is a *separate CPU
model*: a hand-placed 9-node chain, driven by transverse force rather than
rest-length change, with its own drag constants and a body thirty times smaller.
It shares no code with the GPU kernel. It proves an anisotropic-drag ratchet can
move a chain in a different model, and nothing about ours.

**The body axis was arbitrary, and fixing it changed nothing.** Traction took the
first two bonds in slot order as the body axis — correct for a chain, meaningless
for a hex body of degree 4–6, where it is a random local lattice direction. It
now follows the head-tail gradient. Displacement moved 0.110 → 0.095: no effect.
Recorded because a correct fix that buys nothing is worth knowing, and because I
would otherwise have claimed it.

## What is still wrong

- **The distribution is badly skewed.** p90 is 18× the median. Most bodies shuffle.
- **The economy has not voted yet.** It deleted contractility once already, over
  deep time, after a promising 900k steps. Whether gaits survive is unmeasured and
  the honest expectation is that they are on trial.
- **Muscle is cheaper per unit force than it was**, which weakens a tradeoff the
  design documents want to be real.
- **Sensors are scarce**, so this is open-loop locomotion — rhythm, not navigation.
  Nothing yet moves *toward* anything.
