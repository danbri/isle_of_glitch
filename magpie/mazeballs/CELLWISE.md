# The organism is a global variable, and it should not exist

> ### ⚠ SUPERSEDED — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md)
>
> This document is **history**. It describes a cellwise redesign that has since been built, differently, and parts of it are no
> longer true of the code. It is kept because it named the problem before the solution existed, not as a description of the
> world.
>
> **For what the world actually is and does now, read `WORLD-MANUAL.md`.** Where
> this file disagrees with the manual, the manual is right.

A First Law violation sitting at the centre of the code, named here so it is not
glossed. Raised by the human: *"even operating at a cell-assembly level is a form
of globality unjustified by raw physics."* Correct, and `CLAUDE.md` already says
so — its list of things that must never be primitives includes **organism**.

## What the code actually does

`lib/evolve.js` `tick()`:

1. reads the energy of **every cell**, and sums it **per organism**
2. sorts organisms, or draws a lottery among those above a threshold
3. asks a **global allocator** for a contiguous run of arena slots
4. calls `develop()`, which builds an entire ~34-cell body **in one step**
5. writes the whole finished adult into the world

Every one of those five is an operation on a thing physics does not have. There is
no membrane around "the organism". Nothing local knows its total energy. No cell
can see the population it is competing with, and none can reserve thirty-four
contiguous addresses.

## Two symptoms we already logged separately

**"A fully grown lyf-gang appears from nowhere."** Observed while watching the
sim, and filed as a rendering oddity. It is not: it is step 4. Development runs to
completion inside a single tick, so an adult materialises. `eggs.md` names exactly
this — reproduction as a point-event — as the shortcut to remove, and the yolk
accounting we added addresses the *cost* of it while leaving the *instantaneity*
untouched.

**Reproduction is the only global dependency left.** Grit, grazing, contact,
traction and crowding suppression are all local — a cell computes them from its own
position and neighbours. Birth is the exception, and it is not incidental: the
sorting and the allocator are load-bearing.

## The lawful version

Cells divide. Nothing else happens.

- A cell that has accumulated enough energy **splits into two**, in place, paying
  the cost. That is a local decision from a local quantity.
- Daughters carry the kinwriting, copied with mutation. Mutation becomes a
  per-division event rather than a per-organism one, which is also what real
  mutation is.
- What a daughter becomes is read from **local chemistry** — the motherdrift
  gradient held by the tissue around it — rather than from a position in an
  abstract egg-space computed by a global `develop()`.
- A **lyf-gang is then emergent**: a connected component of the holdfast graph,
  which is what `largestPiece` already computes and what the assembly uid already
  tracks. We would be *recognising* bodies rather than *creating* them.
- Death is already local (a per-cell energy floor), so it needs no change.

## What this fixes, beyond the law

- **Development happens in time.** A body grows cell by cell over many steps
  because that is the only way it can happen. No adult materialises.
- **Eggs become real.** A propagule is a cell (or few) with yolk, that must grow.
  Containment, the shell, and the chamber all become things that can exist,
  because there is now a process for them to protect.
- **Body size stops being a parameter.** It is however many divisions the tissue
  could afford — an outcome, which is what `METHODS.md` asks for and what our
  `maxCells` knob currently prevents.
- **Polyembryony, fragmentation and regeneration come free.** A fragment is
  cells; if they can divide, they can regrow. Currently a torn body is just a
  body with fewer cells and no way back.

## What it costs, honestly

- **The arena allocator has to change.** Contiguous per-organism ranges are the
  wrong shape when growth is one cell at a time. It becomes a free list of single
  slots, and the CTRNN island invariant — that an organism's neurons occupy a
  contiguous block and edges never cross it — goes with it. That invariant is
  load-bearing for the brain kernel and for snapshots.
- **The brain has to grow.** New cells need synapses to existing ones. Expressed
  synapses (`devo.js`) already derive weights from the two endpoints, so this is
  tractable — the wiring is a function, not a stored table — but edges must be
  added incrementally rather than written once at birth.
- **Every instrument that groups by organism slot changes.** The tournament, the
  locomotion assay, the lineage bookkeeping. The assembly uid survives, which is
  what makes this feasible at all.
- **It will be slower per birth in CPU terms** but much smaller per event: one
  cell instead of thirty-four.

## Sequencing

Not now, and not while the sim is still being stabilised — `CLAUDE.md` is explicit
that the loop must not be closed on an unstable world, and the same caution applies
to a rewrite of its centre. But this is the **largest single correctness debt in
the project**, it is the shared root of two symptoms already logged, and it should
be done before any claim about open-ended ascent, because "the organism reproduced"
is currently an assumption baked into the kernel rather than something the world
produces.
