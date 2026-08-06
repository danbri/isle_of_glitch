# Mission

> ### ⚠ SUPERSEDED — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md)
>
> This document is **history**. It describes the ambition, and carries a '17x locomotion' headline that is RETRACTED, and parts of it are no
> longer true of the code. It is kept because the ambition itself still stands, not as a description of the
> world.
>
> **For what the world actually is and does now, read `WORLD-MANUAL.md`.** Where
> this file disagrees with the manual, the manual is right.

The ideal is the Cambrian explosion: an infinite ascent, an arms race that
starts itself.

Before it, animals and plants just sat there, indistinguishably lame, swooshing
around in the water not really moving. After it — predator and prey, teeth and
claws and shells, mobility, the first basic vision, the kind of beast you could
sell at Legal Seafood: ancestors of scorpions and woodlice and crabs and
insects and all the rest.

The bet, held for a long time, is that an evolutionary-computing world where you
coevolve **brains and bodies** to compete in a 2D pre-Cambrian sea would be
enough to strike the seeds of intelligence. LLMs arriving make it feel almost
in hand from the other direction. That doesn't retire the question. We still
want to build the thing and watch it happen.

## Why this is not romance — the evidence lines up with the story

The project spent its first long phase on exactly the "before" state, and
measured it to death. The incumbent organism — twelve cells on a fixed line, a
differential drive that cannot change — evolved one behaviour, **klinokinesis**:
a biased random walk that turns more when a smell fades. Nine attempts to make
it do anything more were null. It found a wall to hug and called it a strategy.
Its behavioural traits were about 5% repeatable, so selection was mostly sorting
noise. That *is* the animal that sits there swooshing, and we now know precisely
why it never became anything: not a dead genome, but a body that could not vary
and a fitness that rewarded luck.

The "after" state needs a body that development can discover. That substrate now
exists (`lib/softbody.js`): a clump of cells grown by a real Turing
reaction-diffusion process, each cell taking a role — **sensor, neuron, or
muscle** — from the pattern; muscles that are springs driven by the cells' own
CTRNN activity; one continuous-time organism in a continuous 2D world. It
passed the test the incumbent never could: its behaviour is ~90% repeatable, so
selection has real signal to grip. And the first evolution ever run on it made
locomotion **ascend seventeen-fold**, replicated. Things that sat still learned
to crawl.

## What is already built toward the arms race

- **A second species and a real predator/prey world**, off by default, in the
  incumbent — prey forage, predators eat prey.
- **The instrument that can see an arms race at all**: a cross-generational
  tournament that scores each generation against frozen ancestors, because
  during a genuine arms race absolute fitness is flat by construction and a
  fixed yardstick reports nothing. It has already caught a one-sided race the
  ordinary score called a null.
- **Selection that actually climbs**: tournament k=2, the one rule in this
  project's history that ever moved a population off its incumbent strategy.

## What is missing, honestly

The 17× ascent is locomotion, selected in isolation. The arms race has been run
on the *old* body, and coevolution on the *new* body has not been run at all.
Foraging on the soft body is still a by-product of crawling, not directed
feeding — that is the experiment in flight. Vision is a sensor role away but has
never been made to matter. The refuge exploit and the wall-hugger are standing
reminders that this substrate finds the cheap degenerate answer first, every
time, and the world has to be built so the cheap answer is not enough.

The next real rungs, in order of how directly they attack the mission:

1. Directed foraging on the soft body — make a sense worth having.
2. Predator and prey as two soft-body species in one sea, scored by the
   ancestral tournament, not by absolute fitness.
3. A reason for vision — food or a predator that can only be dealt with by
   seeing it at range.
4. Let the loop drive itself. The whole research protocol here is already
   [autoresearch](https://github.com/karpathy/autoresearch)-shaped — propose a
   change, run a fixed-budget experiment, keep it only if it clears the
   significance bar, roll back if not. Wiring the actual harness to run that
   loop unattended is the point at which the ascent stops needing a hand on it.

The whole apparatus — the significance bar, the adversarial verification, the
distrust of any single run — exists so that when something on this list finally
works, we will be able to tell it apart from wishful thinking. The Cambrian did
not need a referee. We do, because we are the ones who would otherwise fool
ourselves.


## Eyes on the prize

fieldsim.html, evolve.html and viewer.html were inspiring TOGETHER, and the GPU
world has not yet earned that. It has scale, measurement and a defensible physics
where they had none. They had something it lacks, and the gap is not vague:

**A creature must be legible as a creature.** viewer.html drew bonds as thick
strokes coloured by the muscle's own activation, so you could watch a body work —
the muscles were visible as muscles, contracting. It drew cells as filled discs
with a dark rim, so a body read as a set of distinct parts rather than a wash.
The GPU renderer drew hairline grey bonds carrying no state and, for a while,
gaussian blobs whose tails summed into haze. More cells, less creature.

**The field was something to look at.** fieldsim.html was beautiful before
anything lived in it. Flow that reads as flow, at every zoom.

**The numbers were part of the picture.** evolve.html put the lineage plot beside
the world, so what you were watching and what it meant were one glance apart.

WHAT WE ARE ACTUALLY AFTER, and none of it is here yet:

- **Bodyplans.** Repeated modules, segments, limbs. Symmetry that arose because
  it was worth having. Right now a body is a random graph of 40 cells and looks
  it: no head, no sides, no repeated unit.
- **Intelligence visible in behaviour.** Not a number claiming adaptation, but a
  creature that plainly does something — approaches, avoids, follows, waits.
  Gaits with a rhythm you can see.
- **Pattern and symmetry as evidence.** When structure appears it should be
  visible without instrumentation. A measurement that says a population improved,
  in a world where nothing looks different, is a weak result even when true.

The honest position: the science and the scale are coming together, and the thing
is uglier and less legible than the demos it grew from. That is a real regression
and not a matter of taste — a world you cannot read is one where a bug hides for
five diagnoses, which is exactly what happened with the diagonal streaks.

Easy, fun, functional and beautiful. In that order when they conflict, because a
tool nobody enjoys looking at does not get looked at, and this one needs looking
at to be debugged.
