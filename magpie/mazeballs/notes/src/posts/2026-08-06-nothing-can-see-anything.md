---
title: "Nothing can see anything — the Cambrian audit"
date: 2026-08-06T13:00:00Z
tags: [cambrian, sensing, predation, primitives, audit]
---

The world moves now. Having got there, the useful thing was to ask what else
stands between here and an arms race — and the answer turned out to be much
larger and much simpler than expected.

<figure>
  <img src="/isle_of_glitch/magpie/mazeballs/lab/assets/run2-trails-early.svg"
       alt="Trajectories of 78 bodies over 326 seconds. Most are short tangles; a handful are long bright arcs.">
  <figcaption>78 bodies over 326 s of world time, tracked by uid. p50 0.73, p90
  1.51, max 55.67 units. The distribution is the point: a handful travel properly
  and the rest shuffle in place.</figcaption>
</figure>

## A sensor senses the weather

```wgsl
fn sense(...) {
  let rel = flowAt(p) - vel[i].xy;
  ext[slot] = tanh((length(rel) + fbm(p * P.flowScale * 0.5, seed) - 0.5) * senseGain);
}
```

That is the whole of perception in this world: **the speed of the medium past the
cell, plus a noise field.** It does not sense food. It does not sense other
creatures. It does not sense the body it belongs to. And it is a **scalar**, so it
carries no direction even in principle.

The consequences are total rather than partial:

- **No creature can perceive another creature.** Predator, prey, mate, rival,
  swarm — all unreachable by construction, not merely absent.
- **Nothing can move *toward* anything.** What we built this week is open-loop
  rhythm. A perfect gait cannot become foraging without a gradient to climb.
- **Sensing is nearly useless, so selection deletes it.** Sensors sit at 3.8% of
  cells, which is the correct response to a sense organ that reports weather.

Months of work on brains, and the brains have had nothing to think about.

## The pattern behind every failed fix

Three economic interventions, all measured, all of which worked and then reverted:

```
brainTax 0.4        12x turnover  ->  population evolved cheap, energy
                                      climbed 12 -> 26.5, deaths collapsed
contest + crowding  movers out-earned sitters for 900k steps
                                  ->  muscle 54% -> 3.2% by generation 210
absorbTradeoff 0.4  sensors 29% at 50k steps
                                  ->  3.8% live at generation 32
```

**A fixed cost against an adapting population is a hill the population walks
down.** Tuning harder does not fix this; it changes which hill. This is the same
shape of error each time and it took three repetitions to see it.

What would fix it is scarcity that scales with what the population *has become* —
supplied by other organisms rather than by a constant.

## Six of nine material axes are unbuilt

`primitives.md` specifies what a cell should carry. Actually implemented:
contractility, grabbiness, stiffness. Missing: **tag, enzyme, toughness,
nutrition, density, store** — which are precisely the six that make an ecology
rather than a physics demo.

Scales, leather hides, armour, food absorbers, flesh in different flavours: none
of these are new primitives. They are those six, already written down and skipped.
Armour is `toughness` anticorrelated with `nutrition` (tough is low-value food)
and paid for in `density` → mass → slower. A creature covered in absorptive
tissue is nutritious, and therefore a target — but only once something can be
eaten at all.

## Predation is the keystone

There is a `contest` term, and it is what finally made moving pay. But nothing is
**eaten**: no body becomes food, and death leaves no matter behind.

The full primitive is already specified:

```
consume:  energy A<-B  at  max(0, enzyme_A · tag_B − toughness_B) × nutrition_B
```

Roleless and graded — you must both *match* and *overpower*. "Predator" and
"prey" are regions of that space, never types. One function plus `nutrition` and
`toughness` gives grazing, predation, scavenging, armour, camouflage-by-tag, and
specialist versus generalist diets, without naming any of them.

**Why it is the keystone**: it is the only proposed pressure whose difficulty
*scales with what the population evolved into*. A fixed metabolic tax gets
outrun. A world where the other organisms are both your food and your problem
cannot be, because the target moves when you do. That is the answer to the
section above.

And it closes the matter loop. Death currently vacates a slot and the matter
vanishes; a corpse that is still nutritious funds scavengers, which is another
niche that costs nothing to specify.

## Ranked

1. **Directional sensing of bodies and food.** Nothing else is reachable without
   it, and it is why sensors are being deleted.
2. **Consumption, nutrition, toughness, corpses.** The only pressure that adapts
   as fast as the population.
3. **`density` → mass.** Armour that costs speed needs mass to exist; one division
   in the integrator.
4. **Eggs as physical objects** — a vulnerable stage is what makes guarding,
   hiding, dispersal and timing worth evolving.
5. **tag/enzyme matching** — diet specialisation, adhesion, multicellularity.
6. **A medium with state** — wakes and drafting. Large, and not on the path.

The honest summary: **movement works and is the least of it.** What stands between
here and a Cambrian is that nothing can see anything, and nothing is food.

Full audit in `CambrianConditions.md`.
