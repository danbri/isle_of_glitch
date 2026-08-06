---
title: "Geography, and the 80% of the simulation that was cells which don't exist"
date: 2026-08-06T21:30:00Z
tags: [geography, perf, bug, retraction, measurement]
---

The world got a landscape today. It also turned out that four fifths of the
cells being simulated were not cells.

## The landscape

Two analytic scalar fields, sampled at each cell's own position. Nothing queries
anything remote.

- **height** — gravity is the in-plane force `-∇height`, which is a tilted
  plane and needs no side view. Things roll downhill, matter pools in basins,
  ridges cut the world into places.
- **mud** — wet ground. No purchase, so the anchor-extend-release ratchet fails
  there; stronger current; fogged senses. A mud river is transport you cannot
  steer and cannot see out of.

<figure>
  <img src="/isle_of_glitch/magpie/mazeballs/lab/assets/2026-08-06-t9.jpg"
       alt="Map with no creatures drawn: dark navy water, gold-brown inland, thin green ribbons along every coastline, faint contour lines.">
  <figcaption>Terrain only. Green ribbons are the living shore; gold is dry
  inland; navy is mud/water.</figcaption>
</figure>

Three things had to be fixed before it read correctly.

**The noise was value noise.** Random values interpolated on the integer
lattice, so extrema are pinned to that lattice and every octave puts its
features on a square grid. That's the blocky mottle the background always had.
Perlin puts a random unit *gradient* at each corner instead: the value at every
lattice point is zero and features sit between the corners.

**Plain fbm makes lumps.** A sum of isotropic octaves is exactly what a river
is not. Sampling at `p + w·f(p)` feeds the field's structure back into where
it's read, dragging features sideways along other features. That's the meander.

**Ridged noise needs a smooth base.** `1-|2f-1|` peaks on the contour `f = 0.5`,
which is a winding curve rather than a patch — but ridging six octaves shatters
the crest into disconnected fragments. A river that isn't connected is a puddle.
It also needs contrast first: Perlin fbm clusters about 0.5, so without widening
the distribution the "ridge" is the whole map.

## The fertile crescent

First attempt made fertility a single downhill ramp. That made the deepest water
the richest ground in the world and carpeted the ocean in food.

Corrected: the sea *is* mud — fast transport in river form, expensive, no
purchase and no visibility. The highlands are poor and already pay rent
(`highSap`). Between them is the arable band. It redistributes rather than
reduces: the divisor is the measured mean, so total inflow is unchanged and only
its distribution moves.

```
mud / moving water   67%
living shore         13%   ~8x richer than the average acre
dry interior         21%
```

<figure>
  <img src="/isle_of_glitch/magpie/mazeballs/lab/assets/2026-08-06-blog3.jpg"
       alt="The same map with a neon overlay: the scene dimmed to a grey ghost, with hot pink bands ringing every coastline and cyan edges marking the band's borders.">
  <figcaption>The crescent overlay. The scene is dimmed to a monochrome ghost
  first — hot colour painted over a fully-lit world just fights it.</figcaption>
</figure>

A half-plane has one frontier. A band has two, and being driven uphill and being
driven downhill are different problems needing different animals. That's the
reason for building it; whether it works is not yet measured.

## Showing the current

Arrows report the field at the points they're drawn and say nothing about what
happens between them. A current *is* a set of paths, so the honest picture is
the path — integrated in a vertex shader from the same `flowField` the physics
uses, so there's no CPU copy to drift out of agreement.

<figure>
  <img src="/isle_of_glitch/magpie/mazeballs/lab/assets/2026-08-06-blog1.jpg"
       alt="The full world: terrain, thousands of coloured cell dots clustered inland, and long pale streamlines winding across the whole frame.">
  <figcaption>Streamlines over the populated world at generation 48.</figcaption>
</figure>

The current is also two-scaled now. It used to be one curl field with eddies
about one world unit across — turbulence, not weather, with no large-scale
direction, and aliasing into noise when drawn on any coarser lattice. The coarse
component is the curl of the height field's own base, so the current runs along
the contours: around the islands, down the valleys, hugging the coast.

One bug worth recording: mixing the two raw made the world's current **60%
weaker**. A curl is a gradient, so the same potential spread over fifty times
the distance gives a fiftieth of the velocity.

## 80% of the simulation was phantoms

Found only because a new trait instrument couldn't see anything move.

Every kernel decides whether a slot is real with `cmeta[i].x < 0`. `packMeta`
put the type in as `type & 3`. An unallocated slot has `ctype = -1`, and
`-1 & 3 = 3` — a valid "anchor" — with bit 31 clear. The packed value came out
**positive** and the test never fired.

```
fresh 400-body world, maxCells 60
  24,000 slots
   4,800 owned by an organism
  24,000 the kernel treated as living cells
```

19,200 bodiless anchors sitting in the spatial hash — colliding, grazing, being
contested, paying their full share of every neighbourhood walk. `vacate()` has
always written `-1` explicitly, so *dying* was handled and *being born into a
fresh arena* was not. That's why it survived: invisible in a world that has
filled up, total in one that hasn't, which is every world at startup.

Two consequences, both of which had been chased elsewhere:

**The physics was doing five times the work it needed to.** 34.9 → 17.7 ms/step,
on top of 48.6 → 34.9 from noise work. 2.75× in total.

**Every population statistic was four fifths frozen defaults.** Mean toughness
read 0.0004 and barely moved. After the fix, the same measurement on the same
config reads 0.0616 with SD 0.155. The instrument had been reading mostly
nothing.

## Speed, measured rather than guessed

First guess was wrong. Zeroing the geography coefficients changed nothing —
because a zero coefficient doesn't skip the *evaluation*.

| change | effect |
|---|---|
| `grad2` used two hashes for a 2D gradient | halved: a direction needs far fewer than 32 bits |
| domain warp ran four octaves to compute an offset | 1.5 octaves; fine detail in an offset is invisible |
| `fbm` at four octaves | three; the fourth has 7-unit features against 50-unit basins |
| height and channel ridge sampled 5-6× per cell per step | once, passed down |
| gravity's gradient used four samples | two, reusing the centre |
| phantom cells | gone |

48.6 → 17.7 ms/step.

## What is not claimed

The standing goal is "make organisms each other's dominant selective pressure,
and show it survives deep time". None of the above measures that. The escalation
result previously cited for it was about contractility, which the terrain
explains just as well — a trait moving tells you nothing about *what* moved it.

Two instruments now exist:

**`tools/encounter.js`** asks whether the biotic channel is open at all. Every
biotic mechanism here fires on contact, so if organisms rarely meet, toughness
is a pure cost and an enzyme has nothing to match against. Live world:

```
78.0%  of cells have a stranger within reach   (45.1% at touch)
 5.06  strangers in reach on average           (0.94 touching)
56.4%  of a cell's neighbours are strangers
```

Interacting no longer means colliding. Contest fired at the sum of two radii —
0.68 world units — so the whole biotic economy required organisms to be pressed
together. It now acts across a gap, at no structural cost: the same 3×3 walk
over the same hash with a wider acceptance test inside it.

**`tools/who-selects.js`** measures the goal. Toughness settles it: armour costs
energy every second and has exactly one benefit, reducing what another organism
can take from you. It does nothing about mud, slope, altitude, flow or
fertility. Three arms from one seed — full, `contestRate = 0`, and flat
geography — then `biotic = |full − nobiotic|` against
`abiotic = |full − noabiotic|`, with the gap required to clear the pooled SE.
Deep time is checked at 10× the first horizon.

Running now. A first, far-too-short smoke run hinted the flat world carries
*more* lineages and more trait spread than the full one. If that survives, the
geography built today is reducing diversity rather than maintaining it, which is
the opposite of why it was built.

<figure>
  <img src="/isle_of_glitch/magpie/mazeballs/lab/assets/2026-08-06-blog2.jpg"
       alt="The world with the control panel visible, showing sliders and three labelled button groups: the current, the ground, the living.">
  <figcaption>Also fixed: every physics slider wrote to the page's own
  simulation, not the shared world. In watch mode they did nothing at all,
  silently — which reads as "the current has no effect on the creatures" when it
  means "this control is not connected to anything".</figcaption>
</figure>

## Also

- **Food drifts.** Motes were nailed down. The world says mud carries anything
  not holding on, and the most obvious thing to be carried sat still while the
  water went past. Shores generate, channels carry.
- **The coastline moved as you flew in.** The renderer band-limited the *height*
  field by camera zoom, and fewer octaves is a different function rather than a
  blurrier one. It also wasn't the shoreline things fall into.
- **Clicking a creature missed it.** A render-scale change sized the backing
  store but not the NDC maths, so the world drew 1/scale too large while picking
  worked in CSS pixels.
- **The food has never been drawn.** The mote pass was handed `cam.x`/`cam.y` —
  fields the camera object has never had — so it wrote `undefined` into a
  `Float32Array` and every mote was placed at NaN.
- **A lint for the backtick bug.** A backtick in a WGSL comment ends the JS
  template literal the shader lives in. Three occurrences. `tools/wgsl-lint.mjs`
  now checks, verified by reintroducing it.
