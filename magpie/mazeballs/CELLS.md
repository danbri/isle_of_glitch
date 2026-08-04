# The cell is our atom, and that is a different thing from `predatorSpeed`

A design ruling, recorded because an audit in this repo got it wrong and the
reasoning is worth keeping.

## What the audit claimed

`AUDIT.md` listed "cell types are declared roles" as a First Law violation,
putting it in the same category as `predatorSpeed` — a high-level fiction the
engine privileges instead of letting behaviour fall out of low-level state:

```
export const CELL_NEURON = 0; CELL_SENSOR = 1; CELL_MUSCLE = 2; CELL_ANCHOR = 3;
if (m.x == 2 && m.y >= 0) { ... }   // only type 2 pulls
if (me2.x == 3) { grip = P.gripAnchor; }   // only type 3 grips
```

That collapse was wrong. The two are not the same kind of move.

## Why the cell is a legitimate atom

No simulation models everything down to quarks, electrons and quantum
interactions and still runs in a useful amount of time on a world of useful
size. Everyone compromises; the only question is *where*, and whether the
choice was made consciously.

Ours is made consciously and settled: we are trying to reproduce **Cambrian
Explosion dynamics** in a 2D cartoon universe. Before the Cambrian there was
multicellular life, but it was sleepy — not much red in tooth or claw, because
not many teeth or claws. Taking the CELL as the core organizing unit skips
rapidly over the earlier stretches of life's history and complexity and puts us
at the start of the part we actually want to watch.

A cell is a real thing with a real boundary. It has an inside and an outside,
it exchanges matter and signal across that boundary, and it is where the
relevant machinery actually lives. Picking it as the atom is a **resolution
choice**, of the same kind as not simulating protein folding.

`predatorSpeed` is not a resolution choice. SPECIES is a vague higher-level
human fiction, and dividing species into predators and prey — as with races and
similar categories — imports the conclusion we were supposed to be measuring.
There is no boundary in the world at which "species" is the thing exchanging
anything. That is the difference: **a cell is an object in the world; a species
is a story we tell about a population.** Choosing a coarse atom is a
compromise. Choosing a fictional one is a mistake.

So cell types stay, and the First Law objection is withdrawn as regards them.

## Cells all speak one API

The design consequence is that cell *types* are not special cases bolted onto
the engine — they are entries in a coherent system into which new types can be
dropped for the simulation to craft with. What makes that work is that they all
speak the same API, and that API is grounded in two things:

1. **A stack of vector fields.** Flow, fertility, and whatever else we add —
   continuous, analytic, sampled at a position. Not a grid.
2. **Interactions with nearby cells, living and lifeless.** Contact, bonds,
   adhesion, energy transfer. Local, and mediated by the spatial hash.

Every cell type is then characterised by equations for how its state changes
over time — and the hope, load-bearing for the whole project, is that these are
**embarrassingly parallel**. That is the constraint any new type must satisfy
to be admissible: if it cannot be evaluated for every cell independently from
local state, it does not fit the machine.

Neuron-like cells (sensors, muscles, interneurons) additionally carry an
**activation**, which is what the CTRNN arena integrates.

## LifeStuff

Living cells carry their own internal DNA/RNA-like coding system. In the
*Uncleftish Beholding* mood — plain words for borrowed ones — call it
**LifeStuff**.

LifeStuff could map to cartoon proteins, but we are not going into protein
folding. We are in 2D; it is not going to happen. Instead we pull out the
*properties* that proteins would have brought, and make those the primitives:

- elasticity
- transparency
- colour
- sugars
- brittleness
- stickiness

...and so on. These are continuous properties a cell's LifeStuff sets, and the
bet is that for each there are equations of motion — of gloop, of fracture, of
adhesion — that we can build on and adapt.

## Lifeless cells get character the same way

The same treatment should extend past living matter. Glass, plastic, clay,
wood — each could be given character through this property vocabulary rather
than through a bespoke subsystem. A rock is a cell whose LifeStuff is absent
and whose stiffness is high; ice is a cell that is brittle and transparent.
This is what makes "everything is a sphere with a radius and some stickiness to
the aether" a unifying physics rather than a slogan: living and lifeless matter
differ in their property values, not in which code path they take.

## What this does and does not license

It licenses cell types as a first-class, extensible part of the design.

It does not license the other findings in `AUDIT.md`. Energy minting is still
minting — a size-efficiency bonus that granted energy to a capability was
deleted for exactly that reason, and body-size growth turned out to have been
purchased rather than evolved. Reproduction as an instantaneous point-event is
still the shortcut `eggs.md` names. Size knobs are still knobs where patterning
operators were asked for. Those stand.

The line this document draws is narrower and sharper: **compromise on
resolution, never on ontology.** Model the cell instead of the quark, and say
so. Do not model the species at all.
