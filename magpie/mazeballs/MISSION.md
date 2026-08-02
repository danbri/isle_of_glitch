# Mission

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
