# Visual language — how the world should read

> **Still current.** How the world is drawn, and why — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md) for how it
> sits in the world as a whole, and for the measurements behind it.

Rendering rules for the alife viewer (`world.html` and the demos): how to make a
crowded, evolving, moving world *legible and alive* rather than fizzing dots, a
scratchy tangle, or a void. Companion to `primitives.md` (the material vector that
drives colour) and the mission's "science-lab-ready, attractive, flowing" ask.

## Credit — inspired by, not copied from

The design grammar below is learned from **David S. Goodsell's *The Machinery of
Life*** (and his molecular-landscape method — the crowded cytoplasm illustrations,
`cellPACK`, the "Mesoscale" models). We apply his *principles*, openly credited; we
reproduce **none** of his artwork, and nothing here generates or imitates his
paintings. Our subject is different — cells and evolved creatures, not canonical
molecules; motion, not stills — so we take the grammar and write our own sentences.
**When this ships, carry a visible credit line** (app "about" / README): *"Visual
language informed by David S. Goodsell's The Machinery of Life."* Keep the
attribution; it is the point, and the honest thing.

## The principles (from his work)

1. **Mute the crowd, colour the story.** In a dense scene the *background* is
   desaturated; only what matters to the current narrative gets saturated colour.
   Legibility comes from restraint, not from making everything shout.
2. **Categorical colour = class, never individual.** A functional class shares a hue
   family; subunits of one machine share a colour.
3. **Dark thin rim + soft matte fill.** Every unit is a soft blob with a dark
   outline, so shapes stay discrete even when packed.
4. **Crowding is the signal of life.** No empty space; a void reads as dead.
5. **The medium is a substance.** The background is a textured material (membranes,
   packed heads), not a black void.
6. **Scale honesty + tiny bright accents.** Small things are small marks; functional
   centres are little bright points.
7. **Muted, cohesive, desaturated palette.** Depth from value and outline, not gloss.

## Our mapping (our substrate is different — motion, evolution, scale)

- **Mute-the-crowd → the viewer's core rule.** Hundreds of thousands of cells cannot
  all shout. Render the mass in a muted cohesive palette; **reserve saturation and
  glow for what is happening now** — the tracked creature, an active feeding contact,
  a division, a gripping foot, an egg hatching. Events pop against a living
  grey-green broth.
- **Categorical colour → derive it from the material vector** (`primitives.md`). Bin
  the continuous material into a few hue families (muscle / sensor / gut / armour /
  structural) so a body's cell-types read at a glance. Lineage becomes a *subtle*
  secondary tint, not the loud per-lineage confetti we have now.
- **Dark-rim soft blobs → replaces both hard dots and hairlines.** And at wide zoom,
  render **a body as ONE silhouette** — a metaball/union of its bonded cells with a
  single dark rim — so it reads as one creature, not a scatter of dots. This fixes
  "is that one body or twenty?".
- **LOD is our version of selective detail.** Bonds and synapse wiring are a
  *close-up* feature, not a wide-shot one:
  - **world zoom** — bodies as muted soft silhouettes; a few highlighted (tracked /
    acting).
  - **body zoom** — cells as class-coloured, dark-rimmed blobs.
  - **cell zoom / debug** — bonds, wiring, per-cell material, field values.
  Match detail to zoom and the scratchy tangle simply disappears at altitude.
- **Medium as substance → render the fields as textured broth** (chemical, grit,
  flow), muted, so bodies sit *in* a material, not on a void.
- **We add what he cannot: motion legibility.** He *implies* process; we *have* it.
  Compose so the dynamics read as events — a gait's travel, a consumption glow, a
  division flash — rather than as shimmer. A body that is only twitching should look
  different from one that is travelling.

## Palette

Muted, desaturated, cohesive — earthy greens/blues/greys/mauves for the crowd and
the medium; **one or two saturated accents held in reserve** for energy transfer, the
tracked creature, and danger. Never neon everywhere. Value and the dark rim do the
structural work; colour does the *semantic* work (class + event), sparingly.

## What this fixes (our named failure modes)

- **"fizzing dots / TV snow"** → soft dark-rimmed blobs + muted crowd + LOD.
- **"scratchy tangle" of bonds/synapses** → wiring only at close zoom.
- **"is that one creature or a loose scatter?"** → body-as-one-silhouette at wide zoom.
- **dead-looking void** → the medium rendered as textured substance; crowding.
- **per-lineage confetti** → categorical colour by material; lineage as subtle tint.

## The deeper resonance (why this grammar fits *us*)

Goodsell's thesis is that life is crowded lawful machinery with no homunculus —
function emerges from packed physical parts, no magic. That is our First Law at a
different scale: behaviour emerges from packed cells under physics, nothing declared.
So render life as a crowded lawful mass and let the viewer *read the machinery
emerging* — do not label it. Aesthetic and philosophy are the same commitment.

## Status — first pass IMPLEMENTED in world.html

Done:

- **Muted cohesive palette.** Desaturated teal/amber/mauve/grey replacing the
  previous near-neon. The categorical hue still says what a cell is, quietly.
- **Soft matte fill + dark thin rim.** The fill shades slightly toward the rim so
  a cell reads as volume without any specular trick — depth from value, not gloss.
- **Mute the crowd, colour the story.** Saturation and brightness are held back
  and spent on the animal under inspection, which lifts out of the field. The
  renderer knows the selection through the assembly uid carried in the cell meta.
- **LOD toward silhouette.** Cells grow and soften as you pull back so a body
  merges into one shape rather than fizzing into specks; detail returns as you
  descend. Tuned once already — the first attempt over-softened and dissolved the
  units into haze, losing exactly what the dark rim is for. Goodsell's blobs are
  soft AND discrete.
- **Medium as substance.** The field renders as textured broth beneath the
  bodies rather than a void.

Not yet:

- **True body-as-one-silhouette** (a metaball union of bonded cells with a single
  outer rim). The LOD above approximates it; it does not compute it.
- **Lineage as a subtle secondary tint.**
- **Event accents** — a feeding contact, a division, a gripping foot. These are
  the "colour the story" cases that most need saturation, and none is drawn yet.
- **Wiring/bonds as a close-up-only feature.** Bonds still draw at all zooms.

Credit line still to carry when this ships: *"Visual language informed by David S.
Goodsell's The Machinery of Life."*
